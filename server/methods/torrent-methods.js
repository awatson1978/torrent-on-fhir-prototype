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
  'torrents.add': function(magnetUri, metadata = {}) {
    check(magnetUri, String);
    check(metadata, Object);
    
    console.log('Adding torrent from magnet URI:', magnetUri);
    
    // This is a blocking operation, but we need to wait for the torrent to be added
    const result = Promise.await(WebTorrentServer.addTorrent(magnetUri));
    
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
  'torrents.create': function(name, fileData, metadata = {}) {
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
    const result = Promise.await(WebTorrentServer.createTorrent(tempPath, {
      name: name,
      comment: metadata.description || ''
    }));
    
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
   * Remove a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @param {Boolean} removeFiles - Whether to remove downloaded files
   * @return {Boolean} Success
   */
  'torrents.remove': function(infoHash, removeFiles = false) {
    check(infoHash, String);
    check(removeFiles, Boolean);
    
    console.log('Removing torrent:', infoHash, 'with files:', removeFiles);
    
    return Promise.await(WebTorrentServer.removeTorrent(infoHash, removeFiles));
  },
  
  /**
   * Get file contents from a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @param {String} filename - Name of the file to get
   * @return {String} File contents
   */
  'torrents.getFileContents': function(infoHash, filename) {
    check(infoHash, String);
    check(filename, String);
    
    return Promise.await(WebTorrentServer.getFileContents(infoHash, filename));
  },
  
  /**
   * Get all file contents from a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @return {Object} Object with filename keys and content values
   */
  'torrents.getAllFileContents': function(infoHash) {
    check(infoHash, String);
    
    return Promise.await(WebTorrentServer.getAllFileContents(infoHash));
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
  'torrents.updateMeta': function(infoHash, metadata) {
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
    
    // Make sure torrent exists
    const torrent = TorrentsCollection.findOne({ infoHash });
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    return TorrentsCollection.update({ infoHash }, { $set: updateObj });
  },
  
  /**
   * Update FHIR metadata for a torrent
   * @param {String} infoHash - The torrent info hash
   * @param {Object} fhirMeta - FHIR metadata
   */
  'torrents.updateFhirMeta': function(infoHash, fhirMeta) {
    check(infoHash, String);
    check(fhirMeta, {
      fhirVersion: String,
      resourceCount: Number,
      profile: Match.Optional(String)
    });
    
    // Make sure torrent exists
    const torrent = TorrentsCollection.findOne({ infoHash });
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    return TorrentsCollection.update(
      { infoHash }, 
      { $set: { meta: fhirMeta } }
    );
  }
});