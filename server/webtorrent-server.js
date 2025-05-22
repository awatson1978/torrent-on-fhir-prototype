// server/webtorrent-server.js - Enhanced version with better duplicate torrent handling

import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';
import fs from 'fs';
import path from 'path';
import { Settings } from '/imports/api/settings/settings';
import { TorrentsCollection } from '/imports/api/torrents/torrents';
import parseTorrent from './parse-torrent-wrapper';
import { TorrentParser } from './utils/torrent-parser';

// Server-side WebTorrent client
let client = null;
let isInitializing = false;
let initializePromise = null;

// Helper function to resolve storage path with proper PORT substitution
function getResolvedStoragePath() {
  const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
  const port = process.env.PORT || 3000;
  return storagePath.replace(/\$\{PORT\}/g, port);
}

// Use require at the top-level instead of within functions
let WebTorrent = null;
try {
  WebTorrent = require('webtorrent');
  console.log('WebTorrent loaded successfully at startup');
} catch (err) {
  console.error('Error requiring WebTorrent directly, will try again during initialization:', err);
}

/**
 * Safe announce wrapper function that checks if the announce method exists
 * @param {Object} torrent - The torrent to announce
 */
function safeAnnounce(torrent) {
  if (!torrent) return;
  
  try {
    // Check if the torrent has an announce method
    if (typeof torrent.announce === 'function') {
      torrent.announce();
      console.log(`Announced torrent ${torrent.name || 'Unnamed'} (${torrent.infoHash}) to trackers`);
    } else if (torrent._announce && typeof torrent._announce === 'function') {
      torrent._announce();
      console.log(`Used _announce for torrent ${torrent.name || 'Unnamed'} (${torrent.infoHash})`);
    } else if (torrent.discovery && typeof torrent.discovery.announce === 'function') {
      torrent.discovery.announce();
      console.log(`Used discovery.announce for torrent ${torrent.name || 'Unnamed'} (${torrent.infoHash})`);
    } else {
      // If no announce method is available, try DHT announce
      if (torrent.discovery) {
        if (torrent.discovery.dht && typeof torrent.discovery.dht.announce === 'function') {
          torrent.discovery.dht.announce(torrent.infoHash);
          console.log(`Used DHT announce for torrent ${torrent.infoHash}`);
        }
        
        if (torrent.discovery.tracker && typeof torrent.discovery.tracker.announce === 'function') {
          torrent.discovery.tracker.announce();
          console.log(`Used tracker announce for torrent ${torrent.infoHash}`);
        }
      } else {
        console.log(`No announce method available for torrent ${torrent.infoHash}`);
      }
    }
  } catch (err) {
    console.warn(`Error trying to announce torrent ${torrent ? torrent.infoHash : 'unknown'}:`, err.message);
  }
}

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
        // Try to load WebTorrent
        if (!WebTorrent) {
          try {
            WebTorrent = require('webtorrent');
            console.log('WebTorrent loaded successfully during initialization');
          } catch (err) {
            console.error('Error requiring WebTorrent:', err);
            try {
              const npmPath = require('path').join(process.cwd(), 'node_modules', 'webtorrent');
              WebTorrent = require(npmPath);
              console.log('WebTorrent loaded from npm path');
            } catch (err2) {
              console.error('Failed to load WebTorrent from npm path:', err2);
              reject(new Error('Could not load WebTorrent module'));
              return;
            }
          }
        }
        
        if (!WebTorrent) {
          reject(new Error('WebTorrent module not available'));
          return;
        }
        
        const config = Settings.getWebTorrentConfig();
        console.log('Creating WebTorrent server with config:', config);
        
        const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
        const port = process.env.PORT || 3000;
        const resolvedPath = storagePath.replace(/\${PORT}/g, port);
        
        console.log(`Using resolved storage path: ${resolvedPath}`);

        if (!fs.existsSync(resolvedPath)) {
          fs.mkdirSync(resolvedPath, { recursive: true });
          console.log(`Created storage directory: ${resolvedPath}`);
        }
        
        try {
          client = new WebTorrent({
            tracker: config.tracker,
            dht: config.dht,
            webSeeds: config.webSeeds,
            path: resolvedPath
          });
          
          if (!client) {
            throw new Error('WebTorrent client creation returned null/undefined');
          }
          
          client.on('error', function(err) {
            console.error('WebTorrent server error:', err);
          });
          
          console.log('WebTorrent server initialized successfully!');
          
          // Now that client is initialized, load all existing torrents from database
          this._loadTorrentsFromDatabase();
          this._initializeTrackers();

          if (client.dht && typeof client.dht.bootstrap === 'function') {
            console.log('Bootstrapping DHT...');
            try {
              client.dht.bootstrap();
            } catch (e) {
              console.warn('Error bootstrapping DHT:', e);
            }
          }
          
          isInitializing = false;
          resolve(client);
        } catch (err) {
          console.error('Error creating WebTorrent client:', err);
          isInitializing = false;
          reject(err);
        }
      } catch (err) {
        console.error('Error during WebTorrent initialization:', err);
        isInitializing = false;
        reject(err);
      }
    }.bind(this));
    
    return initializePromise;
  },

  /**
   * Get file contents directly from disk for a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @return {Promise<Object>} Object with filename keys and content values
   */
  getFileContentsFromDisk: async function(infoHash) {
    const fs = Npm.require('fs');
    const path = Npm.require('path');
    
    try {
      const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
      
      if (!torrentRecord || !torrentRecord.files || torrentRecord.files.length === 0) {
        throw new Error('Torrent not found or has no files');
      }
      
      const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
      const port = process.env.PORT || 3000;
      const resolvedPath = storagePath.replace(/\${PORT}/g, port);
      
      console.log(`Checking for files on disk in: ${resolvedPath}`);
      
      const contents = {};
      
      for (const fileInfo of torrentRecord.files) {
        const filePath = path.join(resolvedPath, fileInfo.name);
        console.log(`Checking for file: ${filePath}`);
        
        try {
          if (fs.existsSync(filePath)) {
            contents[fileInfo.name] = fs.readFileSync(filePath, 'utf8');
            console.log(`Found and read file: ${fileInfo.name}`);
          } else {
            console.log(`File not found on disk: ${fileInfo.name}`);
          }
        } catch (err) {
          console.error(`Error reading file ${fileInfo.name}:`, err);
        }
      }
      
      return contents;
    } catch (err) {
      console.error('Error reading files from disk:', err);
      throw err;
    }
  },

  _initializeTrackers: function(client) {
    if (!client) return;
    
    const config = Settings.getWebTorrentConfig();
    if (Array.isArray(config.tracker)) {
      config.tracker.forEach(function(trackerUrl) {
        try {
          console.log(`Adding tracker: ${trackerUrl}`);
          if (client.tracker && typeof client.tracker.add === 'function') {
            client.tracker.add(trackerUrl);
          } else {
            console.log('Client tracker does not have add method');
          }
        } catch (e) {
          console.error(`Error adding tracker ${trackerUrl}:`, e);
        }
      });
    }
  },
  
  /**
   * Load all existing torrents from the database
   * @private
   */
  _loadTorrentsFromDatabase: async function() {
    try {
      console.log('Loading existing torrents from database...');
      
      const torrents = await TorrentsCollection.find({}).fetchAsync();
      console.log(`Found ${torrents.length} torrents in database`);
      
      if (torrents.length === 0) {
        return;
      }

      const resolvedStoragePath = getResolvedStoragePath();
      
      for (const torrent of torrents) {
        if (torrent.magnetURI) {
          try {
            console.log(`Adding torrent ${torrent.name} (${torrent.infoHash}) to client`);
            await this.addTorrent(torrent.magnetURI, {
              path: resolvedStoragePath
            });
          } catch (err) {
            console.error(`Error adding torrent ${torrent.infoHash} to client:`, err);
          }
        } else {
          console.warn(`Torrent ${torrent.infoHash} has no magnetURI, cannot add to client`);
        }
      }
      
      console.log('Finished loading torrents from database');
    } catch (err) {
      console.error('Error loading torrents from database:', err);
    }
  },
  
  /**
   * Get the WebTorrent client instance
   * @return {Object} The WebTorrent client
   */
  getClient: function() {
    return client;
  },
  
  /**
   * Add a torrent to the client - ENHANCED with better duplicate handling
   * @param {String} torrentId - Magnet URI, info hash, or torrent file
   * @param {Object} opts - Options for the torrent
   * @return {Promise<Object>} The added torrent
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
        
        // Check if torrent already exists in our internal map first
        try {
          const parsedTorrent = TorrentParser.parse(torrentId);
          const existingTorrent = self.getTorrent(parsedTorrent.infoHash);
          
          if (existingTorrent) {
            console.log(`Torrent ${parsedTorrent.infoHash} already exists in our map, returning existing instance`);
            // Make sure it's in database
            self._updateTorrentRecord(existingTorrent);
            return resolve(existingTorrent);
          }
          
          // Also check if it exists in the WebTorrent client directly
          const clientTorrent = torrentClient.get(parsedTorrent.infoHash);
          if (clientTorrent) {
            console.log(`Torrent ${parsedTorrent.infoHash} found in WebTorrent client, adding to our map`);
            self._torrents.set(clientTorrent.infoHash, clientTorrent);
            self._setupTorrentEvents(clientTorrent);
            self._updateTorrentRecord(clientTorrent);
            safeAnnounce(clientTorrent);
            return resolve(clientTorrent);
          }
        } catch (parseErr) {
          console.warn('Could not parse torrentId:', parseErr.message);
        }
        
        // Set the download path with resolved storage path
        const resolvedStoragePath = opts.path || getResolvedStoragePath();
        const options = {
          path: resolvedStoragePath,
          ...opts
        };
        
        console.log(`Adding new torrent to client with path: ${resolvedStoragePath}`);
        
        // Enhanced error handling for duplicate torrents
        let torrentAddHandler = function(torrent) {
          console.log(`Successfully added torrent: ${torrent.name} (${torrent.infoHash})`);
          
          // Store reference to the torrent
          self._torrents.set(torrent.infoHash, torrent);
          
          // Setup event handlers
          self._setupTorrentEvents(torrent);
          
          // Force announce to find peers
          try {
            console.log(`Attempting to announce torrent ${torrent.name}`);
            safeAnnounce(torrent);
          } catch (announceErr) {
            console.warn('Error announcing torrent:', announceErr);
          }
          
          // Insert or update torrent record in collection
          self._updateTorrentRecord(torrent);
          
          resolve(torrent);
        };
        
        // Set up error handler for the torrent client
        let originalErrorHandler = null;
        if (torrentClient.listenerCount('error') > 0) {
          originalErrorHandler = torrentClient.listeners('error');
        }
        
        let errorHandled = false;
        let tempErrorHandler = function(err) {
          if (!errorHandled && err.message && err.message.includes('Cannot add duplicate torrent')) {
            errorHandled = true;
            console.log('Duplicate torrent detected, trying to find existing torrent');
            
            // Extract info hash from error message
            const match = err.message.match(/Cannot add duplicate torrent ([a-f0-9]+)/);
            if (match && match[1]) {
              const infoHash = match[1];
              console.log(`Looking for existing torrent with hash: ${infoHash}`);
              
              // Try to get the existing torrent from the client
              const existingTorrent = torrentClient.get(infoHash);
              if (existingTorrent) {
                console.log(`Found existing torrent: ${existingTorrent.name}`);
                
                // Add it to our map if not already there
                if (!self._torrents.has(infoHash)) {
                  self._torrents.set(infoHash, existingTorrent);
                  self._setupTorrentEvents(existingTorrent);
                  console.log(`Added existing torrent to our internal map`);
                }
                
                // Update database record
                self._updateTorrentRecord(existingTorrent);
                
                // Announce to trackers
                safeAnnounce(existingTorrent);
                
                // Clean up error handler
                torrentClient.removeListener('error', tempErrorHandler);
                
                resolve(existingTorrent);
                return;
              }
            }
            
            // If we can't find the existing torrent, fall back to regular error handling
            console.error('Could not find existing duplicate torrent, rejecting');
            torrentClient.removeListener('error', tempErrorHandler);
            reject(err);
          } else {
            // Let other errors pass through to original handlers
            if (originalErrorHandler && originalErrorHandler.length > 0) {
              originalErrorHandler.forEach(handler => handler(err));
            }
          }
        };
        
        // Add our temporary error handler
        torrentClient.once('error', tempErrorHandler);
        
        // Try to add the torrent
        try {
          torrentClient.add(torrentId, options, torrentAddHandler);
        } catch (addError) {
          // Remove our error handler on immediate failure
          torrentClient.removeListener('error', tempErrorHandler);
          
          // Check if it's a duplicate error
          if (addError.message && addError.message.includes('Cannot add duplicate torrent')) {
            console.log('Immediate duplicate torrent error, trying to handle gracefully');
            tempErrorHandler(addError);
          } else {
            reject(addError);
          }
        }
        
      } catch (err) {
        reject(err);
      }
    });
  },
  
  /**
   * Create a torrent from files
   * @param {String|Array} filesOrPath - Path to file/folder or array of file objects
   * @param {Object} opts - Options for the torrent
   * @return {Promise<Object>} The created torrent
   */
  createTorrent: function(filesOrPath, opts = {}) {
    const self = this;
    
    return new Promise(function(resolve, reject) {
      try {
        const torrentClient = self.getClient();
        
        if (!torrentClient) {
          return self.initialize().then(function(initializedClient) {
            return self.createTorrent(filesOrPath, opts);
          }).then(resolve).catch(reject);
        }
        
        const resolvedStoragePath = opts.path || getResolvedStoragePath();
        const options = {
          path: resolvedStoragePath,
          ...opts,
          announceList: Settings.get('public.webtorrent.announceList', [
            ['wss://tracker.openwebtorrent.com']
          ])
        };
        
        console.log(`Creating torrent with path: ${resolvedStoragePath}`);
        console.log('Files or path:', typeof filesOrPath === 'string' ? filesOrPath : 'Array of files');
        
        torrentClient.seed(filesOrPath, options, function(torrent) {
          console.log(`Created torrent ${torrent.name} (${torrent.infoHash}) successfully`);
          console.log(`Magnet URI: ${torrent.magnetURI}`);
          
          // Store reference to the torrent
          self._torrents.set(torrent.infoHash, torrent);
          
          // Setup event handlers
          self._setupTorrentEvents(torrent);
          
          // Force announce to find peers
          try {
            console.log(`Attempting to announce new torrent ${torrent.name}`);
            safeAnnounce(torrent);
          } catch (announceErr) {
            console.warn('Error announcing torrent:', announceErr);
          }
          
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
   * @return {Promise<String>} File contents
   */
  getFileContents: function(infoHash, filename) {
    const self = this;
    
    return new Promise(async function(resolve, reject) {
      const torrent = self._torrents.get(infoHash);
      
      if (!torrent) {
        try {
          const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
          
          if (!torrentRecord || !torrentRecord.magnetURI) {
            return reject(new Meteor.Error('not-found', 'Torrent not found or has no magnet URI'));
          }
          
          console.log(`Reloading torrent ${infoHash} for file contents request`);
          const reloadedTorrent = await self.addTorrent(torrentRecord.magnetURI);
          
          await new Promise(r => Meteor.setTimeout(r, 1000));
          
          return self.getFileContents(infoHash, filename)
            .then(resolve)
            .catch(reject);
        } catch (err) {
          console.error('Error reloading torrent:', err);
          return reject(new Meteor.Error('not-found', 'Torrent not found and could not be reloaded'));
        }
      }
      
      const file = torrent.files.find(f => f.name === filename);
      
      if (!file) {
        return reject(new Meteor.Error('not-found', 'File not found in torrent'));
      }
      
      file.getBuffer(function(err, buffer) {
        if (err) {
          return reject(err);
        }
        
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
   * Get all file contents from a torrent - ENHANCED with better error handling
   * @param {String} infoHash - Info hash of the torrent
   * @return {Promise<Object>} Object with filename keys and content values
   */
  getAllFileContents: function(infoHash) {
    const self = this;
    
    return new Promise(async function(resolve, reject) {
      console.log(`WebTorrentServer.getAllFileContents for ${infoHash}`);
      let torrent = self._torrents.get(infoHash);
      
      if (!torrent) {
        console.log(`Torrent ${infoHash} not found in _torrents map, checking WebTorrent client directly`);
        
        // Check if it exists in the WebTorrent client directly
        const torrentClient = self.getClient();
        if (torrentClient) {
          const clientTorrent = torrentClient.get(infoHash);
          if (clientTorrent) {
            console.log(`Found torrent ${infoHash} in WebTorrent client, adding to our map`);
            self._torrents.set(infoHash, clientTorrent);
            self._setupTorrentEvents(clientTorrent);
            torrent = clientTorrent;
          }
        }
        
        // If still not found, try to reload from database
        if (!torrent) {
          try {
            const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
            
            if (!torrentRecord || !torrentRecord.magnetURI) {
              console.log(`No valid torrent record found in database for ${infoHash}`);
              return reject(new Meteor.Error('not-found', 'Torrent not found or has no magnet URI'));
            }
            
            console.log(`Reloading torrent ${infoHash} from magnet URI`);
            const reloadedTorrent = await self.addTorrent(torrentRecord.magnetURI);
            console.log(`Reloaded torrent with info hash ${reloadedTorrent.infoHash}`);
            
            await new Promise(r => Meteor.setTimeout(r, 2000));
            
            return self.getAllFileContents(infoHash)
              .then(resolve)
              .catch(reject);
          } catch (err) {
            console.error('Error reloading torrent:', err);
            return reject(new Meteor.Error('not-found', 'Torrent not found and could not be reloaded'));
          }
        }
      }
      
      console.log(`Found torrent ${infoHash} with ${torrent.files.length} files`);
      
      if (torrent.files.length === 0) {
        console.log(`Torrent ${infoHash} has no files yet, waiting for metadata...`);
        // Wait a bit longer for metadata to be loaded
        await new Promise(r => Meteor.setTimeout(r, 3000));
        
        if (torrent.files.length === 0) {
          return reject(new Meteor.Error('no-files', 'Torrent has no files available'));
        }
      }
      
      const filePromises = torrent.files.map(function(file) {
        return new Promise(function(resolveFile, rejectFile) {
          console.log(`Getting buffer for file: ${file.name}`);
          
          // Set a timeout for file retrieval
          const timeout = Meteor.setTimeout(() => {
            console.log(`Timeout getting buffer for ${file.name}`);
            rejectFile(new Error(`Timeout getting buffer for ${file.name}`));
          }, 10000);
          
          file.getBuffer(function(err, buffer) {
            clearTimeout(timeout);
            
            if (err) {
              console.error(`Error getting buffer for ${file.name}:`, err);
              return rejectFile(err);
            }
            
            try {
              const content = buffer.toString('utf8');
              console.log(`Successfully got content for ${file.name}, length: ${content.length}`);
              resolveFile({ name: file.name, content });
            } catch (e) {
              console.error(`Error converting buffer for ${file.name}:`, e);
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
          console.log(`Returning content for ${Object.keys(contents).length} files`);
          resolve(contents);
        })
        .catch(function(err) {
          console.error('Error processing file promises:', err);
          reject(err);
        });
    });
  },
  
  /**
   * Remove a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @param {Boolean} removeFiles - Whether to remove downloaded files
   * @return {Promise<Boolean>} Success
   */
  removeTorrent: function(infoHash, removeFiles = false) {
    const self = this;
    
    return new Promise(async function(resolve, reject) {
      try {
        const torrent = self._torrents.get(infoHash);
        
        if (!torrent) {
          await TorrentsCollection.removeAsync({ infoHash });
          console.log(`Removed torrent ${infoHash} from database (was not in client)`);
          return resolve(true);
        }
        
        torrent.destroy({ destroyStore: removeFiles }, async function(err) {
          if (err) {
            console.error(`Error destroying torrent ${infoHash}:`, err);
            return reject(err);
          }
          
          self._torrents.delete(infoHash);
          
          try {
            await TorrentsCollection.removeAsync({ infoHash });
            console.log(`Removed torrent ${infoHash} from database`);
            resolve(true);
          } catch (dbErr) {
            console.error(`Error removing torrent ${infoHash} from database:`, dbErr);
            reject(dbErr);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  },
  
  /**
   * Get a torrent by info hash
   * @param {String} infoHash - Info hash of the torrent
   * @return {Object} The torrent object or null if not found
   */
  getTorrent: function(infoHash) {
    return this._torrents.get(infoHash);
  },
  
  /**
   * Get all torrents
   * @return {Array} Array of all torrent objects
   */
  getAllTorrents: function() {
    return Array.from(this._torrents.values());
  },
  
  /**
   * Set up event handlers for a torrent
   * @private
   * @param {Object} torrent - The torrent object
   */
  _setupTorrentEvents: function(torrent) {
    if (!torrent) {
      console.error('Cannot setup events for null torrent');
      return;
    }
    
    const self = this;
    
    const updateInterval = Meteor.setInterval(function() {
      if (torrent) self._updateTorrentRecord(torrent);
    }, 1000);
    
    if (torrent && typeof torrent.on === 'function') {
      torrent.on('close', function() {
        Meteor.clearInterval(updateInterval);
      });
      
      torrent.on('done', function() {
        console.log(`Torrent ${torrent.name} (${torrent.infoHash}) download complete, now seeding`);
        self._updateTorrentRecord(torrent);
      });
      
      torrent.on('error', function(err) {
        console.error(`Torrent ${torrent.name} (${torrent.infoHash}) error:`, err);
      });
      
      if (torrent.on && torrent.wires) {
        torrent.on('wire', function(wire) {
          if (wire && wire.remoteAddress) {
            console.log(`New peer connected to ${torrent.name} (${torrent.infoHash}): ${wire.remoteAddress}`);
          }
          self._updateTorrentRecord(torrent);
          
          if (wire && typeof wire.on === 'function') {
            wire.on('close', function() {
              self._updateTorrentRecord(torrent);
            });
          }
        });
      }
    } else {
      console.error('Torrent does not have .on method:', torrent);
    }
  },
  
  /**
   * Update or create a torrent record in the database
   * @private
   * @param {Object} torrent - The torrent object
   */
  _updateTorrentRecord: async function(torrent) {
    if (!torrent) {
      console.error('Cannot update record for null torrent');
      return;
    }
    
    try {
      const files = torrent.files.map(function(file) {
        return {
          name: file.name,
          path: file.path || file.name,
          size: file.length,
          type: file.type || 'application/octet-stream'
        };
      });
      
      const torrentData = {
        infoHash: torrent.infoHash,
        name: torrent.name || 'Unnamed Torrent',
        magnetURI: torrent.magnetURI,
        size: torrent.length || 0,
        files: files,
        status: {
          downloaded: torrent.downloaded || 0,
          uploaded: torrent.uploaded || 0,
          downloadSpeed: torrent.downloadSpeed || 0,
          uploadSpeed: torrent.uploadSpeed || 0,
          progress: torrent.progress || 0,
          peers: torrent.numPeers || 0,
          seeds: (torrent.numPeers || 0) - get(torrent, '_peersLength', 0),
          state: torrent.done ? 'seeding' : 
                 torrent.paused ? 'paused' : 'downloading'
        }
      };
      
      let existing = null;
      try {
        existing = await TorrentsCollection.findOneAsync({ infoHash: torrent.infoHash });
      } catch (findErr) {
        console.error(`Error finding torrent ${torrent.infoHash} in database:`, findErr);
      }
      
      if (existing) {
        try {
          await TorrentsCollection.updateAsync(
            { infoHash: torrent.infoHash },
            { $set: torrentData }
          );
        } catch (updateErr) {
          console.error(`Error updating torrent ${torrent.infoHash} in database:`, updateErr);
        }
      } else {
        try {
          torrentData.created = new Date();
          torrentData.description = torrent.comment || '';
          torrentData.fhirType = 'unknown';
          torrentData.meta = {
            fhirVersion: '',
            resourceCount: 0,
            profile: ''
          };
          
          await TorrentsCollection.insertAsync(torrentData);
          console.log(`Inserted new torrent ${torrent.name} (${torrent.infoHash}) into database`);
        } catch (insertErr) {
          console.error(`Error inserting torrent ${torrent.infoHash} into database:`, insertErr);
        }
      }
    } catch (err) {
      console.error(`Error updating torrent ${torrent ? torrent.infoHash : 'unknown'} record:`, err);
    }
  }
};

// Initialize client on server startup
Meteor.startup(function() {
  console.log('Initializing WebTorrent server on Meteor startup...');
  Meteor.setTimeout(function() {
    WebTorrentServer.initialize()
      .then(function() {
        console.log('WebTorrent server initialized successfully from startup!');
      })
      .catch(function(err) {
        console.error('Failed to initialize WebTorrent server from startup:', err);
      });
  }, 1000);
});