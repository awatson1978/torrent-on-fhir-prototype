import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';
import { TorrentsCollection } from '/imports/api/torrents/torrents';

import { check, Match } from 'meteor/check';
import fs from 'fs';
import path from 'path';
import { WebTorrentServer } from '../webtorrent-server';
import { Settings } from '/imports/api/settings/settings';
import { FhirUtils } from '/imports/api/fhir/fhir-utils';


Meteor.methods({  
  /**
   * Simple ping method to test server connectivity
   * @return {String} Pong response with timestamp
   */
  'ping': function() {
    return `pong at ${new Date().toISOString()}`;
  },
  
  /**
   * Get server environment information
   * @return {Object} Server environment details
   */
  'debug.getServerInfo': function() {
    return {
      meteorVersion: Meteor.release,
      nodeVersion: process.version,
      settings: {
        // Only return safe settings - don't expose credentials
        webTorrent: Settings.getWebTorrentConfig(),
        fhir: Settings.getFhirConfig(),
        ui: Settings.getUIConfig()
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        rootUrl: process.env.ROOT_URL || Meteor.absoluteUrl(),
        // Add other safe environment variables as needed
      }
    };
  },
  
  /**
   * Test database connection
   * @return {Object} Database connection status
   */
  'debug.testDatabase': function() {
    try {
      // Simple query to test database connectivity
      const count = TorrentsCollection.find().count();
      return {
        connected: true,
        torrentCount: count,
        timestamp: new Date()
      };
    } catch (err) {
      return {
        connected: false,
        error: err.message,
        timestamp: new Date()
      };
    }
  },
  'debug.testPeers': async function() {
    const client = WebTorrentServer.getClient();
    if (!client) return { status: 'Client not initialized' };
    
    // Log information about all loaded torrents
    const torrents = WebTorrentServer.getAllTorrents();
    console.log(`Current torrents loaded: ${torrents.length}`);
    
    torrents.forEach(torrent => {
      console.log(`Torrent: ${torrent.name} (${torrent.infoHash})`);
      console.log(`- Peers: ${torrent.numPeers}`);
      console.log(`- Progress: ${Math.round(torrent.progress * 100)}%`);
      console.log(`- Downloaded: ${torrent.downloaded} bytes`);
      
      // Try to announce to trackers
      torrent.announce();
    });
    
    return {
      torrents: torrents.map(t => ({
        name: t.name,
        infoHash: t.infoHash,
        peers: t.numPeers,
        progress: Math.round(t.progress * 100)
      })),
      trackers: client._trackers ? Object.keys(client._trackers).length : 0
    }
  },
  'debug.getNetworkStatus': function() {
    const client = WebTorrentServer.getClient();
    if (!client) return { status: 'Client not initialized' };
    
    return {
      trackerStatus: client._trackers ? 'Active' : 'Inactive',
      dhtStatus: client.dht ? 'Enabled' : 'Disabled',
      publicIp: client._connectedPeers ? 'Connected' : 'Not connected',
      trackers: client._trackers,
      torrentCount: client.torrents.length
    };
  },
  'debug.getTorrentInfo': async function() {
    const client = WebTorrentServer.getClient();
    if (!client) return { status: 'Client not initialized' };
    
    const torrents = WebTorrentServer.getAllTorrents();
    console.log(`Debug: Server has ${torrents.length} torrents loaded in WebTorrent client`);
    
    const collectionTorrents = await TorrentsCollection.find({}).fetchAsync();
    console.log(`Debug: Server has ${collectionTorrents.length} torrents in the MongoDB collection`);
    
    // Check for mismatches
    const clientInfoHashes = torrents.map(t => t.infoHash);
    const dbInfoHashes = collectionTorrents.map(t => t.infoHash);
    
    const missingInClient = dbInfoHashes.filter(hash => !clientInfoHashes.includes(hash));
    const missingInDb = clientInfoHashes.filter(hash => !dbInfoHashes.includes(hash));
    
    console.log(`Debug: Torrents in DB but missing in client: ${missingInClient.length}`);
    console.log(`Debug: Torrents in client but missing in DB: ${missingInDb.length}`);
    
    return {
      clientTorrents: torrents.map(t => ({
        infoHash: t.infoHash,
        name: t.name,
        numPeers: t.numPeers,
        progress: t.progress
      })),
      dbTorrents: collectionTorrents.map(t => ({
        infoHash: t.infoHash,
        name: t.name
      })),
      missingInClient,
      missingInDb
    };
  },
  'debug.getServerStatus': async function() {
    console.log('Debug: Getting full server status');
    
    // Get WebTorrent client status
    const client = WebTorrentServer.getClient();
    const clientInitialized = !!client;
    const torrents = WebTorrentServer.getAllTorrents();
    
    // Get database status
    let dbTorrents = [];
    try {
      dbTorrents = await TorrentsCollection.find({}).fetchAsync();
    } catch (err) {
      console.error('Error fetching torrents from database:', err);
    }
    
    // Get subscription info
    const torrentsPublication = Meteor.server.publish_handlers['torrents.all'];
    const subCount = torrentsPublication ? Object.keys(torrentsPublication._documents || {}).length : 0;
    
    // Get tracker info
    let trackerUrls = [];
    if (client && client._trackers) {
      trackerUrls = Object.keys(client._trackers);
    } else if (Settings) {
      const config = Settings.getWebTorrentConfig();
      trackerUrls = config.tracker || [];
    }
    
    // Force announce on all torrents to try to discover peers
    if (torrents.length > 0) {
      torrents.forEach(torrent => {
        console.log(`Debug: Announcing torrent ${torrent.name} (${torrent.infoHash})`);
        try {
          torrent.announce();
        } catch (e) {
          console.error('Error announcing torrent:', e);
        }
      });
    }
    
    // Log detailed information about client torrents vs database torrents
    console.log(`Debug: Client has ${torrents.length} torrents, database has ${dbTorrents.length} torrents`);
    
    const clientInfoHashes = torrents.map(t => t.infoHash);
    const dbInfoHashes = dbTorrents.map(t => t.infoHash);
    
    const onlyInClient = clientInfoHashes.filter(hash => !dbInfoHashes.includes(hash));
    const onlyInDb = dbInfoHashes.filter(hash => !clientInfoHashes.includes(hash));
    
    console.log(`Debug: Torrents only in client: ${onlyInClient.length}`);
    console.log(`Debug: Torrents only in database: ${onlyInDb.length}`);
    
    if (onlyInClient.length > 0) {
      console.log('Info hashes only in client:', onlyInClient);
    }
    
    if (onlyInDb.length > 0) {
      console.log('Info hashes only in database:', onlyInDb);
    }
    
    return {
      client: {
        initialized: clientInitialized,
        torrents: torrents.map(t => ({
          infoHash: t.infoHash,
          name: t.name,
          magnetURI: t.magnetURI,
          numPeers: t.numPeers,
          progress: t.progress
        })),
        trackers: trackerUrls
      },
      database: {
        torrents: dbTorrents.map(t => ({
          infoHash: t.infoHash,
          name: t.name,
          created: t.created
        }))
      },
      subscription: {
        ready: true, // We can't easily check this server-side
        count: subCount
      },
      torrentsCount: torrents.length,
      currentTime: new Date().toISOString()
    };
  },
  'debug.repairTorrents': async function() {
    console.log('Debug: Starting torrent repair process');
    
    const client = WebTorrentServer.getClient();
    if (!client) {
      return { status: 'error', message: 'WebTorrent client not initialized' };
    }
    
    // Get current state
    const clientTorrents = WebTorrentServer.getAllTorrents();
    const dbTorrents = await TorrentsCollection.find({}).fetchAsync();
    
    console.log(`Debug: Found ${clientTorrents.length} torrents in client and ${dbTorrents.length} in database`);
    
    const clientInfoHashes = clientTorrents.map(t => t.infoHash);
    const dbInfoHashes = dbTorrents.map(t => t.infoHash);
    
    // Find torrents in db but not in client
    const toAdd = dbTorrents.filter(t => !clientInfoHashes.includes(t.infoHash));
    
    // Find torrents in client but not in db
    const toSave = clientTorrents.filter(t => !dbInfoHashes.includes(t.infoHash));
    
    console.log(`Debug: Need to add ${toAdd.length} torrents to client and save ${toSave.length} torrents to database`);
    
    // Add missing torrents to client
    const addResults = [];
    for (const torrent of toAdd) {
      try {
        console.log(`Debug: Adding torrent ${torrent.name} (${torrent.infoHash}) to client`);
        await WebTorrentServer.addTorrent(torrent.magnetURI);
        addResults.push({ infoHash: torrent.infoHash, status: 'added' });
      } catch (err) {
        console.error(`Error adding torrent ${torrent.infoHash} to client:`, err);
        addResults.push({ infoHash: torrent.infoHash, status: 'error', message: err.message });
      }
    }
    
    // Save client torrents to database
    const saveResults = [];
    for (const torrent of toSave) {
      try {
        console.log(`Debug: Saving torrent ${torrent.name} (${torrent.infoHash}) to database`);
        await WebTorrentServer._updateTorrentRecord(torrent);
        saveResults.push({ infoHash: torrent.infoHash, status: 'saved' });
      } catch (err) {
        console.error(`Error saving torrent ${torrent.infoHash} to database:`, err);
        saveResults.push({ infoHash: torrent.infoHash, status: 'error', message: err.message });
      }
    }
    
    return {
      status: 'completed',
      added: addResults,
      saved: saveResults
    };
  },
  'debug.checkTorrentConnection': function(infoHash) {
    check(infoHash, String);
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    if (!torrent) {
      return { status: 'error', message: 'Torrent not found in client' };
    }
    
    // Force announce to trackers
    torrent.announce();
    
    return {
      status: 'success',
      infoHash: torrent.infoHash,
      name: torrent.name,
      peers: torrent.numPeers,
      trackers: torrent._trackers ? Object.keys(torrent._trackers) : [],
      wires: (torrent.wires || []).map(wire => ({
        peerId: wire.peerId ? wire.peerId.toString('hex') : 'unknown',
        type: wire.type || 'unknown',
        remoteAddress: wire.remoteAddress
      }))
    };
  },
  'debug.fullTorrentStatus': function(infoHash) {
    check(infoHash, String);
    
    console.log(`Full torrent status check for ${infoHash}`);
    
    // Get the torrent record from the database
    const torrentRecord = TorrentsCollection.findOne({ infoHash });
    
    // Get the actual torrent object from WebTorrentServer
    const torrent = WebTorrentServer.getTorrent(infoHash);
    
    // Storage path check
    const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
    let storageExists = false;
    let storageWritable = false;
    
    try {
      storageExists = fs.existsSync(storagePath);
      if (storageExists) {
        // Test write access
        const testPath = path.join(storagePath, 'test-write-' + Date.now());
        fs.writeFileSync(testPath, 'test');
        fs.unlinkSync(testPath);
        storageWritable = true;
      }
    } catch (err) {
      console.error('Storage path error:', err);
    }
    
    // Check if any files exist for this torrent
    let filesExist = false;
    let filesInfo = [];
    
    if (torrent && torrent.files && torrent.files.length > 0) {
      filesInfo = torrent.files.map(file => {
        let fileExists = false;
        let filePath = '';
        
        try {
          filePath = path.join(storagePath, file.path);
          fileExists = fs.existsSync(filePath);
        } catch (err) {
          console.error(`Error checking file ${file.name}:`, err);
        }
        
        return {
          name: file.name,
          size: file.length,
          exists: fileExists,
          path: filePath
        };
      });
      
      filesExist = filesInfo.some(f => f.exists);
    }
    
    return {
      timestamp: new Date(),
      database: {
        exists: !!torrentRecord,
        name: torrentRecord ? torrentRecord.name : null,
        magnetURI: torrentRecord ? torrentRecord.magnetURI : null,
        status: torrentRecord ? torrentRecord.status : null
      },
      client: {
        exists: !!torrent,
        name: torrent ? torrent.name : null,
        progress: torrent ? torrent.progress : null,
        numPeers: torrent ? torrent.numPeers : 0,
        ready: torrent ? torrent.ready : false,
        files: torrent ? torrent.files.length : 0
      },
      storage: {
        path: storagePath,
        exists: storageExists,
        writable: storageWritable
      },
      files: {
        exist: filesExist,
        info: filesInfo
      }
    };
  },
  'debug.createSampleTorrent': async function() {
    console.log('Creating sample torrent from bundled data');
    
    try {
      // Read the sample file from private directory
      const sampleBundle = await Assets.getTextAsync('sample-bundle.json');
      
      if (!sampleBundle) {
        throw new Meteor.Error('sample-missing', 'Sample bundle file not found');
      }
      
      // Create temporary directory and file
      const tempPath = path.join(Settings.get('private.storage.tempPath', '/tmp/fhir-torrents'), `sample-${Date.now()}`);
      fs.mkdirSync(tempPath, { recursive: true });
      
      const filePath = path.join(tempPath, 'sample-bundle.json');
      fs.writeFileSync(filePath, sampleBundle);
      
      console.log(`Sample file written to ${filePath}`);
      
      // Create torrent
      const result = await WebTorrentServer.createTorrent(tempPath, {
        name: 'Sample FHIR Bundle',
        comment: 'Automatically created sample torrent for testing'
      });
      
      // Update metadata
      await TorrentsCollection.updateAsync(
        { infoHash: result.infoHash },
        { $set: { 
          description: 'Sample FHIR bundle for testing',
          fhirType: 'bundle'
        }}
      );
      
      // Clean up temp files after a delay
      Meteor.setTimeout(function() {
        try {
          fs.unlinkSync(filePath);
          fs.rmdirSync(tempPath);
        } catch (e) {
          console.error('Error cleaning up temp files:', e);
        }
      }, 5000);
      
      return {
        infoHash: result.infoHash,
        name: result.name,
        magnetURI: result.magnetURI
      };
    } catch (error) {
      console.error('Error creating sample torrent:', error);
      throw new Meteor.Error('create-failed', error.message || 'Failed to create sample torrent');
    }
  },
  'debug.testFileRetrieval': async function(infoHash) {
    check(infoHash, String);
    
    console.log(`Testing file retrieval for torrent ${infoHash}`);
    
    try {
      // Get the torrent from WebTorrentServer
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        console.log(`Torrent ${infoHash} not found in client, attempting to reload`);
        const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
        
        if (!torrentRecord || !torrentRecord.magnetURI) {
          throw new Meteor.Error('not-found', 'Torrent not found or has no magnet URI');
        }
        
        await WebTorrentServer.addTorrent(torrentRecord.magnetURI);
        
        // Wait for torrent to initialize
        await new Promise(r => Meteor.setTimeout(r, 2000));
        
        // Try to get the torrent again
        const reloadedTorrent = WebTorrentServer.getTorrent(infoHash);
        
        if (!reloadedTorrent) {
          throw new Meteor.Error('reload-failed', 'Failed to reload torrent');
        }
        
        console.log(`Torrent reloaded, it has ${reloadedTorrent.files.length} files`);
        
        // Test getting the first file directly
        if (reloadedTorrent.files.length > 0) {
          const file = reloadedTorrent.files[0];
          console.log(`Testing direct file retrieval for ${file.name}`);
          
          return new Promise((resolve, reject) => {
            file.getBuffer((err, buffer) => {
              if (err) {
                console.error(`Error getting buffer for ${file.name}:`, err);
                reject(new Meteor.Error('buffer-error', `Error getting file buffer: ${err.message}`));
              } else {
                try {
                  const content = buffer.toString('utf8');
                  console.log(`Successfully got content for ${file.name}, length: ${content.length}`);
                  resolve({
                    success: true,
                    fileName: file.name,
                    contentLength: content.length,
                    contentPreview: content.substring(0, 100) + '...',
                    torrentInfo: {
                      name: reloadedTorrent.name,
                      infoHash: reloadedTorrent.infoHash,
                      progress: reloadedTorrent.progress,
                      numPeers: reloadedTorrent.numPeers
                    }
                  });
                } catch (e) {
                  console.error(`Error processing buffer for ${file.name}:`, e);
                  reject(new Meteor.Error('processing-error', `Error processing file buffer: ${e.message}`));
                }
              }
            });
          });
        } else {
          throw new Meteor.Error('no-files', 'Torrent has no files');
        }
      } else {
        console.log(`Found torrent ${infoHash} with ${torrent.files.length} files`);
        
        // Test getting the first file directly
        if (torrent.files.length > 0) {
          const file = torrent.files[0];
          console.log(`Testing direct file retrieval for ${file.name}`);
          
          return new Promise((resolve, reject) => {
            file.getBuffer((err, buffer) => {
              if (err) {
                console.error(`Error getting buffer for ${file.name}:`, err);
                reject(new Meteor.Error('buffer-error', `Error getting file buffer: ${err.message}`));
              } else {
                try {
                  const content = buffer.toString('utf8');
                  console.log(`Successfully got content for ${file.name}, length: ${content.length}`);
                  resolve({
                    success: true,
                    fileName: file.name,
                    contentLength: content.length,
                    contentPreview: content.substring(0, 100) + '...',
                    torrentInfo: {
                      name: torrent.name,
                      infoHash: torrent.infoHash,
                      progress: torrent.progress,
                      numPeers: torrent.numPeers
                    }
                  });
                } catch (e) {
                  console.error(`Error processing buffer for ${file.name}:`, e);
                  reject(new Meteor.Error('processing-error', `Error processing file buffer: ${e.message}`));
                }
              }
            });
          });
        } else {
          throw new Meteor.Error('no-files', 'Torrent has no files');
        }
      }
    } catch (error) {
      console.error('Error testing file retrieval:', error);
      throw new Meteor.Error('retrieval-failed', error.message || 'Failed to test file retrieval');
    }
  },
  'debug.fixStoragePath': async function() {
    try {
      const fs = Npm.require('fs');
      const path = Npm.require('path');
      
      // Get all torrents from database
      const torrents = await TorrentsCollection.find({}).fetchAsync();
      console.log(`Found ${torrents.length} torrents in database`);
      
      // Get the proper storage path with PORT resolution
      const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
      const port = process.env.PORT || 3000;
      const resolvedPath = storagePath.replace(/\${PORT}/g, port);
      
      console.log(`Raw storage path: ${storagePath}`);
      console.log(`Resolved storage path: ${resolvedPath}`);
      console.log(`Port: ${port}`);
      
      // Ensure the directory exists
      if (!fs.existsSync(resolvedPath)) {
        fs.mkdirSync(resolvedPath, { recursive: true });
        console.log(`Created storage directory: ${resolvedPath}`);
      }
      
      // Check for sample files and create them if missing
      const sampleFiles = {};
      
      try {
        // Try to get sample bundle from Assets
        const sampleData = await Assets.getTextAsync("sample-bundle.json");
        if (sampleData) {
          sampleFiles['sample-bundle.json'] = sampleData;
          
          // Write sample file to storage directory
          const samplePath = path.join(resolvedPath, "sample-bundle.json");
          fs.writeFileSync(samplePath, sampleData, 'utf8');
          console.log(`Created sample file at: ${samplePath} (${sampleData.length} bytes)`);
        }
      } catch (sampleErr) {
        console.log('Could not load sample from Assets:', sampleErr.message);
      }
      
      // Try to get sample resources (NDJSON)
      try {
        const sampleResources = await Assets.getTextAsync("sample-resources.ndjson");
        if (sampleResources) {
          sampleFiles['sample-resources.ndjson'] = sampleResources;
          
          const resourcesPath = path.join(resolvedPath, "sample-resources.ndjson");
          fs.writeFileSync(resourcesPath, sampleResources, 'utf8');
          console.log(`Created sample resources at: ${resourcesPath} (${sampleResources.length} bytes)`);
        }
      } catch (resourcesErr) {
        console.log('Could not load sample resources from Assets:', resourcesErr.message);
      }
      
      // List all files in the storage directory
      const files = fs.readdirSync(resolvedPath);
      console.log(`Files in storage directory: ${files.join(', ')}`);
      
      return {
        status: 'success',
        torrents: torrents.length,
        storagePath: resolvedPath,
        pathExists: fs.existsSync(resolvedPath),
        filesCreated: Object.keys(sampleFiles),
        filesInDirectory: files
      };
    } catch (err) {
      console.error('Error fixing storage path:', err);
      return {
        status: 'error',
        error: err.message
      };
    }
  },
  'debug.testFileRetrievalStrategies': async function(infoHash) {
    check(infoHash, String);
    
    const fs = Npm.require('fs');
    const path = Npm.require('path');
    
    console.log(`Testing file retrieval strategies for torrent ${infoHash}`);
    
    const results = {
      infoHash,
      timestamp: new Date(),
      strategies: {}
    };
    
    try {
      // Get torrent record from database
      const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
      if (!torrentRecord) {
        throw new Error('Torrent not found in database');
      }
      
      results.torrentInfo = {
        name: torrentRecord.name,
        files: torrentRecord.files || [],
        magnetURI: torrentRecord.magnetURI
      };
      
      // Strategy 1: WebTorrent getBuffer
      results.strategies.webTorrent = { status: 'testing' };
      try {
        const torrent = WebTorrentServer.getTorrent(infoHash);
        if (torrent && torrent.files && torrent.files.length > 0) {
          const file = torrent.files[0];
          
          const bufferPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Timeout after 3 seconds'));
            }, 3000);
            
            file.getBuffer((err, buffer) => {
              clearTimeout(timeout);
              if (err) reject(err);
              else resolve(buffer.toString('utf8'));
            });
          });
          
          const content = await bufferPromise;
          results.strategies.webTorrent = {
            status: 'success',
            contentLength: content.length,
            preview: content.substring(0, 100)
          };
        } else {
          results.strategies.webTorrent = {
            status: 'failed',
            reason: 'Torrent not found in client or has no files'
          };
        }
      } catch (err) {
        results.strategies.webTorrent = {
          status: 'failed',
          reason: err.message
        };
      }
      
      // Strategy 2: Direct disk access
      results.strategies.diskAccess = { status: 'testing' };
      try {
        const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
        const port = process.env.PORT || 3000;
        const resolvedPath = storagePath.replace(/\${PORT}/g, port);
        
        const possiblePaths = [
          resolvedPath,
          path.join(resolvedPath, torrentRecord.name || ''),
          path.join(resolvedPath, infoHash)
        ];
        
        let foundContent = null;
        let foundPath = null;
        
        for (const basePath of possiblePaths) {
          if (torrentRecord.files && torrentRecord.files.length > 0) {
            const fileName = torrentRecord.files[0].name;
            const filePath = path.join(basePath, fileName);
            
            if (fs.existsSync(filePath)) {
              foundContent = fs.readFileSync(filePath, 'utf8');
              foundPath = filePath;
              break;
            }
          }
        }
        
        if (foundContent) {
          results.strategies.diskAccess = {
            status: 'success',
            path: foundPath,
            contentLength: foundContent.length,
            preview: foundContent.substring(0, 100)
          };
        } else {
          results.strategies.diskAccess = {
            status: 'failed',
            reason: 'File not found in any expected location',
            searchedPaths: possiblePaths
          };
        }
      } catch (err) {
        results.strategies.diskAccess = {
          status: 'failed',
          reason: err.message
        };
      }
      
      // Strategy 3: Assets fallback (for sample torrent)
      results.strategies.assetsAccess = { status: 'testing' };
      try {
        if (torrentRecord.name === 'Sample FHIR Bundle') {
          const sampleData = await Assets.getTextAsync('sample-bundle.json');
          if (sampleData) {
            results.strategies.assetsAccess = {
              status: 'success',
              contentLength: sampleData.length,
              preview: sampleData.substring(0, 100)
            };
          } else {
            results.strategies.assetsAccess = {
              status: 'failed',
              reason: 'Sample bundle not found in Assets'
            };
          }
        } else {
          results.strategies.assetsAccess = {
            status: 'skipped',
            reason: 'Not a sample torrent'
          };
        }
      } catch (err) {
        results.strategies.assetsAccess = {
          status: 'failed',
          reason: err.message
        };
      }
      
      // Strategy 4: Force recreation for sample
      results.strategies.forceRecreation = { status: 'testing' };
      try {
        if (torrentRecord.name === 'Sample FHIR Bundle') {
          // Get sample data and write it to the expected location
          const sampleData = await Assets.getTextAsync('sample-bundle.json');
          if (sampleData) {
            const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
            const port = process.env.PORT || 3000;
            const resolvedPath = storagePath.replace(/\${PORT}/g, port);
            
            const targetPath = path.join(resolvedPath, 'sample-bundle.json');
            fs.writeFileSync(targetPath, sampleData, 'utf8');
            
            results.strategies.forceRecreation = {
              status: 'success',
              path: targetPath,
              contentLength: sampleData.length,
              preview: sampleData.substring(0, 100)
            };
          } else {
            results.strategies.forceRecreation = {
              status: 'failed',
              reason: 'Could not get sample data from Assets'
            };
          }
        } else {
          results.strategies.forceRecreation = {
            status: 'skipped',
            reason: 'Not a sample torrent'
          };
        }
      } catch (err) {
        results.strategies.forceRecreation = {
          status: 'failed',
          reason: err.message
        };
      }
      
      console.log('File retrieval test completed:', results);
      return results;
      
    } catch (error) {
      console.error('Error testing file retrieval strategies:', error);
      results.error = error.message;
      return results;
    }
  },

  /**
   * Get detailed torrent and peer information
   */
  'debug.getDetailedTorrentInfo': async function(infoHash) {
    check(infoHash, String);
    
    console.log(`Getting detailed info for torrent ${infoHash}`);
    
    try {
      // Get torrent from database
      const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
      
      // Get torrent from WebTorrent client
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      // Storage path info
      const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
      const port = process.env.PORT || 3000;
      const resolvedPath = storagePath.replace(/\${PORT}/g, port);
      
      const result = {
        infoHash,
        database: {
          exists: !!torrentRecord,
          data: torrentRecord ? {
            name: torrentRecord.name,
            magnetURI: torrentRecord.magnetURI,
            files: torrentRecord.files,
            status: torrentRecord.status
          } : null
        },
        client: {
          exists: !!torrent,
          data: torrent ? {
            name: torrent.name,
            progress: torrent.progress,
            downloaded: torrent.downloaded,
            uploaded: torrent.uploaded,
            downloadSpeed: torrent.downloadSpeed,
            uploadSpeed: torrent.uploadSpeed,
            numPeers: torrent.numPeers,
            ready: torrent.ready,
            files: torrent.files.map(f => ({
              name: f.name,
              length: f.length,
              path: f.path
            })),
            wires: torrent.wires ? torrent.wires.map(w => ({
              peerId: w.peerId ? w.peerId.toString('hex') : 'unknown',
              remoteAddress: w.remoteAddress,
              downloadSpeed: w.downloadSpeed ? w.downloadSpeed() : 0,
              uploadSpeed: w.uploadSpeed ? w.uploadSpeed() : 0
            })) : []
          } : null
        },
        storage: {
          configPath: storagePath,
          resolvedPath: resolvedPath,
          port: port,
          exists: require('fs').existsSync(resolvedPath)
        }
      };
      
      console.log('Detailed torrent info:', result);
      return result;
      
    } catch (error) {
      console.error('Error getting detailed torrent info:', error);
      throw new Meteor.Error('info-failed', error.message);
    }
  }
});