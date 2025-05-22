// server/methods/torrent-methods.js - Fixed version with proper file persistence

import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import fs from 'fs';
import path from 'path';
import { WebTorrentServer } from '../webtorrent-server';
import { TorrentsCollection } from '/imports/api/torrents/torrents';
import { Settings } from '/imports/api/settings/settings';
import { FhirUtils } from '/imports/api/fhir/fhir-utils';

// Helper function to resolve storage path with proper PORT substitution
function getResolvedStoragePath() {
  const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
  const port = process.env.PORT || 3000;
  return storagePath.replace(/\$\{PORT\}/g, port);
}

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
      
      // Pass resolved storage path
      const resolvedPath = getResolvedStoragePath();
      const result = await WebTorrentServer.addTorrent(magnetUri, {
        path: resolvedPath
      });
      
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
      // Get resolved storage path
      const resolvedPath = getResolvedStoragePath();
      
      // Create a permanent directory for this torrent using the name (sanitized)
      const sanitizedName = name.replace(/[^a-z0-9_-]/gi, '_');
      const torrentDir = path.join(resolvedPath, `${sanitizedName}_${Date.now()}`);
      
      console.log(`Creating torrent directory: ${torrentDir}`);
      
      if (!fs.existsSync(torrentDir)) {
        fs.mkdirSync(torrentDir, { recursive: true });
      }
      
      // Write files directly to the torrent directory (these will be PERMANENT)
      const torrentFiles = [];
      
      fileData.forEach(function(file) {
        const filePath = path.join(torrentDir, file.name);
        fs.writeFileSync(filePath, file.data, 'utf8');
        torrentFiles.push(filePath);
        console.log(`Written file to permanent location: ${filePath} (${file.data.length} bytes)`);
      });
      
      // Create the torrent using the permanent directory
      const result = await WebTorrentServer.createTorrent(torrentDir, {
        name: name,
        comment: metadata.description || '',
        path: resolvedPath  // This is where WebTorrent will look for files during seeding
      });
      
      console.log(`Torrent created successfully with ${torrentFiles.length} files in permanent directory: ${torrentDir}`);
      
      // Update metadata directly
      if (Object.keys(metadata).length > 0) {
        try {
          await new Promise(resolve => Meteor.setTimeout(resolve, 500));
          
          const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash: result.infoHash });
          
          if (torrentRecord) {
            const updateObj = {};
            const allowedFields = ['description', 'fhirType', 'meta'];
            Object.keys(metadata).forEach(function(key) {
              if (allowedFields.includes(key)) {
                updateObj[key] = metadata[key];
              }
            });
            
            // Also store the permanent directory path for future reference
            updateObj.torrentDirectory = torrentDir;
            
            if (Object.keys(updateObj).length > 0) {
              await TorrentsCollection.updateAsync(
                { infoHash: result.infoHash },
                { $set: updateObj }
              );
              console.log(`Updated torrent metadata and stored directory path: ${torrentDir}`);
            }
          }
        } catch (err) {
          console.error('Error updating torrent metadata:', err);
        }
      }
      
      return {
        infoHash: result.infoHash,
        name: result.name,
        magnetURI: result.magnetURI,
        torrentDirectory: torrentDir
      };
    } catch (error) {
      console.error('Error creating torrent:', error);
      throw new Meteor.Error('create-failed', error.message || 'Failed to create torrent');
    }
  },
  
  /**
   * Get all file contents from a torrent - Enhanced version with improved disk fallback
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
      
      console.log(`Found torrent in database: ${torrentRecord.name}, checking WebTorrent client`);
      
      let torrent = WebTorrentServer.getTorrent(infoHash);
      
      // If torrent exists and has files, try to get them via WebTorrent first (but with shorter timeout)
      if (torrent && torrent.files && torrent.files.length > 0) {
        console.log(`Found torrent ${infoHash} with ${torrent.files.length} files, trying WebTorrent retrieval...`);
        
        try {
          // Try with shorter timeout for faster fallback
          const filePromises = torrent.files.map(function(file, index) {
            return new Promise(function(resolveFile, rejectFile) {
              console.log(`Getting buffer for file: ${file.name} (${file.length} bytes)`);
              
              // Much shorter timeout for WebTorrent method - fail fast and use disk
              const timeout = Meteor.setTimeout(() => {
                console.log(`WebTorrent timeout for ${file.name}, will try disk fallback`);
                rejectFile(new Error(`WebTorrent timeout for ${file.name}`));
              }, 2000); // Only wait 2 seconds
              
              file.getBuffer(function(err, buffer) {
                clearTimeout(timeout);
                
                if (err) {
                  console.log(`WebTorrent error for ${file.name}:`, err.message);
                  rejectFile(err);
                } else {
                  try {
                    const content = buffer.toString('utf8');
                    console.log(`WebTorrent success for ${file.name}, length: ${content.length}`);
                    resolveFile({ name: file.name, content });
                  } catch (e) {
                    console.error(`Buffer conversion error for ${file.name}:`, e);
                    rejectFile(e);
                  }
                }
              });
            });
          });
          
          const results = await Promise.allSettled(filePromises);
          const webTorrentContents = {};
          
          results.forEach(result => {
            if (result.status === 'fulfilled') {
              webTorrentContents[result.value.name] = result.value.content;
            }
          });
          
          // If we got all files via WebTorrent, return them
          if (Object.keys(webTorrentContents).length === torrent.files.length) {
            console.log(`Successfully retrieved all ${torrent.files.length} files via WebTorrent`);
            return webTorrentContents;
          } else {
            console.log(`Only got ${Object.keys(webTorrentContents).length}/${torrent.files.length} files via WebTorrent, trying disk fallback`);
          }
        } catch (webTorrentError) {
          console.log(`WebTorrent retrieval failed, trying disk fallback:`, webTorrentError.message);
        }
      } else {
        console.log(`Torrent not found in client or has no files, going straight to disk fallback`);
      }
      
      // Enhanced disk fallback with stored torrent directory
      console.log(`Attempting enhanced disk fallback for torrent ${infoHash}`);
      
      const resolvedPath = getResolvedStoragePath();
      console.log(`Using storage path: ${resolvedPath}`);
      
      if (!fs.existsSync(resolvedPath)) {
        console.log(`Storage path does not exist: ${resolvedPath}`);
        throw new Meteor.Error('storage-missing', 'Storage directory does not exist');
      }
      
      const diskContents = {};
      
      // Build list of possible paths to check, including the stored torrent directory
      const possiblePaths = [
        resolvedPath, // Base storage path
        path.join(resolvedPath, torrentRecord.name || ''), // Subfolder with torrent name
        path.join(resolvedPath, infoHash), // Subfolder with info hash
      ];
      
      // If we have a stored torrent directory, check that first
      if (torrentRecord.torrentDirectory && fs.existsSync(torrentRecord.torrentDirectory)) {
        possiblePaths.unshift(torrentRecord.torrentDirectory);
        console.log(`Added stored torrent directory to search paths: ${torrentRecord.torrentDirectory}`);
      }
      
      // Also check for any directories in the storage path that might contain our files
      try {
        const storageContents = fs.readdirSync(resolvedPath);
        storageContents.forEach(item => {
          const fullPath = path.join(resolvedPath, item);
          if (fs.statSync(fullPath).isDirectory()) {
            // If this directory name contains part of our torrent name or hash, check it
            const sanitizedName = torrentRecord.name ? torrentRecord.name.replace(/[^a-z0-9_-]/gi, '_') : '';
            if (item.includes(sanitizedName) || item.includes(infoHash)) {
              possiblePaths.push(fullPath);
              console.log(`Added potential torrent directory to search: ${fullPath}`);
            }
          }
        });
      } catch (dirErr) {
        console.warn('Error reading storage directory:', dirErr);
      }
      
      console.log(`Checking ${possiblePaths.length} possible paths for files`);
      
      if (torrentRecord.files && torrentRecord.files.length > 0) {
        for (const fileInfo of torrentRecord.files) {
          let found = false;
          
          for (const basePath of possiblePaths) {
            const filePath = path.join(basePath, fileInfo.name);
            console.log(`Checking for file: ${filePath}`);
            
            try {
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                diskContents[fileInfo.name] = content;
                console.log(`Found file on disk: ${fileInfo.name} (${content.length} bytes) at ${filePath}`);
                found = true;
                break;
              }
            } catch (readErr) {
              console.error(`Error reading file ${filePath}:`, readErr.message);
            }
          }
          
          if (!found) {
            console.log(`File not found on disk: ${fileInfo.name}`);
          }
        }
      }
      
      // If we found files on disk, return them
      if (Object.keys(diskContents).length > 0) {
        console.log(`Found ${Object.keys(diskContents).length} files on disk`);
        return diskContents;
      }
      
      // Last resort: Try to create sample content if this is the sample torrent
      if (torrentRecord.name === 'Sample FHIR Bundle') {
        console.log('Attempting to recreate sample content');
        try {
          const sampleData = await Assets.getTextAsync('sample-bundle.json');
          if (sampleData) {
            console.log('Found sample bundle in assets, returning it');
            return {
              'sample-bundle.json': sampleData
            };
          }
        } catch (assetErr) {
          console.error('Error reading sample bundle from assets:', assetErr);
        }
      }
      
      throw new Meteor.Error('no-content', 'Could not retrieve file contents via WebTorrent, disk, or assets');
      
    } catch (error) {
      console.error(`Error getting file contents for torrent ${infoHash}:`, error);
      throw new Meteor.Error(
        error.error || 'error', 
        error.reason || error.message || 'Unknown error'
      );
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
      // Get torrent record to check for torrent directory before removing
      const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
      
      const result = await WebTorrentServer.removeTorrent(infoHash, removeFiles);
      
      // If removeFiles is true and we have a stored torrent directory, clean it up
      if (removeFiles && torrentRecord && torrentRecord.torrentDirectory) {
        try {
          if (fs.existsSync(torrentRecord.torrentDirectory)) {
            // Remove all files in the directory
            const files = fs.readdirSync(torrentRecord.torrentDirectory);
            files.forEach(file => {
              const filePath = path.join(torrentRecord.torrentDirectory, file);
              fs.unlinkSync(filePath);
            });
            
            // Remove the directory
            fs.rmdirSync(torrentRecord.torrentDirectory);
            console.log(`Cleaned up torrent directory: ${torrentRecord.torrentDirectory}`);
          }
        } catch (cleanupErr) {
          console.error('Error cleaning up torrent directory:', cleanupErr);
        }
      }
      
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
   * Pause a torrent
   */
  'torrents.pause': async function(infoHash) {
    check(infoHash, String);
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    if (!torrent) {
      try {
        console.log('Torrent not found in client, attempting to reload it');
        const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
        
        if (!torrentRecord) {
          throw new Meteor.Error('not-found', 'Torrent not found in database');
        }
        
        if (torrentRecord.magnetURI) {
          const resolvedPath = getResolvedStoragePath();
          await WebTorrentServer.addTorrent(torrentRecord.magnetURI, {
            path: resolvedPath
          });
          
          const reloadedTorrent = WebTorrentServer.getTorrent(infoHash);
          if (!reloadedTorrent) {
            throw new Meteor.Error('load-failed', 'Failed to load torrent');
          }
          
          if (typeof reloadedTorrent.pause === 'function') {
            reloadedTorrent.pause();
          }
          
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
    if (typeof torrent.pause === 'function') {
      torrent.pause();
    }
    
    await TorrentsCollection.updateAsync(
      { infoHash },
      { $set: { 'status.state': 'paused' } }
    );
    
    return true;
  },
  
  /**
   * Resume a torrent
   */
  'torrents.resume': async function(infoHash) {
    check(infoHash, String);
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    if (!torrent) {
      try {
        console.log('Torrent not found in client, attempting to reload it');
        const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
        
        if (!torrentRecord) {
          throw new Meteor.Error('not-found', 'Torrent not found in database');
        }
        
        if (torrentRecord.magnetURI) {
          const resolvedPath = getResolvedStoragePath();
          await WebTorrentServer.addTorrent(torrentRecord.magnetURI, {
            path: resolvedPath
          });
          
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
    if (typeof torrent.resume === 'function') {
      torrent.resume();
    }
    
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
    
    const allowedFields = ['description', 'fhirType', 'meta', 'torrentDirectory'];
    const updateObj = {};
    
    Object.keys(metadata).forEach(function(key) {
      if (allowedFields.includes(key)) {
        updateObj[key] = metadata[key];
      }
    });
    
    const torrent = await TorrentsCollection.findOneAsync({ infoHash });
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
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
    
    const torrent = await TorrentsCollection.findOneAsync({ infoHash });
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found');
    }
    
    return await TorrentsCollection.updateAsync(
      { infoHash }, 
      { $set: { meta: fhirMeta } }
    );
  }
});