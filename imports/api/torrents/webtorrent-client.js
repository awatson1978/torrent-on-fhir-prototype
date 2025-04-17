import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';
import { Settings } from '../settings/settings';
import { TorrentsCollection } from './torrents';
import { BrowserWebTorrent } from './browser-webtorrent';

// We'll load WebTorrent dynamically on the client
let client = null;

// Variables to track initialization state
let isInitializing = false;
let initializePromise = null;

/**
 * WebTorrent client service
 * Manages the WebTorrent client and torrent instances
 */
export const WebTorrentClient = {
  _torrents: new Map(),
  
  /**
   * Initialize the WebTorrent client
   * @return {Object} The WebTorrent client instance
   */
  initialize: function() {
    if (!Meteor.isClient) return Promise.resolve(null);
    
    // Return existing client if already initialized
    if (client) {
      console.log('WebTorrent client already initialized');
      return Promise.resolve(client);
    }
    
    // Return existing promise if initialization is in progress
    if (isInitializing && initializePromise) {
      console.log('WebTorrent client initialization in progress');
      return initializePromise;
    }
    
    console.log('Starting WebTorrent client initialization');
    isInitializing = true;
    
    // Create a promise for the initialization
    initializePromise = new Promise(function(resolve, reject) {
      try {
        // Make sure Buffer is defined for browser environment
        if (typeof global !== 'undefined' && !global.Buffer) {
          try {
            console.log('Setting up Buffer polyfill');
            global.Buffer = global.Buffer || require('buffer').Buffer;
          } catch (e) {
            console.error('Failed to set up Buffer polyfill:', e);
          }
        }
        
        // In Meteor, we need to use the dynamic import approach
        // This will load WebTorrent asynchronously
        import('webtorrent').then(function(WebTorrentModule) {
          try {
            const WebTorrent = WebTorrentModule.default || WebTorrentModule;
            const config = Settings.getWebTorrentConfig();
            
            console.log('Creating WebTorrent client with config:', config);
            
            // Create client with error handling
            client = new WebTorrent({
              tracker: config.tracker,
              dht: config.dht,
              webSeeds: config.webSeeds
            });
            
            client.on('error', function(err) {
              console.error('WebTorrent client error:', err);
            });
            
            console.log('WebTorrent client initialized successfully!');
            isInitializing = false;
            resolve(client);
          } catch (err) {
            console.error('Error creating WebTorrent client:', err);
            isInitializing = false;
            reject(err);
          }
        }).catch(function(err) {
          console.error('Error importing WebTorrent:', err);
          isInitializing = false;
          reject(err);
        });
      } catch (err) {
        console.error('Error during WebTorrent initialization:', err);
        isInitializing = false;
        reject(err);
      }
    });
    
    return initializePromise;
  },
  
  /**
   * Get the WebTorrent client instance
   * @return {Object} The WebTorrent client
   */
  getClient: function() {
    return client;
  },
  
  /**
   * Add a torrent to the client
   * @param {String} torrentId - Magnet URI, info hash, or torrent file
   * @param {Object} opts - Options for the torrent
   * @param {Function} callback - Called when torrent is ready
   */
  addTorrent: function(torrentId, opts = {}, callback) {
    if (!Meteor.isClient) return null;
    
    const self = this;
    const torrentClient = this.getClient();
    
    if (!torrentClient) {
      console.error('WebTorrent client not initialized yet');
      // Try to initialize again
      this.initialize()
        .then(function(client) {
          if (client) {
            self.addTorrent(torrentId, opts, callback);
          }
        })
        .catch(function(err) {
          console.error('Failed to initialize WebTorrent client:', err);
          if (callback && typeof callback === 'function') {
            callback(null); // Call with null to indicate error
          }
        });
      return;
    }
    
    try {
      torrentClient.add(torrentId, opts, function(torrent) {
        // Store reference to the torrent
        self._torrents.set(torrent.infoHash, torrent);
        
        // Setup event handlers
        self._setupTorrentEvents(torrent);
        
        // Insert or update torrent record in collection
        self._updateTorrentRecord(torrent);
        
        // Call the callback if provided
        if (callback && typeof callback === 'function') {
          callback(torrent);
        }
      });
    } catch (err) {
      console.error('Error adding torrent:', err);
      if (callback && typeof callback === 'function') {
        callback(null); // Call with null to indicate error
      }
    }
  },
  
  /**
   * Create a new torrent from files
   * @param {Array|File} files - Files to add to the torrent
   * @param {Object} opts - Options for the torrent
   * @param {Function} callback - Called when torrent is ready
   */
  createTorrent: function(files, opts = {}, callback) {
    if (!Meteor.isClient) return null;
    
    const self = this;
    const torrentClient = this.getClient();
    
    if (!torrentClient) {
      console.error('WebTorrent client not initialized yet');
      // Try to initialize again
      this.initialize()
        .then(function(client) {
          if (client) {
            self.createTorrent(files, opts, callback);
          }
        })
        .catch(function(err) {
          console.error('Failed to initialize WebTorrent client:', err);
          if (callback && typeof callback === 'function') {
            callback(null); // Call with null to indicate error
          }
        });
      return;
    }
    
    try {
      torrentClient.seed(files, opts, function(torrent) {
        // Store reference to the torrent
        self._torrents.set(torrent.infoHash, torrent);
        
        // Setup event handlers
        self._setupTorrentEvents(torrent);
        
        // Insert new torrent record in collection
        self._updateTorrentRecord(torrent);
        
        // Call the callback if provided
        if (callback && typeof callback === 'function') {
          callback(torrent);
        }
      });
    } catch (err) {
      console.error('Error creating torrent:', err);
      if (callback && typeof callback === 'function') {
        callback(null); // Call with null to indicate error
      }
    }
  },
  
  /**
   * Remove a torrent from the client
   * @param {String} infoHash - Info hash of the torrent to remove
   * @param {Boolean} removeFiles - Whether to remove downloaded files
   */
  removeTorrent: function(infoHash, removeFiles = false) {
    if (!Meteor.isClient) return;
    
    const torrent = this._torrents.get(infoHash);
    
    if (torrent) {
      try {
        torrent.destroy({ destroyStore: removeFiles });
        this._torrents.delete(infoHash);
        
        // Remove from collection
        TorrentsCollection.remove({ infoHash: infoHash });
      } catch (err) {
        console.error('Error removing torrent:', err);
      }
    }
  },
  
  /**
   * Get a torrent by info hash
   * @param {String} infoHash - Info hash of the torrent
   * @return {Object} The torrent instance
   */
  getTorrent: function(infoHash) {
    return this._torrents.get(infoHash);
  },
  
  /**
   * Get all active torrents
   * @return {Array} Array of torrent instances
   */
  getAllTorrents: function() {
    return Array.from(this._torrents.values());
  },
  
  /**
   * Setup event handlers for a torrent
   * @private
   * @param {Object} torrent - The torrent instance
   */
  _setupTorrentEvents: function(torrent) {
    const self = this;
    
    // Update status periodically
    const updateInterval = Meteor.setInterval(function() {
      self._updateTorrentRecord(torrent);
    }, 1000);
    
    // Clear interval when torrent is removed
    torrent.on('close', function() {
      Meteor.clearInterval(updateInterval);
    });
    
    // Handle download completion
    torrent.on('done', function() {
      self._updateTorrentRecord(torrent);
    });
    
    // Handle errors
    torrent.on('error', function(err) {
      console.error('Torrent error:', err);
    });
    
    // Handle wire connections (peers)
    torrent.on('wire', function(wire) {
      self._updateTorrentRecord(torrent);
      
      wire.on('close', function() {
        self._updateTorrentRecord(torrent);
      });
    });
  },
  
  /**
   * Update or insert torrent record in collection
   * @private
   * @param {Object} torrent - The torrent instance
   */
  _updateTorrentRecord: function(torrent) {
    try {
      const files = torrent.files.map(function(file) {
        return {
          name: file.name,
          path: file.path,
          size: file.length,
          type: file.type
        };
      });
      
      const torrentData = {
        infoHash: torrent.infoHash,
        name: torrent.name,
        magnetURI: torrent.magnetURI,
        size: torrent.length,
        files: files,
        status: {
          downloaded: torrent.downloaded,
          uploaded: torrent.uploaded,
          downloadSpeed: torrent.downloadSpeed,
          uploadSpeed: torrent.uploadSpeed,
          progress: torrent.progress,
          peers: torrent.numPeers,
          seeds: torrent.numPeers - get(torrent, '_peersLength', 0),
          state: torrent.done ? 'seeding' : 
                 torrent.paused ? 'paused' : 'downloading'
        }
      };
      
      // Check if torrent exists in collection
      const existing = TorrentsCollection.findOne({ infoHash: torrent.infoHash });
      
      if (existing) {
        TorrentsCollection.update(
          { infoHash: torrent.infoHash },
          { $set: torrentData }
        );
      } else {
        // Add creation date and other initial data
        torrentData.created = new Date();
        torrentData.description = '';
        torrentData.fhirType = 'unknown';
        torrentData.meta = {
          fhirVersion: '',
          resourceCount: 0,
          profile: ''
        };
        
        TorrentsCollection.insert(torrentData);
      }
    } catch (err) {
      console.error('Error updating torrent record:', err);
    }
  }
};

// Initialize client on startup if we're on the client
Meteor.startup(function() {
  if (Meteor.isClient) {
    // Delay WebTorrent initialization to ensure all client libraries are loaded
    Meteor.setTimeout(function() {
      // WebTorrentClient.initialize()
      //   .then(function(client) {
      //     console.log('WebTorrent client initialized from startup');
      //   })
      //   .catch(function(err) {
      //     console.error('Failed to initialize WebTorrent client from startup:', err);
      //   });
    }, 1000);
  }
});