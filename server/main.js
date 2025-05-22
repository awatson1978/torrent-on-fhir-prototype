import * as fs from 'fs';

import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';
import { TorrentsCollection } from '/imports/api/torrents/torrents';
import { Settings } from '/imports/api/settings/settings';
// import { WebTorrentServer } from './webtorrent-server';
import { WebTorrentServer } from './webtorrent-server-enhanced';

// Import methods
import './methods/torrent-methods';
import './methods/peer-methods';
import './methods/network-methods';
import './methods/debug-methods';
import './methods/methods';
import './methods/metadata-methods';

import './tracker-fix';


Meteor.startup(async () => {
  console.log('Starting FHIR P2P server...');
  
  // Load settings from environment variables
  const loadEnvSettings = function() {
    // Define the mapping of environment variables to settings
    const envMappings = {
      'WEBTORRENT_TRACKERS': 'public.webtorrent.trackers',
      'WEBTORRENT_DHT': 'public.webtorrent.dht',
      'WEBTORRENT_WEBSEEDS': 'public.webtorrent.webSeeds',
      'FHIR_VALIDATION_LEVEL': 'public.fhir.validationLevel',
      'FHIR_DEFAULT_FORMAT': 'public.fhir.defaultFormat',
      'UI_THEME': 'public.ui.theme',
      'UI_DENSITY': 'public.ui.density',
      'STORAGE_TEMP_PATH': 'private.storage.tempPath',
      'DEBUG': 'private.debug'
    };
    
    // Process each environment variable
    Object.keys(envMappings).forEach(function(envVar) {
      if (process.env[envVar] !== undefined) {
        const settingPath = envMappings[envVar];
        const parts = settingPath.split('.');
        
        // Get the current settings object
        let currentSettings = Meteor.settings;
        if (!currentSettings) {
          currentSettings = {};
          Meteor.settings = currentSettings;
        }
        
        // Navigate to the right spot in the settings object
        let current = currentSettings;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i];
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
        
        // Set the value
        const lastPart = parts[parts.length - 1];
        
        // Parse boolean and numeric values
        let value = process.env[envVar];
        if (value === 'true') value = true;
        if (value === 'false') value = false;
        if (!isNaN(value) && value !== '') value = Number(value);
        
        // Handle arrays (comma-separated values)
        if (typeof value === 'string' && value.includes(',')) {
          value = value.split(',').map(item => item.trim());
        }
        
        current[lastPart] = value;
      }
    });
  };
  
  // Load environment variables into settings
  loadEnvSettings();

  
  // Log configuration
  if (get(Meteor.settings, 'private.debug', false)) {
    console.log('Configuration loaded:', JSON.stringify(Meteor.settings, null, 2));
  }
  
  // After loading settings but before initializing WebTorrent
  const port = process.env.PORT || 3000;
  const tempPathTemplate = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
  const tempPath = tempPathTemplate.replace(/\${PORT}/g, port);

  console.log(`Storage directory for port ${port}: ${tempPath}`);

  // Make sure the directory exists
  if (!fs.existsSync(tempPath)) {
    try {
      fs.mkdirSync(tempPath, { recursive: true });
      console.log(`Created storage directory: ${tempPath}`);
    } catch (err) {
      console.error(`Error creating storage directory: ${err.message}`);
    }
  }

  
  // In a real app, we'd create the directory if it doesn't exist
  console.log(`Storage directory: ${tempPath}`);
  
  // We publish the entire Torrents collection to all clients
  Meteor.publish('torrents.all', function () {
    return TorrentsCollection.find();
  });
  
  // Publish a single torrent by ID
  Meteor.publish('torrents.single', function (torrentId) {
    return TorrentsCollection.find({ _id: torrentId });
  });
  
  // Initialize WebTorrent server
  try {
    console.log('Initializing WebTorrent server...');
    WebTorrentServer.initialize()
      .then(function(client) {
        console.log('WebTorrent server initialized successfully!');
      })
      .catch(function(err) {
        console.error('Failed to initialize WebTorrent server:', err);
      });
  } catch (err) {
    console.error('Error during WebTorrent server initialization:', err);
  }
  
  console.log('FHIR P2P server started successfully');

  console.log('Setting up additional WebTorrent initialization');
  Meteor.setTimeout(async function() {
    try {
      const client = WebTorrentServer.getClient();
      if (!client) {
        console.log('WebTorrent client not initialized yet, trying to initialize...');
        await WebTorrentServer.initialize();
      } else {
        console.log('WebTorrent client already initialized, checking trackers...');
        
        // Check if trackers are active
        const trackers = client._trackers ? Object.keys(client._trackers) : [];
        console.log(`WebTorrent has ${trackers.length} active trackers`);
        
        if (trackers.length === 0) {
          // Reinitialize trackers
          const config = Settings.getWebTorrentConfig();
          console.log('No active trackers, adding from config:', config.tracker);
          
          if (Array.isArray(config.tracker)) {
            config.tracker.forEach(function(trackerUrl) {
              try {
                console.log(`Adding tracker: ${trackerUrl}`);
                // client.tracker.add(trackerUrl);
                if (client && typeof client.addTracker === 'function') {
                  console.log(`Adding tracker: ${trackerUrl}`);
                  client.addTracker(trackerUrl);
                } else {
                  console.log('Client does not have addTracker method, will need to add trackers when creating torrents');
                }
              } catch (e) {
                console.error(`Error adding tracker ${trackerUrl}:`, e);
              }
            });
          }
        }
      }
    } catch (err) {
      console.error('Error in additional WebTorrent initialization:', err);
    }
  }, 15000); // Run after 15 seconds
});