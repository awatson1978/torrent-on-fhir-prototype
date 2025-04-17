import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';
import fs from 'fs';
import path from 'path';
import { Settings } from '/imports/api/settings/settings';
import { TorrentsCollection } from '/imports/api/torrents/torrents';

// Server-side WebTorrent client
let client = null;
let isInitializing = false;
let initializePromise = null;
let WebTorrent = null;

/**
 * WebTorrent server service
 * Manages the WebTorrent client and torrent instances on the server
 */
export const WebTorrentServer = {
  _torrents: new Map(),
  
  /**
   * Initialize the WebTorrent client
   * @return {Promise<Object>} The WebTorrent client instance
   */
  initialize: function() {
    // Return existing client if already initialized
    if (client) {
      console.log('WebTorrent server already initialized');
      return Promise.resolve(client);
    }
    
    // Return existing promise if initialization is in progress
    if (isInitializing && initializePromise) {
      console.log('WebTorrent server initialization in progress');
      return initializePromise;
    }
    
    console.log('Starting WebTorrent server initialization');
    isInitializing = true;
    
    // Create a promise for the initialization
    initializePromise = new Promise(function(resolve, reject) {
      try {
        // Use require instead of import to avoid top-level await
        if (!WebTorrent) {
          try {
            // First try the regular require
            WebTorrent = require('webtorrent');
          } catch (err) {
            console.error('Error requiring WebTorrent directly:', err);
            
            // If that fails, try to get it from npm
            try {
              WebTorrent = require('webtorrent/index.js');
            } catch (err2) {
              console.error('Error requiring WebTorrent from index.js:', err2);
              throw new Error('Could not load WebTorrent module');
            }
          }
        }
        
        const config = Settings.getWebTorrentConfig();
        
        console.log('Creating WebTorrent server with config:', config);
        
        // Create storage directory if it doesn't exist
        const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
        if (!fs.existsSync(storagePath)) {
          fs.mkdirSync(storagePath, { recursive: true });
          console.log(`Created storage directory: ${storagePath}`);
        }
        
        client = new WebTorrent({
          tracker: config.tracker,
          dht: config.dht,
          webSeeds: config.webSeeds
        });
        
        client.on('error', function(err) {
          console.error('WebTorrent server error:', err);
        });
        
        console.log('WebTorrent server initialized successfully!');
        isInitializing = false;
        resolve(client);
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
   * @return {Promise<Object>} Promise resolving to the torrent
   */
  addTorrent: function(torrentId, opts = {}) {
    const self = this;
    
    return new Promise(function(resolve, reject) {
      try {
        const torrentClient = self.getClient();
        
        if (!torrentClient) {
          return self.initialize().then(function(initializedClient) {
            return self.addTorrent(torrentId, opts);
          }).then(resolve).catch(reject);
        }
        
        // Set the download path
        const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
        const options = {
          path: storagePath,
          ...opts
        };
        
        torrentClient.add(torrentId, options, function(torrent) {
          // Store reference to the torrent
          self._torrents.set(torrent.infoHash, torrent);
          
          // Setup event handlers
          self._setupTorrentEvents(torrent);
          
          // Insert or update torrent record in collection
          self._updateTorrentRecord(torrent);
          
          resolve(torrent);
        });
      } catch (err) {
        reject(err);
      }
    });
  },
  
  /**
   * Create a new torrent from files
   * @param {Array|Buffer|String} files - Files to add to the torrent
   * @param {Object} opts - Options for the torrent
   * @return {Promise<Object>} Promise resolving to the torrent
   */
  createTorrent: function(files, opts = {}) {
    const self = this;
    
    return new Promise(function(resolve, reject) {
      try {
        const torrentClient = self.getClient();
        
        if (!torrentClient) {
          return self.initialize().then(function(initializedClient) {
            return self.createTorrent(files, opts);
          }).then(resolve).catch(reject);
        }
        
        // Set the seed path
        const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
        const options = {
          path: storagePath,
          ...opts
        };
        
        torrentClient.seed(files, options, function(torrent) {
          // Store reference to the torrent
          self._torrents.set(torrent.infoHash, torrent);
          
          // Setup event handlers
          self._setupTorrentEvents(torrent);
          
          // Insert new torrent record in collection
          self._updateTorrentRecord(torrent);
          
          resolve(torrent);
        });
      } catch (err) {
        reject(err);
      }
    });
  },
  
  /**
   * Get file contents from a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @param {String} filename - Name of the file to get
   * @return {Promise<String>} Promise resolving to file contents
   */
  getFileContents: function(infoHash, filename) {
    const self = this;
    
    return new Promise(function(resolve, reject) {
      const torrent = self._torrents.get(infoHash);
      
      if (!torrent) {
        return reject(new Meteor.Error('not-found', 'Torrent not found'));
      }
      
      // Find the file in the torrent
      const file = torrent.files.find(f => f.name === filename);
      
      if (!file) {
        return reject(new Meteor.Error('not-found', 'File not found in torrent'));
      }
      
      file.getBuffer(function(err, buffer) {
        if (err) {
          return reject(err);
        }
        
        // Convert buffer to string
        try {
          const content = buffer.toString('utf8');
          resolve(content);
        } catch (e) {
          reject(e);
        }
      });
    });
  },
  
  /**
   * Get all files from a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @return {Promise<Object>} Promise resolving to object with file contents
   */
  getAllFileContents: function(infoHash) {
    const self = this;
    
    return new Promise(function(resolve, reject) {
      const torrent = self._torrents.get(infoHash);
      
      if (!torrent) {
        return reject(new Meteor.Error('not-found', 'Torrent not found'));
      }
      
      const filePromises = torrent.files.map(function(file) {
        return new Promise(function(resolveFile, rejectFile) {
          file.getBuffer(function(err, buffer) {
            if (err) {
              return rejectFile(err);
            }
            
            try {
              const content = buffer.toString('utf8');
              resolveFile({ name: file.name, content });
            } catch (e) {
              rejectFile(e);
            }
          });
        });
      });
      
      Promise.all(filePromises)
        .then(function(filesWithContent) {
          const contents = {};
          filesWithContent.forEach(function(file) {
            contents[file.name] = file.content;
          });
          resolve(contents);
        })
        .catch(reject);
    });
  },
  
  /**
   * Remove a torrent from the client
   * @param {String} infoHash - Info hash of the torrent to remove
   * @param {Boolean} removeFiles - Whether to remove downloaded files
   * @return {Promise<Boolean>} Promise resolving when torrent is removed
   */
  removeTorrent: function(infoHash, removeFiles = false) {
    const self = this;
    
    return new Promise(function(resolve, reject) {
      const torrent = self._torrents.get(infoHash);
      
      if (!torrent) {
        TorrentsCollection.remove({ infoHash });
        return resolve(true); // Torrent not found, but remove from collection anyway
      }
      
      torrent.destroy({ destroyStore: removeFiles }, function(err) {
        if (err) {
          return reject(err);
        }
        
        self._torrents.delete(infoHash);
        
        // Remove from collection
        TorrentsCollection.remove({ infoHash });
        resolve(true);
      });
    });
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
    const files = torrent.files.map(function(file) {
      return {
        name: file.name,
        path: file.path,
        size: file.length,
        type: file.type || 'application/octet-stream'
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
  }
};

// Initialize client on server startup
Meteor.startup(function() {
  console.log('Initializing WebTorrent server...');
  WebTorrentServer.initialize()
    .then(function() {
      console.log('WebTorrent server initialized successfully!');
    })
    .catch(function(err) {
      console.error('Failed to initialize WebTorrent server:', err);
    });
});