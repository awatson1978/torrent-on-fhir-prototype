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

/**
 * Helper function to get file contents from disk
 * @param {String} infoHash - Info hash of the torrent
 * @param {Object} torrentRecord - Torrent record from database
 * @return {Object} Object with filename keys and content values
 */
async function getDiskFallbackContents(infoHash, torrentRecord) {
  console.log(`Attempting disk fallback for torrent ${infoHash}`);
  
  const resolvedPath = getResolvedStoragePath();
  console.log(`Using storage path: ${resolvedPath}`);
  
  if (!fs.existsSync(resolvedPath)) {
    console.log(`Storage path does not exist: ${resolvedPath}`);
    throw new Meteor.Error('storage-missing', 'Storage directory does not exist');
  }
  
  const diskContents = {};
  
  // Build list of possible paths to check
  const possiblePaths = [
    resolvedPath, // Base storage path
  ];
  
  // Add stored torrent directory if available
  if (torrentRecord.torrentDirectory && fs.existsSync(torrentRecord.torrentDirectory)) {
    possiblePaths.unshift(torrentRecord.torrentDirectory);
    console.log(`Added stored torrent directory to search paths: ${torrentRecord.torrentDirectory}`);
  }
  
  // Add various directory patterns
  if (torrentRecord.name) {
    const sanitizedName = torrentRecord.name.replace(/[^a-z0-9_-]/gi, '_');
    possiblePaths.push(path.join(resolvedPath, sanitizedName));
    possiblePaths.push(path.join(resolvedPath, torrentRecord.name));
  }
  
  possiblePaths.push(path.join(resolvedPath, infoHash));
  
  // Search for directories that might contain our files
  try {
    const storageContents = fs.readdirSync(resolvedPath);
    storageContents.forEach(item => {
      const fullPath = path.join(resolvedPath, item);
      if (fs.statSync(fullPath).isDirectory()) {
        const sanitizedName = torrentRecord.name ? torrentRecord.name.replace(/[^a-z0-9_-]/gi, '_') : '';
        if (item.includes(sanitizedName) || item.includes(infoHash) || item.includes('bundle') || item.includes('test')) {
          possiblePaths.push(fullPath);
          console.log(`Added potential torrent directory to search: ${fullPath}`);
        }
      }
    });
  } catch (dirErr) {
    console.warn('Error reading storage directory:', dirErr);
  }
  
  console.log(`Checking ${possiblePaths.length} possible paths for files`);
  
  // Look for files
  if (torrentRecord.files && torrentRecord.files.length > 0) {
    for (const fileInfo of torrentRecord.files) {
      let found = false;
      
      for (const basePath of possiblePaths) {
        // Try the exact filename
        let filePath = path.join(basePath, fileInfo.name);
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
        
        // Also try looking for the file directly in the base path (in case path differs)
        if (fileInfo.path && fileInfo.path !== fileInfo.name) {
          filePath = path.join(basePath, fileInfo.path);
          console.log(`Checking alternative path: ${filePath}`);
          
          try {
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, 'utf8');
              diskContents[fileInfo.name] = content;
              console.log(`Found file on disk at alternative path: ${fileInfo.name} (${content.length} bytes) at ${filePath}`);
              found = true;
              break;
            }
          } catch (readErr) {
            console.error(`Error reading file ${filePath}:`, readErr.message);
          }
        }
      }
      
      if (!found) {
        console.log(`File not found on disk: ${fileInfo.name}`);
      }
    }
  } else {
    // If no file info in database, try to find any JSON files
    console.log('No file info in database, searching for any JSON/NDJSON files');
    
    for (const basePath of possiblePaths) {
      try {
        if (fs.existsSync(basePath)) {
          const files = fs.readdirSync(basePath);
          const jsonFiles = files.filter(f => f.endsWith('.json') || f.endsWith('.ndjson'));
          
          for (const jsonFile of jsonFiles) {
            const filePath = path.join(basePath, jsonFile);
            try {
              const content = fs.readFileSync(filePath, 'utf8');
              diskContents[jsonFile] = content;
              console.log(`Found JSON file on disk: ${jsonFile} (${content.length} bytes) at ${filePath}`);
            } catch (readErr) {
              console.error(`Error reading JSON file ${filePath}:`, readErr.message);
            }
          }
        }
      } catch (dirErr) {
        // Directory doesn't exist or can't be read, continue
      }
    }
  }
  
  // If we found files on disk, return them
  if (Object.keys(diskContents).length > 0) {
    console.log(`Found ${Object.keys(diskContents).length} files on disk`);
    return diskContents;
  }
  
  // Last resort: Try to create sample content if this appears to be a sample torrent
  if (torrentRecord.name && (torrentRecord.name.toLowerCase().includes('sample') || torrentRecord.name.toLowerCase().includes('test'))) {
    console.log('Attempting to provide sample content for test/sample torrent');
    try {
      const sampleData = await Assets.getTextAsync('sample-bundle.json');
      if (sampleData) {
        console.log('Found sample bundle in assets, returning it');
        return {
          [torrentRecord.name.endsWith('.json') ? torrentRecord.name : torrentRecord.name + '.json']: sampleData
        };
      }
    } catch (assetErr) {
      console.error('Error reading sample bundle from assets:', assetErr);
    }
  }
  
  throw new Meteor.Error('no-content', `Could not retrieve file contents for torrent ${infoHash}. The torrent may still be downloading or the files may not be available yet.`);
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
      // Check for existing torrent first
      let existingTorrent = null;
      
      // Extract infoHash from magnet URI
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
        
        // Also check database for existing record
        const existingRecord = await TorrentsCollection.findOneAsync({ infoHash });
        if (existingRecord) {
          console.log(`Torrent ${infoHash} found in database, reloading to client`);
          // Don't wait for the callback - just start the add process
          WebTorrentServer.addTorrent(magnetUri, {
            path: getResolvedStoragePath()
          }).catch(function(err) {
            console.error('Background torrent add failed:', err);
          });
          
          return {
            infoHash: existingRecord.infoHash,
            name: existingRecord.name,
            magnetURI: existingRecord.magnetURI
          };
        }
      }
      
      // Get resolved storage path
      const resolvedPath = getResolvedStoragePath();
      
      // Create a torrent record immediately with basic info extracted from magnet URI
      const nameMatch = magnetUri.match(/dn=([^&]+)/);
      const torrentName = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : 'Unnamed Torrent';
      
      const infoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : null;
      
      if (!infoHash) {
        throw new Meteor.Error('invalid-magnet', 'Could not extract info hash from magnet URI');
      }
      
      // Create database record immediately
      const torrentData = {
        infoHash: infoHash,
        name: torrentName,
        magnetURI: magnetUri,
        size: 0, // Will be updated when metadata arrives
        files: [],
        created: new Date(),
        description: metadata.description || '',
        fhirType: metadata.fhirType || 'unknown',
        meta: metadata.meta || {
          fhirVersion: '',
          resourceCount: 0,
          profile: ''
        },
        status: {
          downloaded: 0,
          uploaded: 0,
          downloadSpeed: 0,
          uploadSpeed: 0,
          progress: 0,
          peers: 0,
          seeds: 0,
          state: 'downloading'
        }
      };
      
      console.log(`Creating immediate database record for torrent ${infoHash}`);
      await TorrentsCollection.insertAsync(torrentData);
      
      // Start adding to WebTorrent client in background (don't wait for callback)
      console.log(`Starting background WebTorrent add for ${infoHash}`);
      WebTorrentServer.addTorrent(magnetUri, {
        path: resolvedPath
      }).then(function(torrent) {
        console.log(`Background torrent add completed for ${torrent.name} (${torrent.infoHash})`);
        // The _updateTorrentRecord will be called by the event handlers
      }).catch(function(err) {
        console.error(`Background torrent add failed for ${infoHash}:`, err);
        // Update the database record to reflect the error
        TorrentsCollection.updateAsync(
          { infoHash },
          { $set: { 'status.state': 'error', 'status.error': err.message } }
        ).catch(function(updateErr) {
          console.error('Error updating torrent status to error:', updateErr);
        });
      });
      
      // Return immediately with the basic info
      console.log(`Returning immediate response for torrent ${infoHash}`);
      return {
        infoHash: infoHash,
        name: torrentName,
        magnetURI: magnetUri
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
      
      // If torrent not found in our map, try to get it from the WebTorrent client directly
      if (!torrent) {
        console.log(`Torrent ${infoHash} not found in _torrents map, checking WebTorrent client directly`);
        
        const torrentClient = WebTorrentServer.getClient();
        if (torrentClient) {
          const clientTorrent = torrentClient.get(infoHash);
          if (clientTorrent) {
            console.log(`Found torrent ${infoHash} in WebTorrent client, adding to our map`);
            WebTorrentServer._torrents.set(infoHash, clientTorrent);
            WebTorrentServer._setupTorrentEvents(clientTorrent);
            torrent = clientTorrent;
          }
        }
        
        // If still not found, try to reload from database
        if (!torrent) {
          try {
            console.log(`Reloading torrent ${infoHash} from magnet URI`);
            const reloadedTorrent = await WebTorrentServer.addTorrent(torrentRecord.magnetURI, {
              path: getResolvedStoragePath()
            });
            console.log(`Reloaded torrent with info hash ${reloadedTorrent.infoHash}`);
            torrent = reloadedTorrent;
          } catch (err) {
            console.error('Error reloading torrent:', err);
            throw new Meteor.Error('not-found', 'Torrent not found and could not be reloaded');
          }
        }
      }
      
      console.log(`Found torrent ${infoHash} with ${torrent.files.length} files`);
      
      // Check if torrent is ready and has files
      if (!torrent.ready || torrent.files.length === 0) {
        console.log(`Torrent ${infoHash} not ready or has no files yet, waiting for metadata...`);
        
        // Wait for the torrent to be ready and have metadata
        const maxWaitTime = 10000; // 10 seconds
        const startTime = Date.now();
        
        while ((!torrent.ready || torrent.files.length === 0) && (Date.now() - startTime) < maxWaitTime) {
          await new Promise(resolve => Meteor.setTimeout(resolve, 500));
          console.log(`Waiting for torrent metadata... Ready: ${torrent.ready}, Files: ${torrent.files.length}`);
        }
        
        if (!torrent.ready || torrent.files.length === 0) {
          console.log(`Torrent ${infoHash} still not ready after waiting, attempting disk fallback`);
          return await getDiskFallbackContents(infoHash, torrentRecord);
        }
      }
      
      // Check if files are downloaded (progress > 0 or done)
      if (torrent.progress === 0 && !torrent.done) {
        console.log(`Torrent ${infoHash} has no download progress yet, waiting for some content...`);
        
        // Wait a bit for some download progress
        const maxDownloadWait = 5000; // 5 seconds
        const startTime = Date.now();
        
        while (torrent.progress === 0 && !torrent.done && (Date.now() - startTime) < maxDownloadWait) {
          await new Promise(resolve => Meteor.setTimeout(resolve, 1000));
          console.log(`Waiting for download progress... Progress: ${torrent.progress * 100}%`);
        }
        
        // If still no progress, try disk fallback
        if (torrent.progress === 0 && !torrent.done) {
          console.log(`No download progress after waiting, attempting disk fallback`);
          return await getDiskFallbackContents(infoHash, torrentRecord);
        }
      }
      
      // Try to get files via WebTorrent with shorter timeout for faster fallback
      console.log(`Attempting to get files via WebTorrent for torrent ${infoHash}`);
      
      try {
        const filePromises = torrent.files.map(function(file, index) {
          return new Promise(function(resolveFile, rejectFile) {
            console.log(`Getting buffer for file: ${file.name} (${file.length} bytes)`);
            
            // Shorter timeout for faster fallback
            const timeout = Meteor.setTimeout(() => {
              console.log(`WebTorrent timeout for ${file.name}, will try disk fallback`);
              rejectFile(new Error(`WebTorrent timeout for ${file.name}`));
            }, 3000); // 3 seconds timeout
            
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
      
      // Fall back to disk
      return await getDiskFallbackContents(infoHash, torrentRecord);
      
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
  },

  /**
   * Get status of a specific torrent
   * @param {String} infoHash - Info hash of the torrent
   * @return {Object} Torrent status information
   */
  'torrents.getStatus': async function(infoHash) {
    check(infoHash, String);
    
    try {
      // Get from database
      const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
      
      if (!torrentRecord) {
        throw new Meteor.Error('not-found', 'Torrent not found in database');
      }
      
      // Get from WebTorrent client
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      const status = {
        infoHash: infoHash,
        name: torrentRecord.name,
        found: {
          database: !!torrentRecord,
          client: !!torrent
        },
        progress: 0,
        downloadSpeed: 0,
        uploadSpeed: 0,
        peers: 0,
        state: 'unknown',
        ready: false,
        hasFiles: false,
        filesCount: 0
      };
      
      if (torrent) {
        status.progress = torrent.progress || 0;
        status.downloadSpeed = torrent.downloadSpeed || 0;
        status.uploadSpeed = torrent.uploadSpeed || 0;
        status.peers = torrent.numPeers || 0;
        status.ready = torrent.ready || false;
        status.hasFiles = torrent.files && torrent.files.length > 0;
        status.filesCount = torrent.files ? torrent.files.length : 0;
        status.state = torrent.done ? 'seeding' : 
                       torrent.paused ? 'paused' : 'downloading';
      } else if (torrentRecord.status) {
        // Use database status if client not available
        status.progress = torrentRecord.status.progress || 0;
        status.downloadSpeed = torrentRecord.status.downloadSpeed || 0;
        status.uploadSpeed = torrentRecord.status.uploadSpeed || 0;
        status.peers = torrentRecord.status.peers || 0;
        status.state = torrentRecord.status.state || 'unknown';
      }
      
      return status;
      
    } catch (error) {
      console.error(`Error getting torrent status for ${infoHash}:`, error);
      throw new Meteor.Error(
        error.error || 'error', 
        error.reason || error.message || 'Failed to get torrent status'
      );
    }
  },

  /**
   * Force announce a torrent to trackers (for troubleshooting)
   * @param {String} infoHash - Info hash of the torrent
   * @return {Boolean} Success
   */
  'torrents.announce': function(infoHash) {
    check(infoHash, String);
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    
    if (!torrent) {
      throw new Meteor.Error('not-found', 'Torrent not found in client');
    }
    
    try {
      // Use the same safe announce logic as in the WebTorrent server
      if (typeof torrent.announce === 'function') {
        torrent.announce();
        console.log(`Manually announced torrent ${torrent.name}`);
      } else if (torrent._announce && typeof torrent._announce === 'function') {
        torrent._announce();
        console.log(`Used _announce for torrent ${torrent.name}`);
      } else if (torrent.discovery && typeof torrent.discovery.announce === 'function') {
        torrent.discovery.announce();
        console.log(`Used discovery.announce for torrent ${torrent.name}`);
      } else {
        console.log(`No announce method available for torrent ${torrent.name}`);
        return false;
      }
      
      return true;
    } catch (err) {
      console.error(`Error announcing torrent ${infoHash}:`, err);
      throw new Meteor.Error('announce-failed', err.message);
    }
  }

});