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
  }
});