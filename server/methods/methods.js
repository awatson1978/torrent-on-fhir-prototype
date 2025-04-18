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
      }
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
  }
});