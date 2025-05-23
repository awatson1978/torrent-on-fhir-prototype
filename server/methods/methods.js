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
  'debug.getServerInfo': function() {
    return {
      meteorVersion: Meteor.release,
      nodeVersion: process.version,
      settings: {
        webTorrent: Settings.getWebTorrentConfig(),
        fhir: Settings.getFhirConfig(),
        ui: Settings.getUIConfig()
      },
      environment: {
        nodeEnv: process.env.NODE_ENV || 'development',
        rootUrl: process.env.ROOT_URL || Meteor.absoluteUrl(),
      }
    };
  },

  'debug.getTorrentInfo': async function() {
    const client = WebTorrentServer.getClient();
    if (!client) return { status: 'Client not initialized' };
    
    const torrents = WebTorrentServer.getAllTorrents();
    console.log(`Debug: Server has ${torrents.length} torrents loaded in WebTorrent client`);
    
    const collectionTorrents = await TorrentsCollection.find({}).fetchAsync();
    console.log(`Debug: Server has ${collectionTorrents.length} torrents in the MongoDB collection`);
    
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
    
    const client = WebTorrentServer.getClient();
    const clientInitialized = !!client;
    const torrents = WebTorrentServer.getAllTorrents();
    
    let dbTorrents = [];
    try {
      dbTorrents = await TorrentsCollection.find({}).fetchAsync();
    } catch (err) {
      console.error('Error fetching torrents from database:', err);
    }
    
    const torrentsPublication = Meteor.server.publish_handlers['torrents.all'];
    const subCount = torrentsPublication ? Object.keys(torrentsPublication._documents || {}).length : 0;
    
    let trackerUrls = [];
    if (client && client._trackers) {
      trackerUrls = Object.keys(client._trackers);
    } else if (Settings) {
      const config = Settings.getWebTorrentConfig();
      trackerUrls = config.tracker || [];
    }
    
    // Enhanced announce with better error handling
    if (torrents.length > 0) {
      torrents.forEach(torrent => {
        console.log(`Debug: Attempting to announce torrent ${torrent.name} (${torrent.infoHash})`);
        try {
          // Use the same safe announce logic as in WebTorrentServer
          if (typeof torrent.announce === 'function') {
            torrent.announce();
            console.log(`Successfully announced torrent ${torrent.name}`);
          } else if (torrent._announce && typeof torrent._announce === 'function') {
            torrent._announce();
            console.log(`Used _announce for torrent ${torrent.name}`);
          } else if (torrent.discovery && typeof torrent.discovery.announce === 'function') {
            torrent.discovery.announce();
            console.log(`Used discovery.announce for torrent ${torrent.name}`);
          } else if (torrent.discovery) {
            // Try DHT announce if available
            if (torrent.discovery.dht && typeof torrent.discovery.dht.announce === 'function') {
              torrent.discovery.dht.announce(torrent.infoHash);
              console.log(`Used DHT announce for torrent ${torrent.name}`);
            } else {
              console.log(`No announce methods available for torrent ${torrent.name}`);
            }
          } else {
            console.log(`No discovery object available for torrent ${torrent.name}`);
          }
        } catch (e) {
          console.warn(`Error announcing torrent ${torrent.name}:`, e.message);
        }
      });
    }
    
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
        ready: true,
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
    
    const clientTorrents = WebTorrentServer.getAllTorrents();
    const dbTorrents = await TorrentsCollection.find({}).fetchAsync();
    
    console.log(`Debug: Found ${clientTorrents.length} torrents in client and ${dbTorrents.length} in database`);
    
    const clientInfoHashes = clientTorrents.map(t => t.infoHash);
    const dbInfoHashes = dbTorrents.map(t => t.infoHash);
    
    const toAdd = dbTorrents.filter(t => !clientInfoHashes.includes(t.infoHash));
    const toSave = clientTorrents.filter(t => !dbInfoHashes.includes(t.infoHash));
    
    console.log(`Debug: Need to add ${toAdd.length} torrents to client and save ${toSave.length} torrents to database`);
    
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
    
    // Safe announce
    try {
      if (typeof torrent.announce === 'function') {
        torrent.announce();
      } else if (torrent.discovery && typeof torrent.discovery.announce === 'function') {
        torrent.discovery.announce();
      }
    } catch (e) {
      console.warn('Error announcing torrent:', e.message);
    }
    
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
    
    const torrentRecord = TorrentsCollection.findOne({ infoHash });
    const torrent = WebTorrentServer.getTorrent(infoHash);
    
    const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
    let storageExists = false;
    let storageWritable = false;
    
    try {
      storageExists = fs.existsSync(storagePath);
      if (storageExists) {
        const testPath = path.join(storagePath, 'test-write-' + Date.now());
        fs.writeFileSync(testPath, 'test');
        fs.unlinkSync(testPath);
        storageWritable = true;
      }
    } catch (err) {
      console.error('Storage path error:', err);
    }
    
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

  'debug.fixStoragePath': async function() {
    try {
      const fs = Npm.require('fs');
      const path = Npm.require('path');
      
      const torrents = await TorrentsCollection.find({}).fetchAsync();
      console.log(`Found ${torrents.length} torrents in database`);
      
      const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
      const port = process.env.PORT || 3000;
      const resolvedPath = storagePath.replace(/\${PORT}/g, port);
      
      console.log(`Raw storage path: ${storagePath}`);
      console.log(`Resolved storage path: ${resolvedPath}`);
      console.log(`Port: ${port}`);
      
      if (!fs.existsSync(resolvedPath)) {
        fs.mkdirSync(resolvedPath, { recursive: true });
        console.log(`Created storage directory: ${resolvedPath}`);
      }
      
      const sampleFiles = {};
      
      try {
        const sampleData = await Assets.getTextAsync("sample-bundle.json");
        if (sampleData) {
          sampleFiles['sample-bundle.json'] = sampleData;
          const samplePath = path.join(resolvedPath, "sample-bundle.json");
          fs.writeFileSync(samplePath, sampleData, 'utf8');
          console.log(`Created sample file at: ${samplePath} (${sampleData.length} bytes)`);
        }
      } catch (sampleErr) {
        console.log('Could not load sample from Assets:', sampleErr.message);
      }
      
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