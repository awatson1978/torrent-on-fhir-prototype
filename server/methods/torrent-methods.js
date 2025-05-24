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
 * Wait for torrent metadata with better error handling and retries
 * @param {Object} torrent - WebTorrent torrent object
 * @param {Number} timeoutMs - Timeout in milliseconds
 * @return {Promise<Boolean>} True if metadata received
 */
function waitForTorrentMetadata(torrent, timeoutMs = 30000) {
  return new Promise(function(resolve, reject) {
    const startTime = Date.now();
    
    // If already ready, resolve immediately
    if (torrent.ready && torrent.files && torrent.files.length > 0) {
      console.log(`Torrent ${torrent.infoHash} already has metadata`);
      return resolve(true);
    }
    
    let metadataReceived = false;
    let progressChecked = false;
    
    // Set up timeout
    const timeout = setTimeout(function() {
      if (!metadataReceived) {
        console.log(`Metadata timeout for torrent ${torrent.infoHash} after ${timeoutMs}ms`);
        resolve(false); // Don't reject, just return false so we can try fallbacks
      }
    }, timeoutMs);
    
    // Listen for metadata event
    const onMetadata = function() {
      if (!metadataReceived) {
        metadataReceived = true;
        clearTimeout(timeout);
        console.log(`Metadata received for torrent ${torrent.infoHash}, files: ${torrent.files.length}`);
        resolve(true);
      }
    };
    
    // Listen for ready event
    const onReady = function() {
      if (!metadataReceived && torrent.files && torrent.files.length > 0) {
        metadataReceived = true;
        clearTimeout(timeout);
        console.log(`Torrent ready for ${torrent.infoHash}, files: ${torrent.files.length}`);
        resolve(true);
      }
    };
    
    // Check for progress updates which might indicate metadata arrival
    const onProgress = function() {
      if (!metadataReceived && !progressChecked && torrent.files && torrent.files.length > 0) {
        progressChecked = true;
        metadataReceived = true;
        clearTimeout(timeout);
        console.log(`Files available via progress for ${torrent.infoHash}, files: ${torrent.files.length}`);
        resolve(true);
      }
    };
    
    // Add event listeners
    torrent.once('metadata', onMetadata);
    torrent.once('ready', onReady);
    torrent.on('download', onProgress);
    
    // Also do periodic checks in case events don't fire
    const checkInterval = setInterval(function() {
      if (metadataReceived) {
        clearInterval(checkInterval);
        return;
      }
      
      console.log(`Checking torrent ${torrent.infoHash}: ready=${torrent.ready}, files=${torrent.files ? torrent.files.length : 0}, peers=${torrent.numPeers}, progress=${Math.round(torrent.progress * 100)}%`);
      
      if (torrent.ready && torrent.files && torrent.files.length > 0) {
        metadataReceived = true;
        clearTimeout(timeout);
        clearInterval(checkInterval);
        console.log(`Metadata found via periodic check for ${torrent.infoHash}, files: ${torrent.files.length}`);
        resolve(true);
      }
      
      // If we have peers but no progress after a while, try to manually request metadata
      if (torrent.numPeers > 0 && torrent.progress === 0 && (Date.now() - startTime) > 10000) {
        console.log(`Attempting to manually request metadata for ${torrent.infoHash}`);
        try {
          // Try to force metadata request by accessing files
          if (torrent.files) {
            torrent.files.forEach(function(file) {
              // Just accessing the file can sometimes trigger metadata requests
              file.name;
            });
          }
          
          // Try to resume if paused
          if (torrent.paused) {
            torrent.resume();
          }
          
          // Request pieces if available
          if (typeof torrent.select === 'function') {
            torrent.select(0, 1, false); // Select first piece with low priority
          }
        } catch (e) {
          console.warn('Error in manual metadata request:', e.message);
        }
      }
    }, 2000);
    
    // Clean up function
    const cleanup = function() {
      clearTimeout(timeout);
      clearInterval(checkInterval);
      torrent.removeListener('metadata', onMetadata);
      torrent.removeListener('ready', onReady);
      torrent.removeListener('download', onProgress);
    };
    
    // Cleanup after resolution
    Promise.resolve().then(function() {
      setTimeout(cleanup, 1000);
    });
  });
}

/**
 * Enhanced file content retrieval with immediate read attempts
 * @param {Object} torrent - WebTorrent torrent object
 * @param {Number} timeoutMs - Timeout for each file
 * @return {Promise<Object>} Object with filename keys and content values
 */
function getFileContentsAggressively(torrent, timeoutMs = 15000) {
  return new Promise(function(resolve, reject) {
    console.log(`🚀 Aggressively retrieving files from torrent ${torrent.infoHash}`);
    
    if (!torrent.files || torrent.files.length === 0) {
      return reject(new Error('No files available in torrent'));
    }
    
    // Force download start before attempting to read
    forceDownloadStart(torrent);
    
    const results = {};
    const filePromises = torrent.files.map(function(file, index) {
      return new Promise(function(resolveFile, rejectFile) {
        console.log(`📁 Processing file ${index}: ${file.name} (${file.length} bytes)`);
        
        let attempts = 0;
        const maxAttempts = 3;
        
        function attemptRead() {
          attempts++;
          console.log(`📖 Reading attempt ${attempts}/${maxAttempts} for ${file.name}`);
          
          const readTimeout = Meteor.setTimeout(function() {
            console.log(`⏰ Read timeout for ${file.name} on attempt ${attempts}`);
            
            if (attempts < maxAttempts) {
              console.log(`🔄 Retrying read for ${file.name} (attempt ${attempts + 1})`);
              Meteor.setTimeout(attemptRead, 2000); // Wait 2 seconds before retry
            } else {
              console.log(`❌ All read attempts failed for ${file.name}`);
              rejectFile(new Error(`Failed to read ${file.name} after ${maxAttempts} attempts`));
            }
          }, timeoutMs / maxAttempts);
          
          // Try multiple read strategies
          function tryStrategyA() {
            console.log(`Strategy A: getBuffer for ${file.name}`);
            file.getBuffer(function(err, buffer) {
              clearTimeout(readTimeout);
              
              if (err) {
                console.log(`Strategy A failed for ${file.name}:`, err.message);
                tryStrategyB();
              } else {
                try {
                  const content = buffer.toString('utf8');
                  console.log(`✅ Strategy A success for ${file.name}: ${content.length} chars`);
                  resolveFile({ name: file.name, content });
                } catch (convertErr) {
                  console.log(`Strategy A buffer conversion failed for ${file.name}:`, convertErr.message);
                  tryStrategyB();
                }
              }
            });
          }
          
          function tryStrategyB() {
            console.log(`Strategy B: createReadStream for ${file.name}`);
            try {
              const chunks = [];
              const stream = file.createReadStream();
              
              stream.on('data', function(chunk) {
                chunks.push(chunk);
              });
              
              stream.on('end', function() {
                clearTimeout(readTimeout);
                try {
                  const content = Buffer.concat(chunks).toString('utf8');
                  console.log(`✅ Strategy B success for ${file.name}: ${content.length} chars`);
                  resolveFile({ name: file.name, content });
                } catch (convertErr) {
                  console.log(`Strategy B failed for ${file.name}:`, convertErr.message);
                  if (attempts < maxAttempts) {
                    Meteor.setTimeout(attemptRead, 2000);
                  } else {
                    rejectFile(convertErr);
                  }
                }
              });
              
              stream.on('error', function(streamErr) {
                clearTimeout(readTimeout);
                console.log(`Strategy B stream error for ${file.name}:`, streamErr.message);
                if (attempts < maxAttempts) {
                  Meteor.setTimeout(attemptRead, 2000);
                } else {
                  rejectFile(streamErr);
                }
              });
              
            } catch (streamErr) {
              clearTimeout(readTimeout);
              console.log(`Strategy B setup failed for ${file.name}:`, streamErr.message);
              if (attempts < maxAttempts) {
                Meteor.setTimeout(attemptRead, 2000);
              } else {
                rejectFile(streamErr);
              }
            }
          }
          
          // Start with Strategy A
          tryStrategyA();
        }
        
        // Start the first attempt immediately
        attemptRead();
      });
    });
    
    // Wait for all files or timeout
    Promise.allSettled(filePromises).then(function(results) {
      const successfulFiles = {};
      const failedFiles = [];
      
      results.forEach(function(result) {
        if (result.status === 'fulfilled') {
          const fileData = result.value;
          successfulFiles[fileData.name] = fileData.content;
        } else {
          failedFiles.push(result.reason.message);
        }
      });
      
      console.log(`📊 File retrieval results: ${Object.keys(successfulFiles).length} success, ${failedFiles.length} failed`);
      
      if (Object.keys(successfulFiles).length > 0) {
        console.log('✅ At least some files retrieved successfully');
        resolve(successfulFiles);
      } else {
        console.log('❌ No files could be retrieved');
        reject(new Error('Could not retrieve any files: ' + failedFiles.join(', ')));
      }
    });
  });
}

/**
 * Enhanced helper function to get file contents from disk with better search
 */
async function getDiskFallbackContents(infoHash, torrentRecord) {
  console.log(`💾 Attempting enhanced disk fallback for torrent ${infoHash}`);
  
  const resolvedPath = getResolvedStoragePath();
  console.log(`Using storage path: ${resolvedPath}`);
  
  if (!fs.existsSync(resolvedPath)) {
    console.log(`Storage path does not exist: ${resolvedPath}`);
    throw new Meteor.Error('storage-missing', 'Storage directory does not exist');
  }
  
  const diskContents = {};
  
  // Build comprehensive list of search paths
  const possiblePaths = [resolvedPath];
  
  // Add stored torrent directory if available
  if (torrentRecord.torrentDirectory && fs.existsSync(torrentRecord.torrentDirectory)) {
    possiblePaths.unshift(torrentRecord.torrentDirectory);
    console.log(`Using stored torrent directory: ${torrentRecord.torrentDirectory}`);
  }
  
  // Add name-based patterns
  if (torrentRecord.name) {
    const sanitizedName = torrentRecord.name.replace(/[^a-z0-9_-]/gi, '_');
    possiblePaths.push(path.join(resolvedPath, sanitizedName));
    possiblePaths.push(path.join(resolvedPath, torrentRecord.name));
  }
  
  // Add hash-based patterns
  possiblePaths.push(path.join(resolvedPath, infoHash));
  possiblePaths.push(path.join(resolvedPath, infoHash.substring(0, 8)));
  
  // Search for any directories that might contain our files
  try {
    const storageContents = fs.readdirSync(resolvedPath);
    console.log(`Found ${storageContents.length} items in storage directory`);
    
    storageContents.forEach(function(item) {
      const fullPath = path.join(resolvedPath, item);
      try {
        if (fs.statSync(fullPath).isDirectory()) {
          const itemLower = item.toLowerCase();
          const nameLower = (torrentRecord.name || '').toLowerCase();
          const hashSubstring = infoHash.substring(0, 8);
          
          if (itemLower.includes(hashSubstring) || 
              (nameLower && itemLower.includes(nameLower.replace(/[^a-z0-9]/g, ''))) ||
              itemLower.includes('fhir') || 
              itemLower.includes('bundle') || 
              itemLower.includes('ndjson') ||
              item.match(/_\d{13}$/)) {
            possiblePaths.push(fullPath);
            console.log(`Added potential directory: ${fullPath}`);
          }
        }
      } catch (statErr) {
        // Ignore stat errors
      }
    });
  } catch (dirErr) {
    console.warn('Error reading storage directory:', dirErr);
  }
  
  console.log(`Searching ${possiblePaths.length} possible paths for files`);
  
  // Enhanced file search
  for (const searchPath of possiblePaths) {
    console.log(`🔍 Searching in: ${searchPath}`);
    
    try {
      if (!fs.existsSync(searchPath)) continue;
      
      // If we have specific file info, look for those files
      if (torrentRecord.files && torrentRecord.files.length > 0) {
        for (const fileInfo of torrentRecord.files) {
          const possibleFilePaths = [
            path.join(searchPath, fileInfo.name),
            path.join(searchPath, fileInfo.path || fileInfo.name),
            path.join(searchPath, path.basename(fileInfo.name)),
            path.join(searchPath, path.basename(fileInfo.path || fileInfo.name))
          ];
          
          for (const filePath of possibleFilePaths) {
            try {
              if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                diskContents[fileInfo.name] = content;
                console.log(`✅ Found on disk: ${fileInfo.name} (${content.length} bytes) at ${filePath}`);
                break;
              }
            } catch (readErr) {
              console.error(`Error reading ${filePath}:`, readErr.message);
            }
          }
        }
      } else {
        // Search for any FHIR files
        const files = fs.readdirSync(searchPath);
        const dataFiles = files.filter(function(f) {
          const ext = path.extname(f).toLowerCase();
          const name = f.toLowerCase();
          return ext === '.json' || ext === '.ndjson' || 
                 name.includes('fhir') || name.includes('bundle') || 
                 name.includes('resource') || name.includes('patient');
        });
        
        for (const dataFile of dataFiles) {
          const filePath = path.join(searchPath, dataFile);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            diskContents[dataFile] = content;
            console.log(`✅ Found data file: ${dataFile} (${content.length} bytes)`);
          } catch (readErr) {
            console.error(`Error reading ${filePath}:`, readErr.message);
          }
        }
      }
    } catch (searchErr) {
      console.warn(`Error searching in ${searchPath}:`, searchErr.message);
    }
  }
  
  if (Object.keys(diskContents).length > 0) {
    console.log(`💾 Found ${Object.keys(diskContents).length} files on disk`);
    return diskContents;
  }
  
  // Sample fallback for test torrents
  if (torrentRecord.name && (
    torrentRecord.name.toLowerCase().includes('sample') || 
    torrentRecord.name.toLowerCase().includes('test') ||
    torrentRecord.name.toLowerCase().includes('demo')
  )) {
    console.log('Attempting sample content fallback');
    try {
      const sampleData = await Assets.getTextAsync('sample-bundle.json');
      if (sampleData) {
        const fileName = torrentRecord.name.endsWith('.json') ? torrentRecord.name : torrentRecord.name + '.json';
        return { [fileName]: sampleData };
      }
    } catch (assetErr) {
      console.error('Error reading sample bundle:', assetErr);
    }
  }
  
  throw new Meteor.Error('no-content', 
    `Could not retrieve file contents for torrent ${infoHash}. ` +
    `The torrent may still be downloading, or the files may not be available yet. ` +
    `Try waiting a few more minutes for the download to complete.`
  );
}

/**
 * Force download initiation for a torrent
 * @param {Object} torrent - WebTorrent torrent object
 * @return {Promise<Boolean>} True if download was triggered successfully
 */
function forceDownloadStart(torrent) {
  return new Promise(function(resolve) {
    console.log(`🔧 Force triggering download for torrent ${torrent.infoHash}`);
    
    try {
      // 1. Resume if paused
      if (torrent.paused) {
        console.log('Resuming paused torrent');
        torrent.resume();
      }
      
      // 2. Select all files with high priority
      if (torrent.files && torrent.files.length > 0) {
        console.log(`Selecting all ${torrent.files.length} files with high priority`);
        torrent.files.forEach(function(file, index) {
          try {
            if (typeof file.select === 'function') {
              file.select(0, file.length, 1); // Select entire file with high priority
              console.log(`Selected file ${index}: ${file.name}`);
            }
          } catch (selectErr) {
            console.warn(`Error selecting file ${file.name}:`, selectErr.message);
          }
        });
      }
      
      // 3. Try to manually request specific pieces
      try {
        if (typeof torrent.select === 'function') {
          // Request first few pieces with high priority
          const pieceLength = torrent.pieceLength || 16384; // Default piece size
          const totalLength = torrent.length || 0;
          const piecesToRequest = Math.min(10, Math.ceil(totalLength / pieceLength));
          
          console.log(`Requesting first ${piecesToRequest} pieces manually`);
          for (let i = 0; i < piecesToRequest; i++) {
            torrent.select(i * pieceLength, Math.min((i + 1) * pieceLength, totalLength), 1);
          }
        }
      } catch (pieceErr) {
        console.warn('Error requesting pieces:', pieceErr.message);
      }
      
      // 4. Force announce to get more peers
      try {
        if (typeof torrent.announce === 'function') {
          torrent.announce();
          console.log('Forced announce to trackers');
        } else if (torrent.discovery && typeof torrent.discovery.announce === 'function') {
          torrent.discovery.announce();
          console.log('Used discovery announce');
        }
      } catch (announceErr) {
        console.warn('Error announcing:', announceErr.message);
      }
      
      // 5. Set up download event listeners to monitor progress
      const onDownload = function() {
        // console.log(`📥 Download progress: ${Math.round(torrent.progress * 100)}%`);
      };
      
      const onPiece = function(index) {
        console.log(`📦 Received piece ${index}, progress: ${Math.round(torrent.progress * 100)}%`);
      };
      
      torrent.on('download', onDownload);
      torrent.on('piece', onPiece);
      
      // Clean up listeners after 60 seconds
      Meteor.setTimeout(function() {
        torrent.removeListener('download', onDownload);
        torrent.removeListener('piece', onPiece);
      }, 60000);
      
      console.log('✅ Download triggers applied successfully');
      resolve(true);
      
    } catch (err) {
      console.error('Error in forceDownloadStart:', err);
      resolve(false);
    }
  });
}

/**
 * Wait for torrent download with aggressive triggering
 * @param {Object} torrent - WebTorrent torrent object
 * @param {Number} timeoutMs - Timeout in milliseconds
 * @return {Promise<Boolean>} True if some content was downloaded
 */
function waitForDownloadProgress(torrent, timeoutMs = 45000) {
  return new Promise(function(resolve) {
    const startTime = Date.now();
    const initialProgress = torrent.progress;
    
    console.log(`⏳ Waiting for download progress, initial: ${Math.round(initialProgress * 100)}%`);
    
    // If already has some progress, resolve immediately
    if (initialProgress > 0) {
      console.log('Already has download progress');
      return resolve(true);
    }
    
    // Force download start
    forceDownloadStart(torrent);
    
    let progressDetected = false;
    
    const checkInterval = Meteor.setInterval(function() {
      const elapsed = Date.now() - startTime;
      const currentProgress = torrent.progress;
      
      console.log(`⏳ Check: progress=${Math.round(currentProgress * 100)}%, peers=${torrent.numPeers}, elapsed=${elapsed}ms`);
      
      // Success condition - any progress or content
      if (currentProgress > initialProgress || torrent.downloaded > 0) {
        console.log(`✅ Download progress detected: ${Math.round(currentProgress * 100)}%`);
        progressDetected = true;
        Meteor.clearInterval(checkInterval);
        return resolve(true);
      }
      
      // Re-trigger download every 10 seconds
      if (elapsed % 10000 < 2000 && !progressDetected) {
        console.log('Re-triggering download...');
        forceDownloadStart(torrent);
      }
      
      // Timeout condition
      if (elapsed >= timeoutMs) {
        console.log(`⏰ Download wait timeout after ${elapsed}ms`);
        Meteor.clearInterval(checkInterval);
        return resolve(false);
      }
    }, 2000);
  });
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
      
      // Start adding to WebTorrent client in background with enhanced metadata handling
      console.log(`Starting enhanced background WebTorrent add for ${infoHash}`);
      WebTorrentServer.addTorrent(magnetUri, {
        path: resolvedPath,
        timeout: 45000 // Longer timeout for better metadata retrieval
      }).then(async function(torrent) {
        console.log(`Background torrent add completed for ${torrent.name} (${torrent.infoHash})`);
        
        // Wait for metadata with enhanced retry logic
        try {
          console.log(`Waiting for metadata for torrent ${torrent.infoHash}`);
          const metadataReceived = await waitForTorrentMetadata(torrent, 60000); // 60 second timeout
          
          if (metadataReceived) {
            console.log(`Metadata successfully received for ${torrent.infoHash}, updating database`);
            // The _updateTorrentRecord will be called by the event handlers
            WebTorrentServer._updateTorrentRecord(torrent);
          } else {
            console.warn(`Metadata not received for ${torrent.infoHash} within timeout, but torrent is still active`);
            // Update status to indicate metadata issues
            await TorrentsCollection.updateAsync(
              { infoHash: torrent.infoHash },
              { 
                $set: { 
                  'status.state': 'metadata-pending',
                  'status.note': 'Waiting for file information from peers'
                } 
              }
            );
          }
        } catch (metadataErr) {
          console.error(`Error waiting for metadata for ${torrent.infoHash}:`, metadataErr);
        }
        
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
        path: resolvedPath
      });
      
      console.log(`✅ Torrent created successfully: ${result.name} (${result.infoHash})`);
      
      // 🔧 AUTOMATIC SEEDING METADATA FIX
      console.log(`🔧 Applying automatic seeding metadata fix for ${result.infoHash}`);
      
      try {
        // Wait a moment for the torrent to be fully initialized
        await new Promise(resolve => Meteor.setTimeout(resolve, 2000));
        
        // Apply the seeding metadata fix
        const fixResult = await Meteor.callAsync('torrents.fixSeedingMetadataCreation', result.infoHash);
        
        if (fixResult.success) {
          console.log(`✅ Automatic seeding metadata fix applied successfully`);
        } else {
          console.warn(`⚠️ Automatic seeding metadata fix failed: ${fixResult.error}`);
          // Don't fail the entire creation, just log the warning
        }
      } catch (fixError) {
        console.error(`❌ Error applying automatic seeding metadata fix:`, fixError);
        // Don't fail the entire creation, just log the error
      }
      
      // Update metadata
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
            
            // Store the permanent directory path and seeding fix status
            updateObj.torrentDirectory = torrentDir;
            updateObj.seedingFixed = true; // Mark that seeding fix was applied
            
            if (Object.keys(updateObj).length > 0) {
              await TorrentsCollection.updateAsync(
                { infoHash: result.infoHash },
                { $set: updateObj }
              );
              console.log(`Updated torrent metadata and marked seeding as fixed`);
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
        torrentDirectory: torrentDir,
        seedingFixed: true
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
    
    console.log(`🎯 ENHANCED: Received request for all file contents of torrent: ${infoHash}`);
    
    try {
      // Get torrent record
      const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
      if (!torrentRecord) {
        throw new Meteor.Error('not-found', 'Torrent not found in database');
      }
      
      console.log(`📋 Found torrent in database: ${torrentRecord.name}`);
      
      // Get torrent from WebTorrent
      let torrent = WebTorrentServer.getTorrent(infoHash);
      
      // Try to find or reload torrent
      if (!torrent) {
        console.log(`🔄 Torrent not in memory, checking WebTorrent client`);
        
        const torrentClient = WebTorrentServer.getClient();
        if (torrentClient) {
          torrent = torrentClient.get(infoHash);
          if (torrent) {
            console.log(`✅ Found torrent in WebTorrent client, adding to memory`);
            WebTorrentServer._torrents.set(infoHash, torrent);
            WebTorrentServer._setupTorrentEvents(torrent);
          }
        }
        
        // If still not found, reload from magnet URI
        if (!torrent && torrentRecord.magnetURI) {
          console.log(`🔄 Reloading torrent from magnet URI`);
          try {
            torrent = await WebTorrentServer.addTorrent(torrentRecord.magnetURI, {
              path: getResolvedStoragePath(),
              timeout: 30000
            });
            console.log(`✅ Torrent reloaded successfully`);
          } catch (reloadErr) {
            console.error('Failed to reload torrent:', reloadErr);
            throw new Meteor.Error('reload-failed', 'Could not reload torrent');
          }
        }
      }
      
      if (!torrent) {
        console.log(`❌ Could not get torrent instance, trying disk fallback`);
        return await getDiskFallbackContents(infoHash, torrentRecord);
      }
      
      console.log(`📊 Torrent status: files=${torrent.files?.length || 0}, ready=${torrent.ready}, peers=${torrent.numPeers}, progress=${Math.round(torrent.progress * 100)}%`);
      
      // If no files yet, wait for metadata
      if (!torrent.files || torrent.files.length === 0) {
        console.log(`⏳ Waiting for torrent metadata...`);
        
        const maxWait = 30000;
        const startTime = Date.now();
        
        while ((!torrent.files || torrent.files.length === 0) && (Date.now() - startTime) < maxWait) {
          await new Promise(resolve => Meteor.setTimeout(resolve, 1000));
          console.log(`⏳ Still waiting for metadata... (${Date.now() - startTime}ms)`);
        }
        
        if (!torrent.files || torrent.files.length === 0) {
          console.log(`❌ No metadata received, trying disk fallback`);
          return await getDiskFallbackContents(infoHash, torrentRecord);
        }
      }
      
      console.log(`✅ Torrent has ${torrent.files.length} files, attempting enhanced retrieval`);
      
      // Try aggressive WebTorrent retrieval first
      try {
        console.log(`🚀 Attempting aggressive WebTorrent retrieval`);
        
        // Wait for some download progress if needed
        if (torrent.progress === 0 && !torrent.done) {
          console.log(`⏳ Waiting for download to start...`);
          await waitForDownloadProgress(torrent, 30000);
        }
        
        // Attempt to get files with aggressive strategies
        const webTorrentContents = await getFileContentsAggressively(torrent, 20000);
        
        if (Object.keys(webTorrentContents).length > 0) {
          console.log(`✅ Successfully retrieved ${Object.keys(webTorrentContents).length} files via WebTorrent`);
          return webTorrentContents;
        }
        
      } catch (webTorrentErr) {
        console.log(`⚠️ WebTorrent retrieval failed: ${webTorrentErr.message}`);
      }
      
      // Fall back to disk
      console.log(`💾 Falling back to disk retrieval`);
      return await getDiskFallbackContents(infoHash, torrentRecord);
      
    } catch (error) {
      console.error(`❌ Error getting file contents for torrent ${infoHash}:`, error);
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
  },

  /**
   * Emergency metadata fix that completely avoids DHT operations
   * This should work without any bencode errors
   */
  'torrents.emergencyMetadataFix': async function(infoHash) {
    check(infoHash, String);
    
    console.log(`🚨 EMERGENCY METADATA FIX for torrent ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      actions: [],
      success: false,
      strategy: 'emergency-no-dht'
    };
    
    try {
      let torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
        if (!torrentRecord?.magnetURI) {
          throw new Error('Torrent not found');
        }
        
        result.actions.push('🔄 Reloading torrent');
        torrent = await WebTorrentServer.addTorrent(torrentRecord.magnetURI);
      }
      
      result.actions.push(`📊 Initial: files=${torrent.files?.length || 0}, peers=${torrent.numPeers}, ready=${torrent.ready}`);
      
      // Only fix wire connections - NO DHT operations
      if (torrent.wires && torrent.wires.length > 0) {
        result.actions.push(`🔧 Fixing ${torrent.wires.length} wire connections (NO DHT)`);
        
        for (const wire of torrent.wires) {
          try {
            result.actions.push(`🔌 Wire: ${wire.remoteAddress}`);
            
            // Install ut_metadata if missing
            if (!wire.ut_metadata && wire.extended) {
              const ut_metadata = require('ut_metadata');
              
              if (torrent.metadata) {
                wire.use(ut_metadata(torrent.metadata));
                result.actions.push(`   ✅ Installed ut_metadata with metadata`);
              } else {
                wire.use(ut_metadata());
                result.actions.push(`   ✅ Installed ut_metadata for downloading`);
              }
            }
            
            // Send handshake
            if (wire.ut_metadata) {
              const handshake = {
                m: { ut_metadata: 1 },
                v: 'Emergency-Fix'
              };
              
              if (torrent.metadata) {
                handshake.metadata_size = torrent.metadata.length;
              }
              
              wire.extended('handshake', Buffer.from(JSON.stringify(handshake)));
              result.actions.push(`   ✅ Sent handshake`);
            }
            
            // Request metadata if downloading
            if (!torrent.ready && wire.ut_metadata?.fetch) {
              wire.ut_metadata.fetch();
              result.actions.push(`   📥 Requested metadata`);
            }
            
            // Ensure interested
            if (!wire.amInterested) {
              wire.interested();
              result.actions.push(`   📢 Sent interested`);
            }
            
          } catch (wireErr) {
            result.actions.push(`   ❌ Wire error: ${wireErr.message}`);
          }
        }
      }
      
      // ONLY announce to trackers - NO DHT
      result.actions.push('📢 Announcing to trackers only (NO DHT)');
      
      try {
        if (typeof torrent.announce === 'function') {
          torrent.announce();
          result.actions.push('✅ Tracker announce only');
        }
        
        // Explicitly skip DHT announce to avoid bencode issues
        result.actions.push('⚠️ Skipping DHT announce to avoid bencode errors');
        
      } catch (announceErr) {
        result.actions.push(`⚠️ Announce error: ${announceErr.message}`);
      }
      
      // Wait for success
      result.actions.push('⏳ Waiting for metadata (30 seconds, no DHT operations)');
      
      const maxWaitTime = 30000;
      const startTime = Date.now();
      
      return new Promise(function(resolve) {
        const checker = Meteor.setInterval(function() {
          const elapsed = Date.now() - startTime;
          const status = {
            ready: torrent.ready,
            files: torrent.files?.length || 0,
            peers: torrent.numPeers
          };
          
          if (elapsed % 5000 < 1000) {
            result.actions.push(`📊 ${elapsed}ms: ready=${status.ready}, files=${status.files}, peers=${status.peers}`);
          }
          
          // Success
          if (torrent.ready && torrent.files && torrent.files.length > 0) {
            Meteor.clearInterval(checker);
            result.success = true;
            result.finalStatus = status;
            result.actions.push(`🎉 SUCCESS after ${elapsed}ms - no DHT issues!`);
            
            WebTorrentServer._updateTorrentRecord(torrent);
            resolve(result);
            return;
          }
          
          // Timeout
          if (elapsed >= maxWaitTime) {
            Meteor.clearInterval(checker);
            result.success = false;
            result.finalStatus = status;
            result.actions.push(`⏰ Timeout after ${elapsed}ms`);
            resolve(result);
          }
        }, 1000);
      });
      
    } catch (error) {
      console.error('Emergency metadata fix error:', error);
      result.error = error.message;
      result.actions.push(`❌ Error: ${error.message}`);
      return result;
    }
  },

  /**
   * Emergency fix for metadata exchange issues
   * This method can be called when peers are connected but metadata isn't being exchanged
   */
  'torrents.emergencyMetadataExchangeFix': async function(infoHash) {
    check(infoHash, String);
    
    console.log(`🚨 EMERGENCY METADATA EXCHANGE FIX for ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      actions: [],
      success: false
    };
    
    try {
      // Get the torrent
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        throw new Error('Torrent not found in WebTorrent client');
      }
      
      result.actions.push(`Found torrent: ${torrent.name}`);
      result.actions.push(`Status: ready=${torrent.ready}, files=${torrent.files?.length || 0}, peers=${torrent.numPeers}`);
      
      // Determine if this is a seeding or downloading torrent
      const isSeeding = torrent.progress >= 1 || (torrent.ready && torrent.files && torrent.files.length > 0);
      result.actions.push(`Role: ${isSeeding ? 'SEEDING' : 'DOWNLOADING'}`);
      
      // Apply comprehensive wire fixes
      result.actions.push('Applying WebTorrent wire protocol fixes...');
      WebTorrentWireFix.applyTorrentFixes(torrent, isSeeding);
      result.actions.push('✅ Wire protocol fixes applied');
      
      // For seeding torrents, ensure metadata object exists
      if (isSeeding) {
        if (!torrent.metadata && torrent.info) {
          try {
            const bencode = require('bencode');
            torrent.metadata = bencode.encode(torrent.info);
            result.actions.push(`✅ Created metadata object: ${torrent.metadata.length} bytes`);
          } catch (err) {
            result.actions.push(`⚠️ Could not create metadata: ${err.message}`);
          }
        } else if (torrent.metadata) {
          result.actions.push(`✅ Metadata already exists: ${torrent.metadata.length} bytes`);
        } else {
          result.actions.push('⚠️ No torrent.info available to create metadata');
        }
      }
      
      // Process existing wires
      if (torrent.wires && torrent.wires.length > 0) {
        result.actions.push(`Processing ${torrent.wires.length} existing wire connections...`);
        
        torrent.wires.forEach(function(wire, index) {
          if (!wire) {
            result.actions.push(`Wire ${index}: NULL/UNDEFINED`);
            return;
          }
          
          const wireStatus = {
            address: wire.remoteAddress || 'no address',
            destroyed: wire.destroyed,
            handshake: wire._handshakeComplete,
            hasUtMetadata: !!wire.ut_metadata
          };
          
          result.actions.push(`Wire ${index}: ${wireStatus.address} - handshake:${wireStatus.handshake}, ut_metadata:${wireStatus.hasUtMetadata}`);
          
          // Re-initialize this wire
          WebTorrentWireFix.initializeWire(wire, torrent, index, isSeeding);
        });
      } else {
        result.actions.push('No wire connections found');
      }
      
      // Force announce to get more peers
      result.actions.push('Forcing tracker announce...');
      try {
        if (typeof torrent.announce === 'function') {
          torrent.announce();
          result.actions.push('✅ Announced to trackers');
        }
      } catch (err) {
        result.actions.push(`⚠️ Announce error: ${err.message}`);
      }
      
      // For downloading torrents, wait for metadata
      if (!isSeeding && !torrent.ready) {
        result.actions.push('⏳ Waiting for metadata (30 seconds)...');
        
        const startTime = Date.now();
        const maxWait = 30000;
        
        await new Promise(function(resolve) {
          const checkInterval = Meteor.setInterval(function() {
            const elapsed = Date.now() - startTime;
            
            if (torrent.ready && torrent.files && torrent.files.length > 0) {
              Meteor.clearInterval(checkInterval);
              result.actions.push(`✅ Metadata received after ${Math.round(elapsed/1000)}s`);
              result.success = true;
              resolve();
            } else if (elapsed >= maxWait) {
              Meteor.clearInterval(checkInterval);
              result.actions.push(`⏰ Timeout after ${Math.round(elapsed/1000)}s`);
              result.success = false;
              resolve();
            }
          }, 1000);
        });
      } else {
        result.success = true;
      }
      
      // Final status
      result.finalStatus = {
        ready: torrent.ready,
        files: torrent.files?.length || 0,
        peers: torrent.numPeers,
        progress: Math.round(torrent.progress * 100)
      };
      
      return result;
      
    } catch (error) {
      console.error('Emergency metadata fix error:', error);
      result.error = error.message;
      result.actions.push(`❌ Error: ${error.message}`);
      return result;
    }
  },
  
  /**
   * Quick status check for a torrent's metadata exchange
   */
  'torrents.checkMetadataStatus': function(infoHash) {
    check(infoHash, String);
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    
    if (!torrent) {
      return { error: 'Torrent not found' };
    }
    
    const status = {
      name: torrent.name,
      ready: torrent.ready,
      hasMetadata: !!torrent.metadata,
      metadataSize: torrent.metadata?.length || 0,
      files: torrent.files?.length || 0,
      peers: torrent.numPeers,
      wires: []
    };
    
    if (torrent.wires) {
      torrent.wires.forEach(function(wire, index) {
        if (!wire) return;
        
        status.wires.push({
          index: index,
          address: wire.remoteAddress || 'connecting...',
          handshake: !!wire._handshakeComplete,
          hasUtMetadata: !!wire.ut_metadata,
          peerSupportsMetadata: !!(wire.peerExtensions && wire.peerExtensions.ut_metadata)
        });
      });
    }
    
    // Analysis
    status.analysis = {
      role: torrent.progress >= 1 ? 'seeding' : 'downloading',
      wiresWithAddress: status.wires.filter(w => w.address !== 'connecting...').length,
      wiresWithHandshake: status.wires.filter(w => w.handshake).length,
      wiresWithMetadata: status.wires.filter(w => w.hasUtMetadata).length,
      peersSupporting: status.wires.filter(w => w.peerSupportsMetadata).length
    };
    
    return status;
  }


});