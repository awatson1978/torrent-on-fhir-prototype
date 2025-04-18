import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import fs from 'fs';
import path from 'path';
import { WebTorrentServer } from '../webtorrent-server';
import { TorrentsCollection } from '/imports/api/torrents/torrents';
import { Settings } from '/imports/api/settings/settings';
import { FhirUtils } from '/imports/api/fhir/fhir-utils';

Meteor.methods({
  /**
   * Add a torrent from a magnet URI
   * @param {String} magnetUri - Magnet URI of the torrent
   * @param {Object} metadata - Additional metadata
   * @return {Object} Added torrent info
  */
  'torrents.add': async function(magnetUri, metadata = {}) {
    check(magnetUri, String);
    check(metadata, Object);
    
    console.log('Adding torrent from magnet URI:', magnetUri);
    
    const result = await WebTorrentServer.addTorrent(magnetUri);
      
    // Update metadata
    if (Object.keys(metadata).length > 0) {
      Meteor.call('torrents.updateMeta', result.infoHash, metadata);
    }
    
    return {
      infoHash: result.infoHash,
      name: result.name,
      magnetURI: result.magnetURI
    };
  },
  
  /**
   * Create a torrent from uploaded file data
   * @param {String} name - Name for the torrent
   * @param {Array} fileData - Array of { name, data } objects
   * @param {Object} metadata - Additional metadata
   * @return {Object} Created torrent info
   */
  'torrents.create': async function(name, fileData, metadata = {}) {
    check(name, String);
    check(fileData, Array);
    check(metadata, Object);
    
    console.log('Creating torrent:', name, 'with', fileData.length, 'files');
    
    // Validate FHIR files
    for (const file of fileData) {
      const format = FhirUtils.detectFormat(file.data);
      
      if (format === 'unknown') {
        throw new Meteor.Error('invalid-format', `File ${file.name} doesn't appear to be valid FHIR content.`);
      }
      
      // Make sure format matches selected type
      if (metadata.fhirType === 'bundle' && format !== 'bundle') {
        throw new Meteor.Error('format-mismatch', `File ${file.name} is not a FHIR Bundle but you selected Bundle type.`);
      }
      
      if (metadata.fhirType === 'ndjson' && format !== 'ndjson') {
        throw new Meteor.Error('format-mismatch', `File ${file.name} is not NDJSON but you selected NDJSON type.`);
      }
    }
    
    // Write the files to disk temporarily
    const tempPath = path.join(Settings.get('private.storage.tempPath', '/tmp/fhir-torrents'), `temp-${Date.now()}`);
    
    if (!fs.existsSync(tempPath)) {
      fs.mkdirSync(tempPath, { recursive: true });
    }
    
    const tempFiles = [];
    
    fileData.forEach(function(file) {
      const filePath = path.join(tempPath, file.name);
      fs.writeFileSync(filePath, file.data);
      tempFiles.push(filePath);
    });
    
    // Create the torrent
    const result = await WebTorrentServer.createTorrent(tempPath, {
      name: name,
      comment: metadata.description || ''
    });
    
    // Clean up temp files (after a delay to ensure the torrent is created)
    Meteor.setTimeout(function() {
      tempFiles.forEach(function(file) {
        try {
          fs.unlinkSync(file);
        } catch (e) {
          console.error('Error removing temp file:', e);
        }
      });
      
      try {
        fs.rmdirSync(tempPath);
      } catch (e) {
        console.error('Error removing temp directory:', e);
      }
    }, 5000);
    
    // Instead of calling updateMeta, directly update the torrent record here
    // This ensures we're working with a torrent that exists in the database
    if (Object.keys(metadata).length > 0) {
      try {
        // Wait a bit for the torrent to be saved to the database
        await new Promise(resolve => Meteor.setTimeout(resolve, 500));
        
        // Check if torrent exists in database
        const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash: result.infoHash });
        
        if (torrentRecord) {
          // Update with metadata
          const updateObj = {};
          
          // Only include allowed fields
          const allowedFields = ['description', 'fhirType', 'meta'];
          Object.keys(metadata).forEach(function(key) {
            if (allowedFields.includes(key)) {
              updateObj[key] = metadata[key];
            }
          });
          
          if (Object.keys(updateObj).length > 0) {
            await TorrentsCollection.updateAsync(
              { infoHash: result.infoHash },
              { $set: updateObj }
            );
          }
        } else {
          console.log(`Torrent with infoHash ${result.infoHash} not found in database yet.`);
        }
      } catch (err) {
        console.error('Error updating torrent metadata:', err);
        // Don't throw the error, just log it - we still want to return the torrent info
      }
    }
    
    return {
      infoHash: result.infoHash,
      name: result.name,
      magnetURI: result.magnetURI
    };
  },
  
  /**
   * Remove a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @param {Boolean} removeFiles - Whether to remove downloaded files
   * @return {Boolean} Success
   */
  'torrents.remove': async function(infoHash, removeFiles = false) {
    check(infoHash, String);
    check(removeFiles, Boolean);
    
    try {
      const result = await WebTorrentServer.removeTorrent(infoHash, removeFiles);
      return result;
    } catch (error) {
      throw new Meteor.Error('remove-failed', error.message || 'Failed to remove torrent');
    }
  },
  
  /**
   * Get file contents from a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @param {String} filename - Name of the file to get
   * @return {String} File contents
   */
  'torrents.getFileContents': async function(infoHash, filename) {
    check(infoHash, String);
    check(filename, String);
    
    try {
      const content = await WebTorrentServer.getFileContents(infoHash, filename);
      return content;
    } catch (error) {
      throw new Meteor.Error(
        error.error || 'error', 
        error.reason || error.message || 'Failed to get file contents'
      );
    }
  },
  
  /**
   * Get all file contents from a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @return {Object} Object with filename keys and content values
   */
  'torrents.getAllFileContents': async function(infoHash) {
    check(infoHash, String);
    
    try {
      const contents = await WebTorrentServer.getAllFileContents(infoHash);
      return contents;
    } catch (error) {
      // Properly throw the error for the client
      throw new Meteor.Error(
        error.error || 'error', 
        error.reason || error.message || 'Unknown error'
      );
    }
  },
  
  /**
   * Pause a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @return {Boolean} Success
   */
  'torrents.pause': function(infoHash) {
    check(infoHash, String);
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    console.log('Pausing torrent:', infoHash);
    torrent.pause();
    
    // Update status in collection
    TorrentsCollection.update(
      { infoHash },
      { $set: { 'status.state': 'paused' } }
    );
    
    return true;
  },
  
  /**
   * Resume a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @return {Boolean} Success
   */
  'torrents.resume': function(infoHash) {
    check(infoHash, String);
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    console.log('Resuming torrent:', infoHash);
    torrent.resume();
    
    // Update status in collection
    TorrentsCollection.update(
      { infoHash },
      { $set: { 'status.state': torrent.done ? 'seeding' : 'downloading' } }
    );
    
    return true;
  },
  
  /**
   * Update torrent metadata
   * @param {String} infoHash - The torrent info hash
   * @param {Object} metadata - Metadata to update
   */
  'torrents.updateMeta': async function(infoHash, metadata) {
    check(infoHash, String);
    check(metadata, Object);
    
    // Fields that can be updated
    const allowedFields = ['description', 'fhirType', 'meta'];
    
    // Build update object with only allowed fields
    const updateObj = {};
    
    Object.keys(metadata).forEach(function(key) {
      if (allowedFields.includes(key)) {
        updateObj[key] = metadata[key];
      }
    });
    
    // Make sure torrent exists - use findOneAsync instead of findOne
    const torrent = await TorrentsCollection.findOneAsync({ infoHash });
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    // Use updateAsync instead of update
    return await TorrentsCollection.updateAsync(
      { infoHash }, 
      { $set: updateObj }
    );
  },
  
  /**
   * Update FHIR metadata for a torrent
   * @param {String} infoHash - The torrent info hash
   * @param {Object} fhirMeta - FHIR metadata
   */
  'torrents.updateFhirMeta': async function(infoHash, fhirMeta) {
    check(infoHash, String);
    check(fhirMeta, {
      fhirVersion: String,
      resourceCount: Number,
      profile: Match.Optional(String)
    });
    
    // Make sure torrent exists - use findOneAsync
    const torrent = await TorrentsCollection.findOneAsync({ infoHash });
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    // Use updateAsync
    return await TorrentsCollection.updateAsync(
      { infoHash }, 
      { $set: { meta: fhirMeta } }
    );
  }
});