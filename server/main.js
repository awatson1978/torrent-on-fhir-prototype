import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';
import { TorrentsCollection } from '/imports/api/torrents/torrents';
import { Settings } from '/imports/api/settings/settings';

// Import methods
import './methods';

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
  
  // Make sure we have the default storage directory
  const tempPath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
  
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
  
  console.log('FHIR P2P server started successfully');
});