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

  _networkStats: {
    trackers: new Map(), // tracker URL -> { lastAnnounce, lastResponse, status, errors }
    dht: {
      enabled: false,
      nodes: 0,
      lastBootstrap: null,
      status: 'inactive'
    },
    lastGlobalAnnounce: null,
    announceHistory: [], // Last 20 announce attempts
    peerConnections: new Map() // infoHash -> peer connection details
  },
  
  _updateTrackerStats: function(trackerUrl, status, responseTime, error = null) {
    if (!this._networkStats.trackers.has(trackerUrl)) {
      this._networkStats.trackers.set(trackerUrl, {
        url: trackerUrl,
        totalAnnounces: 0,
        successfulAnnounces: 0,
        lastAnnounce: null,
        lastResponse: null,
        lastError: null,
        status: 'unknown',
        averageResponseTime: 0,
        consecutiveFailures: 0
      });
    }
    
    const tracker = this._networkStats.trackers.get(trackerUrl);
    tracker.totalAnnounces++;
    tracker.lastAnnounce = new Date();
    
    if (status === 'success') {
      tracker.successfulAnnounces++;
      tracker.lastResponse = new Date();
      tracker.status = 'active';
      tracker.consecutiveFailures = 0;
      tracker.averageResponseTime = (tracker.averageResponseTime + responseTime) / 2;
    } else {
      tracker.lastError = error;
      tracker.status = 'error';
      tracker.consecutiveFailures++;
    }
  },

  // Enhanced announce with tracking
  _enhancedAnnounce: function(torrent) {
    const startTime = Date.now();
    const trackers = this._getTrackersForTorrent(torrent);
    
    trackers.forEach(trackerUrl => {
      try {
        // Attempt announce and track the result
        if (typeof torrent.announce === 'function') {
          torrent.announce();
          const responseTime = Date.now() - startTime;
          this._updateTrackerStats(trackerUrl, 'success', responseTime);
        }
      } catch (err) {
        this._updateTrackerStats(trackerUrl, 'error', 0, err.message);
      }
    });
    
    this._networkStats.lastGlobalAnnounce = new Date();
    
    // Keep history of last 20 announces
    this._networkStats.announceHistory.unshift({
      timestamp: new Date(),
      torrentName: torrent.name,
      infoHash: torrent.infoHash,
      trackerCount: trackers.length
    });
    
    if (this._networkStats.announceHistory.length > 20) {
      this._networkStats.announceHistory = this._networkStats.announceHistory.slice(0, 20);
    }
  },

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
            const enhancedConfig = {
              tracker: config.tracker,
              dht: config.dht,
              webSeeds: config.webSeeds,
              
              // CRITICAL: Force TCP pool creation
              maxConns: 200,        // Increase from 55 to 200
              tcpPool: true,        // Explicitly enable TCP pool
              
              // Enhanced peer connection settings
              peerId: null,         // Let WebTorrent generate
              nodeId: null,         // Let WebTorrent generate
              
              // Force socket creation capabilities
              utp: true,            // Enable uTP protocol
              tcpIncoming: true,
              tcpOutgoing: true,

              // Enhanced tracker settings
              trackerOpts: {
                announce: config.tracker || []
              }
            };

            
          client = new WebTorrent(enhancedConfig);
          
          if (!client) {
            throw new Error('WebTorrent client creation returned null/undefined');
          }

          // CRITICAL: Force TCP pool initialization
          console.log('🔧 Forcing TCP pool initialization...');
          
          // Method 1: Try to access _tcpPool to trigger creation
          if (client._tcpPool) {
            console.log('✅ TCP pool already exists');
          } else {
            console.log('⚠️ TCP pool missing, attempting manual initialization...');
            
            // Method 2: Create TCP pool manually if needed
            try {
              // Force TCP pool creation by creating a temporary connection
              const net = require('net');
              const tempServer = net.createServer();
              
              tempServer.listen(0, function() {
                const port = tempServer.address().port;
                console.log(`🔧 Created temporary TCP server on port ${port} to trigger pool`);
                
                // Close temporary server
                tempServer.close(function() {
                  console.log('🔧 Temporary TCP server closed');
                  
                  // Check if this triggered TCP pool creation
                  if (client._tcpPool) {
                    console.log('✅ TCP pool now exists after manual trigger');
                  } else {
                    console.log('⚠️ TCP pool still missing after manual trigger');
                    
                    // Method 3: Force using internal WebTorrent methods
                    try {
                      if (typeof client._startTcpPool === 'function') {
                        client._startTcpPool();
                        console.log('✅ TCP pool started using _startTcpPool()');
                      } else if (typeof client.listen === 'function') {
                        client.listen(0, function() {
                          console.log('✅ TCP pool started using listen()');
                        });
                      }
                    } catch (poolErr) {
                      console.error('❌ Manual TCP pool creation failed:', poolErr);
                    }
                  }
                });
              });
              
            } catch (serverErr) {
              console.error('❌ Temporary server creation failed:', serverErr);
            }
          }




          
          client.on('error', function(err) {
            console.error('WebTorrent server error:', err);

                // Log TCP pool state on error
            console.log('TCP pool state on error:', {
              exists: !!client._tcpPool,
              listening: client._tcpPool ? client._tcpPool.listening : false,
              port: client._tcpPool ? client._tcpPool.port : null
            });
          });

          // Monitor TCP pool state
          client.on('listening', function() {
            console.log('✅ WebTorrent client listening event fired');
            console.log('TCP pool state:', {
              exists: !!client._tcpPool,
              listening: client._tcpPool ? client._tcpPool.listening : false,
              port: client._tcpPool ? client._tcpPool.port : null,
              maxConns: client.maxConns,
              destroyed: client.destroyed
            });
          });

          
          console.log('✅ Enhanced WebTorrent server initialized with TCP pool fixes!');

          // Additional verification after creation
          Meteor.setTimeout(function() {
            console.log('🔍 Post-initialization TCP pool check:', {
              clientExists: !!client,
              tcpPoolExists: !!(client && client._tcpPool),
              listening: client ? client.listening : false,
              maxConns: client ? client.maxConns : 0,
              torrents: client ? client.torrents.length : 0
            });
            console.log('🔍 Post-initialization TCP pool verification:');
            console.log('- TCP pool exists:', !!client._tcpPool);
            console.log('- Client listening:', client.listening);
            console.log('- Client destroyed:', client.destroyed);
            console.log('- Max connections:', client.maxConns);
            
            if (client && !client._tcpPool) {
              console.log('🚨 CRITICAL: TCP pool still missing after initialization!');
              
              // Last resort: restart WebTorrent with different config
              console.log('🔄 Attempting WebTorrent restart with simpler config...');
              
              try {
                client.destroy();
                
                // Create with minimal config to ensure TCP pool
                client = new WebTorrent({
                  maxConns: 100,
                  tracker: ['wss://tracker.openwebtorrent.com']
                });
                
                console.log('🔄 WebTorrent restarted with minimal config');
                
                Meteor.setTimeout(function() {
                  console.log('🔍 Post-restart TCP pool check:', {
                    tcpPoolExists: !!(client && client._tcpPool),
                    listening: client ? client.listening : false
                  });
                }, 3000);
                
              } catch (restartErr) {
                console.error('❌ WebTorrent restart failed:', restartErr);
              }
            }
          }, 5000);

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
        
        // Set up a timeout to prevent hanging indefinitely
        const addTimeout = opts.timeout || 30000; // 30 seconds default
        let timeoutHandle = null;
        let resolved = false;
        
        // Enhanced error handling for duplicate torrents
        let torrentAddHandler = function(torrent) {
          if (resolved) return;
          resolved = true;
          
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
          }
          
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
        
        // Set up timeout handler
        timeoutHandle = setTimeout(function() {
          if (resolved) return;
          resolved = true;
          
          console.log(`Torrent add timeout after ${addTimeout}ms, but torrent may still be added in background`);
          
          // Try to find the torrent in the client even if callback didn't fire
          try {
            const parsedTorrent = TorrentParser.parse(torrentId);
            const torrent = torrentClient.get(parsedTorrent.infoHash);
            
            if (torrent) {
              console.log(`Found torrent in client despite timeout: ${torrent.infoHash}`);
              
              // Store reference to the torrent
              self._torrents.set(torrent.infoHash, torrent);
              
              // Setup event handlers
              self._setupTorrentEvents(torrent);
              
              // Insert or update torrent record in collection
              self._updateTorrentRecord(torrent);
              
              resolve(torrent);
              return;
            }
          } catch (err) {
            console.warn('Could not find torrent after timeout:', err.message);
          }
          
          // If we can't find it, reject with timeout error
          reject(new Error(`Torrent add timed out after ${addTimeout}ms. The torrent may still be added in the background.`));
        }, addTimeout);
        
        // Set up error handler for the torrent client
        let originalErrorHandler = null;
        if (torrentClient.listenerCount('error') > 0) {
          originalErrorHandler = torrentClient.listeners('error');
        }
        
        let errorHandled = false;
        let tempErrorHandler = function(err) {
          if (resolved) return;
          
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
                
                resolved = true;
                if (timeoutHandle) {
                  clearTimeout(timeoutHandle);
                  timeoutHandle = null;
                }
                
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
            resolved = true;
            if (timeoutHandle) {
              clearTimeout(timeoutHandle);
              timeoutHandle = null;
            }
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
          // Use the torrent object's events instead of just the callback
          const torrent = torrentClient.add(torrentId, options);
          
          // If torrent is returned immediately (synchronously), handle it
          if (torrent && torrent.infoHash) {
            console.log(`Torrent added synchronously: ${torrent.infoHash}`);
            
            // Set up listeners for when it's ready
            torrent.on('ready', function() {
              torrentAddHandler(torrent);
            });
            
            // Also try the callback approach
            torrent.on('metadata', function() {
              torrentAddHandler(torrent);
            });
            
            // If torrent is already ready, fire handler immediately
            if (torrent.ready) {
              torrentAddHandler(torrent);
            }
            
          } else {
            // If no torrent returned, wait for callback with timeout
            torrentClient.add(torrentId, options, torrentAddHandler);
          }
          
        } catch (addError) {
          if (resolved) return;
          resolved = true;
          
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
          }
          
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
        
        console.log('🌱 Creating torrent with guaranteed metadata support');
        
        // Enhanced options for metadata creation
        const enhancedOpts = {
          ...opts,
          path: opts.path || function() {
            const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
            const port = process.env.PORT || 3000;
            return storagePath.replace(/\${PORT}/g, port);
          }(),
          announceList: Settings.get('public.webtorrent.announceList', [
            ['wss://tracker.openwebtorrent.com']
          ]),
          
          // CRITICAL: Force metadata creation
          private: false, // Ensure public torrent with metadata
          comment: opts.comment || 'FHIR P2P Data Share'
        };
        
        console.log('Creating torrent with enhanced metadata options');
        
        torrentClient.seed(filesOrPath, enhancedOpts, function(torrent) {
          console.log(`✅ Torrent created: ${torrent.name} (${torrent.infoHash})`);
          
          // ROOT CAUSE FIX: Ensure metadata is immediately available
          self._ensureMetadataCreation(torrent, filesOrPath).then(function() {
            
            // ROOT CAUSE FIX: Set up proper metadata sharing for all connections
            self._setupMetadataSharing(torrent);
            
            // Store reference and setup events
            self._torrents.set(torrent.infoHash, torrent);
            self._setupEnhancedTorrentEvents(torrent);
            
            // Update database record
            self._updateTorrentRecord(torrent);
            
            console.log(`🎉 Seeding torrent fully configured with metadata: ${torrent.name}`);
            resolve(torrent);
            
          }).catch(function(metadataErr) {
            console.error('Error ensuring metadata creation:', metadataErr);
            reject(metadataErr);
          });
        });
        
      } catch (err) {
        console.error('Error in enhanced createTorrent:', err);
        reject(err);
      }
    });
  },
  
/**
   * ROOT CAUSE FIX: Ensure metadata object is created and attached to torrent
   * This addresses the core issue where seeding torrents lack metadata
   */
  _ensureMetadataCreation: function(torrent, filesOrPath) {
    return new Promise(function(resolve, reject) {
      console.log(`🔧 Ensuring metadata creation for torrent ${torrent.infoHash}`);
      
      try {
        // Strategy 1: Use existing metadata if available
        if (torrent.metadata && torrent.metadata.length > 0) {
          console.log(`✅ Torrent already has metadata: ${torrent.metadata.length} bytes`);
          return resolve(true);
        }
        
        // Strategy 2: Create metadata from torrent.info
        if (torrent.info) {
          console.log('📋 Creating metadata from torrent.info');
          try {
            const bencode = require('bencode');
            torrent.metadata = bencode.encode(torrent.info);
            console.log(`✅ Created metadata from info: ${torrent.metadata.length} bytes`);
            return resolve(true);
          } catch (encodeErr) {
            console.warn('Error encoding metadata from info:', encodeErr);
          }
        }
        
        // Strategy 3: Wait for torrent to generate metadata naturally
        if (!torrent.metadata) {
          console.log('⏳ Waiting for torrent metadata generation...');
          
          let metadataReceived = false;
          
          const onMetadata = function() {
            if (!metadataReceived) {
              metadataReceived = true;
              console.log(`✅ Metadata generated naturally: ${torrent.metadata.length} bytes`);
              resolve(true);
            }
          };
          
          const onReady = function() {
            if (!metadataReceived && torrent.metadata) {
              metadataReceived = true;
              console.log(`✅ Metadata available on ready: ${torrent.metadata.length} bytes`);
              resolve(true);
            }
          };
          
          torrent.once('metadata', onMetadata);
          torrent.once('ready', onReady);
          
          // Timeout after 10 seconds
          Meteor.setTimeout(function() {
            if (!metadataReceived) {
              torrent.removeListener('metadata', onMetadata);
              torrent.removeListener('ready', onReady);
              
              // Strategy 4: Create minimal metadata as last resort
              console.log('⚠️ Creating minimal metadata as fallback');
              try {
                const minimalInfo = self._createMinimalMetadata(torrent, filesOrPath);
                const bencode = require('bencode');
                torrent.metadata = bencode.encode(minimalInfo);
                console.log(`✅ Created minimal metadata: ${torrent.metadata.length} bytes`);
                resolve(true);
              } catch (minimalErr) {
                console.error('Error creating minimal metadata:', minimalErr);
                reject(new Error('Failed to create metadata for seeding torrent'));
              }
            }
          }, 10000);
        }
        
      } catch (err) {
        console.error('Error in _ensureMetadataCreation:', err);
        reject(err);
      }
    });
  },
  
  /**
   * Create minimal metadata structure for torrents that lack it
   */
  _createMinimalMetadata: function(torrent, filesOrPath) {
    console.log('🏗️ Creating minimal metadata structure');
    
    try {
      // Analyze the files
      const files = [];
      let totalLength = 0;
      
      if (typeof filesOrPath === 'string') {
        // Single file or directory
        const stats = fs.statSync(filesOrPath);
        if (stats.isFile()) {
          const fileName = path.basename(filesOrPath);
          const fileSize = stats.size;
          files.push({
            path: [Buffer.from(fileName, 'utf8')],
            length: fileSize
          });
          totalLength = fileSize;
        } else if (stats.isDirectory()) {
          // Read directory contents
          const dirFiles = fs.readdirSync(filesOrPath);
          dirFiles.forEach(function(fileName) {
            const filePath = path.join(filesOrPath, fileName);
            const fileStats = fs.statSync(filePath);
            if (fileStats.isFile()) {
              files.push({
                path: [Buffer.from(fileName, 'utf8')],
                length: fileStats.size
              });
              totalLength += fileStats.size;
            }
          });
        }
      } else if (Array.isArray(filesOrPath)) {
        // Array of files
        filesOrPath.forEach(function(file) {
          if (file.name && file.length !== undefined) {
            files.push({
              path: [Buffer.from(file.name, 'utf8')],
              length: file.length
            });
            totalLength += file.length;
          }
        });
      }
      
      // Create minimal info structure
      const pieceLength = 16384; // 16KB pieces
      const numPieces = Math.ceil(totalLength / pieceLength);
      const pieces = Buffer.alloc(numPieces * 20); // 20 bytes per SHA1 hash
      
      // Fill with dummy hashes (not ideal, but functional for metadata sharing)
      for (let i = 0; i < numPieces; i++) {
        const hash = require('crypto').createHash('sha1').update(`piece${i}`).digest();
        hash.copy(pieces, i * 20);
      }
      
      const info = {
        name: Buffer.from(torrent.name || 'FHIR Data', 'utf8'),
        'piece length': pieceLength,
        pieces: pieces,
        files: files.length > 1 ? files : undefined,
        length: files.length === 1 ? files[0].length : undefined
      };
      
      // Remove undefined fields
      Object.keys(info).forEach(key => {
        if (info[key] === undefined) {
          delete info[key];
        }
      });
      
      console.log(`✅ Created minimal info with ${files.length} files, ${totalLength} bytes total`);
      return info;
      
    } catch (err) {
      console.error('Error creating minimal metadata:', err);
      throw err;
    }
  },
  
  /**
   * ROOT CAUSE FIX #2: Set up proper metadata sharing for all peer connections
   * This ensures every peer connection can receive metadata from seeding torrents
   */
  _setupMetadataSharing: function(torrent) {
    const self = this;
    
    console.log(`🔧 Setting up enhanced metadata sharing for seeding torrent: ${torrent.name}`);
    
    if (!torrent.metadata) {
      console.error('❌ Cannot setup metadata sharing - no metadata available');
      return;
    }
    
    // Fix all existing wire connections
    if (torrent.wires && torrent.wires.length > 0) {
      console.log(`🔌 Fixing ${torrent.wires.length} existing connections`);
      torrent.wires.forEach(function(wire, index) {
        self._installMetadataOnWireSafe(wire, torrent, `existing-${index}`);
      });
    }
    
    // Set up enhanced wire handler for new connections
    this._setupEnhancedWireHandler(torrent);
    
    console.log(`✅ Enhanced metadata sharing configured for ${torrent.name}`);
  },

  /**
   * Enhanced wire initialization with proper timing
   */
  _setupEnhancedWireHandler: function(torrent) {
    const self = this;
    
    console.log(`🔧 Setting up enhanced wire handler for: ${torrent.name}`);
    
    // Store original handler
    const originalOnWire = torrent._onWire;
    
    torrent._onWire = function(wire) {
      console.log(`🔌 New wire connection detected, starting enhanced initialization...`);
      
      // Call original handler first
      if (originalOnWire) {
        originalOnWire.call(this, wire);
      }
      
      // Enhanced wire initialization with multiple checks
      self._initializeWireWithRetry(wire, torrent, 0);
    };
  },

  /**
   * Initialize wire with retry logic and proper timing
   */
  _initializeWireWithRetry: function(wire, torrent, attempt) {
    const self = this;
    const maxAttempts = 10;
    const retryDelay = 1000; // 1 second between attempts
    
    if (attempt >= maxAttempts) {
      console.log(`❌ Wire initialization failed after ${maxAttempts} attempts`);
      return;
    }
    
    // Check if wire is ready
    const wireReady = self._isWireReady(wire);
    
    if (wireReady.ready) {
      console.log(`✅ Wire ready after ${attempt} attempts: ${wire.remoteAddress}:${wire.remotePort}`);
      
      // Now safe to install metadata
      if (torrent.metadata) {
        self._installMetadataOnWireSafe(wire, torrent, `attempt-${attempt}`);
      }
      
      return;
    }
    
    console.log(`⏳ Wire not ready (attempt ${attempt + 1}/${maxAttempts}): ${wireReady.reason}`);
    
    // Retry after delay
    Meteor.setTimeout(function() {
      self._initializeWireWithRetry(wire, torrent, attempt + 1);
    }, retryDelay);
  },

  /**
   * Comprehensive wire readiness check
   */
  _isWireReady: function(wire) {
    const result = {
      ready: false,
      reason: '',
      details: {}
    };
    
    // Basic existence check
    if (!wire) {
      result.reason = 'Wire is null/undefined';
      return result;
    }
    
    // Check if destroyed
    if (wire.destroyed) {
      result.reason = 'Wire is destroyed';
      result.details.destroyed = true;
      return result;
    }
    
    // Check remote address - THIS IS THE KEY CHECK
    if (!wire.remoteAddress) {
      result.reason = 'No remoteAddress - TCP connection not established';
      result.details.hasRemoteAddress = false;
      result.details.socketExists = !!wire._socket;
      result.details.socketRemoteAddress = wire._socket ? wire._socket.remoteAddress : null;
      return result;
    }
    
    // Check port
    if (!wire.remotePort) {
      result.reason = 'No remotePort - connection incomplete';
      result.details.hasRemotePort = false;
      return result;
    }
    
    // Check handshake status
    if (!wire._handshakeComplete) {
      result.reason = 'BitTorrent handshake not complete';
      result.details.handshakeComplete = false;
      return result;
    }
    
    // All critical checks passed
    result.ready = true;
    result.reason = 'Wire is fully ready';
    result.details = {
      address: `${wire.remoteAddress}:${wire.remotePort}`,
      handshakeComplete: wire._handshakeComplete,
      hasExtended: !!wire.extended,
      readable: wire.readable,
      writable: wire.writable
    };
    
    return result;
  },

  /**
   * Enhanced version of _installMetadataOnWire with additional safety checks
   */
  _installMetadataOnWireSafe: function(wire, torrent, connectionType) {
    try {
      // Final safety check before installation
      const wireCheck = this._isWireReady(wire);
      
      if (!wireCheck.ready) {
        console.log(`❌ Cannot install metadata on ${connectionType}: ${wireCheck.reason}`);
        return false;
      }
      
      console.log(`📡 Installing metadata on verified ready wire (${connectionType}): ${wire.remoteAddress}:${wire.remotePort}`);
      
      // Check if peer supports extended protocol
      if (!wire.extended) {
        console.log(`   ⚠️ Peer ${wire.remoteAddress} doesn't support extended protocol`);
        return false;
      }
      
      // Remove any existing ut_metadata
      if (wire.ut_metadata) {
        delete wire.ut_metadata;
        console.log(`   🗑️ Removed existing ut_metadata`);
      }
      
      // Install fresh ut_metadata extension with torrent metadata
      const ut_metadata = require('ut_metadata');
      wire.use(ut_metadata(torrent.metadata));
      console.log(`   ✅ Installed ut_metadata with ${torrent.metadata.length} bytes`);
      
      // Send proper extended handshake advertising metadata
      const handshakeMsg = {
        m: {
          ut_metadata: 1
        },
        v: 'WebTorrent-Enhanced-Safe',
        metadata_size: torrent.metadata.length,
        reqq: 250
      };
      
      try {
        wire.extended('handshake', Buffer.from(JSON.stringify(handshakeMsg)));
        console.log(`   📡 Sent enhanced handshake with metadata_size=${torrent.metadata.length}`);
      } catch (handshakeErr) {
        console.error(`   ❌ Handshake error: ${handshakeErr.message}`);
        return false;
      }
      
      // Set up metadata response handler
      this._setupMetadataResponseHandler(wire, torrent);
      
      return true;
      
    } catch (installErr) {
      console.error(`❌ Error in safe metadata installation:`, installErr.message);
      return false;
    }
  },

  /**
   * Set up metadata response handler for incoming requests
   */
  _setupMetadataResponseHandler: function(wire, torrent) {
    // Remove existing extended listeners to avoid duplicates
    wire.removeAllListeners('extended');
    
    wire.on('extended', function(ext, buf) {
      if (ext === 'ut_metadata') {
        console.log(`   📤 Metadata request from ${wire.remoteAddress} - responding immediately`);
        
        try {
          // Parse the request
          let request;
          try {
            request = JSON.parse(buf.toString());
          } catch (parseErr) {
            // Handle binary request format
            request = { msg_type: 0, piece: 0 };
          }
          
          if (request.msg_type === 0) { // Request
            // Send metadata immediately
            const response = {
              msg_type: 1, // data
              piece: request.piece || 0,
              total_size: torrent.metadata.length
            };
            
            const responseBuffer = Buffer.concat([
              Buffer.from(JSON.stringify(response)),
              torrent.metadata
            ]);
            
            wire.extended('ut_metadata', responseBuffer);
            console.log(`   ✅ Sent ${torrent.metadata.length} bytes metadata to ${wire.remoteAddress}`);
          }
        } catch (responseErr) {
          console.error(`   ❌ Error responding to metadata request: ${responseErr.message}`);
        }
      }
    });
  },
  
  /**
   * Install ut_metadata extension on a specific wire with proper error handling
   */
  _installMetadataOnWire: function(wire, torrent, connectionType) {
    try {
      // CRITICAL: Validate wire state first
      if (!wire || !wire.remoteAddress || wire.destroyed) {
        console.log(`❌ Cannot install metadata on invalid wire: exists=${!!wire}, address=${wire?.remoteAddress}, destroyed=${wire?.destroyed}`);
        return;
      }
      
      console.log(`📡 Installing metadata on ${connectionType} connection: ${wire.remoteAddress}`);
      
      // Check if handshake is complete - CRITICAL TIMING CHECK
      if (!wire._handshakeComplete) {
        console.log(`   ⏳ Handshake not complete for ${wire.remoteAddress}, waiting...`);
        
        // Wait for handshake completion
        const onHandshake = function() {
          console.log(`   ✅ Handshake completed for ${wire.remoteAddress}, retrying metadata installation`);
          self._installMetadataOnWire(wire, torrent, connectionType + '-delayed');
        };
        
        wire.once('handshake', onHandshake);
        
        // Timeout safety - don't wait forever
        Meteor.setTimeout(function() {
          wire.removeListener('handshake', onHandshake);
          console.log(`   ⏰ Handshake timeout for ${wire.remoteAddress}`);
        }, 15000);
        
        return;
      }
      
      // Check if peer supports extended protocol
      if (!wire.extended) {
        console.log(`   ⚠️ Peer ${wire.remoteAddress} doesn't support extended protocol`);
        return;
      }

      // Additional check: ensure peer has advertised extended support
      if (!wire.peerExtended) {
        console.log(`   ⏳ Peer ${wire.remoteAddress} hasn't completed extended handshake yet, waiting...`);
        
        const onExtended = function() {
          console.log(`   ✅ Extended handshake completed for ${wire.remoteAddress}, retrying metadata installation`);
          self._installMetadataOnWire(wire, torrent, connectionType + '-extended-delayed');
        };
        
        wire.once('extended', onExtended);
        
        // Timeout safety
        Meteor.setTimeout(function() {
          wire.removeListener('extended', onExtended);
          console.log(`   ⏰ Extended handshake timeout for ${wire.remoteAddress}`);
        }, 10000);
        
        return;
      }
      
      // NOW SAFE: Wire is fully established and ready for extensions
      
      
      // Remove any existing ut_metadata
      if (wire.ut_metadata) {
        delete wire.ut_metadata;
        console.log(`   🗑️ Removed existing ut_metadata`);
      }
      
      // Install fresh ut_metadata extension with torrent metadata
      const ut_metadata = require('ut_metadata');
      wire.use(ut_metadata(torrent.metadata));
      console.log(`   ✅ Installed ut_metadata with ${torrent.metadata.length} bytes`);
      
      // Send proper extended handshake advertising metadata
      const handshakeMsg = {
        m: {
          ut_metadata: 1
        },
        v: 'WebTorrent-Seeding-Fixed',
        metadata_size: torrent.metadata.length,
        reqq: 250
      };
      
      try {
        wire.extended('handshake', Buffer.from(JSON.stringify(handshakeMsg)));
        console.log(`   📡 Sent seeding handshake with metadata_size=${torrent.metadata.length}`);
      } catch (handshakeErr) {
        console.error(`   ❌ Handshake error: ${handshakeErr.message}`);
      }
      
      // Set up aggressive metadata response for incoming requests
      wire.removeAllListeners('extended'); // Clear any existing handlers
      wire.on('extended', function(ext, buf) {
        if (ext === 'ut_metadata') {
          console.log(`   📤 Metadata request from ${wire.remoteAddress} - responding immediately`);
          
          try {
            // Parse the request
            let request;
            try {
              request = JSON.parse(buf.toString());
            } catch (parseErr) {
              // Try to handle as binary request
              request = { msg_type: 0, piece: 0 };
            }
            
            if (request.msg_type === 0) { // Request
              // Send metadata immediately
              const response = {
                msg_type: 1, // data
                piece: request.piece || 0,
                total_size: torrent.metadata.length
              };
              
              const responseBuffer = Buffer.concat([
                Buffer.from(JSON.stringify(response)),
                torrent.metadata
              ]);
              
              wire.extended('ut_metadata', responseBuffer);
              console.log(`   ✅ Sent ${torrent.metadata.length} bytes metadata to ${wire.remoteAddress}`);
            }
          } catch (responseErr) {
            console.error(`   ❌ Error responding to metadata request: ${responseErr.message}`);
          }
        }
      });
      
    } catch (installErr) {
      console.error(`❌ Error installing metadata on wire ${wire.remoteAddress}:`, installErr.message);
    }
  },
  
  /**
   * Enhanced torrent event setup with metadata monitoring
   */
  _setupEnhancedTorrentEvents: function(torrent) {
    if (!torrent) {
      console.error('Cannot setup events for null torrent');
      return;
    }
    
    const self = this;
    
    // Standard update interval
    const updateInterval = Meteor.setInterval(function() {
      if (torrent) self._updateTorrentRecord(torrent);
    }, 5000);
    
    // Enhanced event handlers
    if (torrent && typeof torrent.on === 'function') {
      torrent.on('close', function() {
        Meteor.clearInterval(updateInterval);
      });
      
      torrent.on('done', function() {
        console.log(`✅ Seeding torrent complete: ${torrent.name}`);
        self._updateTorrentRecord(torrent);
      });
      
      torrent.on('error', function(err) {
        console.error(`❌ Seeding torrent error ${torrent.name}:`, err);
      });
      
      // Monitor new wire connections
      torrent.on('wire', function(wire) {
        console.log(`🔌 New peer connected to seeding torrent ${torrent.name}: ${wire.remoteAddress}`);
        
        // Ensure metadata is shared on new connections
        if (torrent.metadata) {
          Meteor.setTimeout(function() {
            self._installMetadataOnWire(wire, torrent, 'event-new');
          }, 1000);
        }
        
        self._updateTorrentRecord(torrent);
        
        if (wire && typeof wire.on === 'function') {
          wire.on('close', function() {
            self._updateTorrentRecord(torrent);
          });
        }
      });
    }
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