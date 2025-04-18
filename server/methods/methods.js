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
    };
  }
});