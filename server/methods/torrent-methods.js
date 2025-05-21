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
    
    try {
      // Safer way to check for existing torrent without using parse-torrent
      let existingTorrent = null;
      
      // Instead of trying to parse the magnetUri, try to extract the infoHash directly
      const infoHashMatch = magnetUri.match(/xt=urn:btih:([a-zA-Z0-9]+)/);
      if (infoHashMatch && infoHashMatch[1]) {
        const infoHash = infoHashMatch[1].toLowerCase();
        existingTorrent = WebTorrentServer.getTorrent(infoHash);
        
        if (existingTorrent) {
          console.log(`Torrent with infoHash ${infoHash} already exists in client, returning existing instance`);
          return {
            infoHash: existingTorrent.infoHash,
            name: existingTorrent.name,
            magnetURI: existingTorrent.magnetURI
          };
        }
      }
      
      const result = await WebTorrentServer.addTorrent(magnetUri);
      
      // Update metadata
      if (Object.keys(metadata).length > 0) {
        try {
          await Meteor.callAsync('torrents.updateMeta', result.infoHash, metadata);
        } catch (metaError) {
          console.error('Error updating metadata:', metaError);
        }
      }
      
      return {
        infoHash: result.infoHash,
        name: result.name,
        magnetURI: result.magnetURI
      };
    } catch (error) {
      console.error('Error adding torrent:', error);
      throw new Meteor.Error('add-failed', error.message || 'Failed to add torrent');
    }
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
    
    try {
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
    } catch (error) {
      console.error('Error creating torrent:', error);
      throw new Meteor.Error('create-failed', error.message || 'Failed to create torrent');
    }
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
    
    console.log(`Received request for all file contents of torrent: ${infoHash}`);
    
    try {
      // Check if the torrent exists in the database first
      const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
      
      if (!torrentRecord) {
        console.error(`Torrent ${infoHash} not found in database`);
        throw new Meteor.Error('not-found', 'Torrent not found in database');
      }
      
      console.log(`Found torrent in database: ${torrentRecord.name}, checking if it exists in WebTorrent client`);
      
      // Make sure the torrent is properly loaded in the client
      let torrent = WebTorrentServer.getTorrent(infoHash);
      
      // If torrent not in client or has no files, try to reload it
      if (!torrent || !torrent.files || torrent.files.length === 0) {
        if (!torrentRecord.magnetURI) {
          throw new Meteor.Error('missing-magnet', 'Torrent record has no magnet URI');
        }
        
        console.log(`Torrent ${infoHash} not properly loaded, reloading from magnet URI`);
        
        // Force recreate with proper paths and options
        if (torrent) {
          // Remove existing torrent first to avoid "duplicate" error
          await WebTorrentServer.removeTorrent(infoHash, false);
        }
        
        // Add with proper storage path
        const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
        const port = process.env.PORT || 3000;
        const realStoragePath = storagePath.replace(/\${PORT}/g, port);
        
        console.log(`Using resolved storage path: ${realStoragePath}`);
        
        torrent = await WebTorrentServer.addTorrent(torrentRecord.magnetURI, {
          path: realStoragePath,
          store: true
        });
        
        // Wait a bit for torrent to fully initialize
        await new Promise(r => Meteor.setTimeout(r, 3000));
        
        // Get fresh reference
        torrent = WebTorrentServer.getTorrent(infoHash);
        
        if (!torrent) {
          throw new Meteor.Error('load-failed', 'Failed to load torrent after retry');
        }
        
        if (!torrent.files || torrent.files.length === 0) {
          console.log(`Torrent reload completed but still has 0 files. Checking disk...`);
          
          // Check if files exist on disk directly
          const fs = Npm.require('fs');
          const path = Npm.require('path');
          
          if (torrentRecord.files && torrentRecord.files.length > 0) {
            const fileContents = {};
            
            for (const fileInfo of torrentRecord.files) {
              const filePath = path.join(realStoragePath, fileInfo.name);
              console.log(`Checking for file on disk: ${filePath}`);
              
              try {
                if (fs.existsSync(filePath)) {
                  console.log(`Found file on disk: ${filePath}`);
                  fileContents[fileInfo.name] = fs.readFileSync(filePath, 'utf8');
                }
              } catch (readErr) {
                console.error(`Error reading file ${filePath}:`, readErr);
              }
            }
            
            if (Object.keys(fileContents).length > 0) {
              console.log(`Found ${Object.keys(fileContents).length} files on disk directly`);
              return fileContents;
            }
          }
          
          throw new Meteor.Error('no-files', 'Torrent loaded but contains no files');
        }
        
        console.log(`Torrent reloaded successfully with ${torrent.files.length} files`);
      }
      
      console.log(`Found torrent ${infoHash} with ${torrent.files.length} files, retrieving content...`);
      
      // Process files with better error handling
      const filePromises = torrent.files.map(function(file) {
        return new Promise(function(resolveFile, rejectFile) {
          console.log(`Getting buffer for file: ${file.name} (${file.length} bytes)`);
          
          let timeout = null;
          
          // Add timeout for getBuffer call
          timeout = Meteor.setTimeout(() => {
            console.error(`Timeout getting buffer for ${file.name}`);
            rejectFile(new Error(`Timeout getting buffer for ${file.name}`));
          }, 30000);
          
          file.getBuffer(function(err, buffer) {
            clearTimeout(timeout);
            
            if (err) {
              console.error(`Error getting buffer for ${file.name}:`, err);
              rejectFile(err);
            } else {
              try {
                const content = buffer.toString('utf8');
                console.log(`Successfully got content for ${file.name}, length: ${content.length}`);
                resolveFile({ name: file.name, content });
              } catch (e) {
                console.error(`Error converting buffer for ${file.name}:`, e);
                rejectFile(e);
              }
            }
          });
        });
      });
      
      const results = await Promise.allSettled(filePromises);
      const contents = {};
      
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          contents[result.value.name] = result.value.content;
        } else {
          console.error(`Failed to get file:`, result.reason);
        }
      });
      
      const fileCount = Object.keys(contents).length;
      console.log(`Successfully retrieved contents for ${fileCount}/${torrent.files.length} files`);
      
      if (fileCount === 0) {
        throw new Meteor.Error('retrieval-failed', 'Could not retrieve any file contents');
      }
      
      return contents;
    } catch (error) {
      console.error(`Error getting file contents for torrent ${infoHash}:`, error);
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
  'torrents.pause': async function(infoHash) {
    check(infoHash, String);
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    if (!torrent) {
      // Try to repair torrent by reloading it
      try {
        console.log('Torrent not found in client, attempting to reload it');
        const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
        
        if (!torrentRecord) {
          throw new Meteor.Error('not-found', 'Torrent not found in database');
        }
        
        if (torrentRecord.magnetURI) {
          await WebTorrentServer.addTorrent(torrentRecord.magnetURI);
          // Try to get the torrent again after adding it
          const reloadedTorrent = WebTorrentServer.getTorrent(infoHash);
          if (!reloadedTorrent) {
            throw new Meteor.Error('load-failed', 'Failed to load torrent');
          }
          
          reloadedTorrent.pause();
          
          // Update status in collection
          await TorrentsCollection.updateAsync(
            { infoHash },
            { $set: { 'status.state': 'paused' } }
          );
          
          return true;
        } else {
          throw new Meteor.Error('no-magnet', 'Torrent record has no magnet URI');
        }
      } catch (error) {
        console.error('Error reloading torrent:', error);
        throw new Meteor.Error('reload-failed', 'Failed to reload torrent: ' + error.message);
      }
    }
    
    console.log('Pausing torrent:', infoHash);
    torrent.pause();
    
    // Update status in collection
    await TorrentsCollection.updateAsync(
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
  'torrents.resume': async function(infoHash) {
    check(infoHash, String);
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    if (!torrent) {
      // Try to repair torrent by reloading it
      try {
        console.log('Torrent not found in client, attempting to reload it');
        const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
        
        if (!torrentRecord) {
          throw new Meteor.Error('not-found', 'Torrent not found in database');
        }
        
        if (torrentRecord.magnetURI) {
          await WebTorrentServer.addTorrent(torrentRecord.magnetURI);
          // The torrent will start downloading automatically
          
          // Update status in collection
          await TorrentsCollection.updateAsync(
            { infoHash },
            { $set: { 'status.state': 'downloading' } }
          );
          
          return true;
        } else {
          throw new Meteor.Error('no-magnet', 'Torrent record has no magnet URI');
        }
      } catch (error) {
        console.error('Error reloading torrent:', error);
        throw new Meteor.Error('reload-failed', 'Failed to reload torrent: ' + error.message);
      }
    }
    
    console.log('Resuming torrent:', infoHash);
    torrent.resume();
    
    // Update status in collection
    await TorrentsCollection.updateAsync(
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
    
    // Make sure torrent exists - use findOneAsync
    const torrent = await TorrentsCollection.findOneAsync({ infoHash });
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    // Use updateAsync
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