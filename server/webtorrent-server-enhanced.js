// // server/webtorrent-server-enhanced.js - Enhanced WebTorrent server with metadata fix

// import { Meteor } from 'meteor/meteor';
// import { get } from 'lodash';
// import fs from 'fs';
// import path from 'path';
// import { Settings } from '/imports/api/settings/settings';
// import { TorrentsCollection } from '/imports/api/torrents/torrents';
// import getEnhancedWebTorrent from './webtorrent-metadata-fix';

// // Server-side WebTorrent client
// let client = null;
// let isInitializing = false;
// let initializePromise = null;

// /**
//  * Enhanced WebTorrent server service with proper metadata support
//  */
// export const WebTorrentServer = {
//   _torrents: new Map(),
  
//   /**
//    * Initialize the enhanced WebTorrent client with metadata support
//    * @return {Promise<Object>} The WebTorrent client instance
//    */
//   initialize: function() {
//     // Return existing client if already initialized
//     if (client) {
//       console.log('WebTorrent server already initialized');
//       return Promise.resolve(client);
//     }
    
//     // Return existing promise if initialization is in progress
//     if (isInitializing && initializePromise) {
//       console.log('WebTorrent server initialization in progress');
//       return initializePromise;
//     }
    
//     console.log('🚀 Starting ENHANCED WebTorrent server initialization with metadata support');
//     isInitializing = true;
    
//     // Create a promise for the initialization
//     initializePromise = new Promise(function(resolve, reject) {
//       try {
//         // Get the enhanced WebTorrent class
//         const EnhancedWebTorrent = getEnhancedWebTorrent();
        
//         const config = Settings.getWebTorrentConfig();
//         console.log('Creating enhanced WebTorrent server with config:', config);
        
//         // Create storage directory if it doesn't exist
//         const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
//         const port = process.env.PORT || 3000;
//         const resolvedPath = storagePath.replace(/\${PORT}/g, port);
        
//         if (!fs.existsSync(resolvedPath)) {
//           fs.mkdirSync(resolvedPath, { recursive: true });
//           console.log(`Created storage directory: ${resolvedPath}`);
//         }
        
//         // Create enhanced client with metadata support
//         client = new EnhancedWebTorrent({
//           tracker: config.tracker,
//           dht: config.dht,
//           webSeeds: config.webSeeds,
          
//           // Enhanced options for metadata support
//           enableExtensions: true,
//           maxConns: 100,  // Allow more connections for better peer discovery
          
//           // Ensure ut_metadata extension is always available
//           extensions: [
//             require('ut_metadata')
//           ]
//         });
        
//         client.on('error', function(err) {
//           console.error('Enhanced WebTorrent server error:', err);
//         });
        
//         // Enhanced torrent event handling
//         client.on('torrent', function(torrent) {
//           console.log(`🎯 Enhanced WebTorrent: new torrent added: ${torrent.name || torrent.infoHash}`);
          
//           // Ensure metadata support for this torrent
//           self._enhanceTorrentMetadataSupport(torrent);
//         });
        
//         console.log('✅ Enhanced WebTorrent server initialized successfully with metadata support!');
//         isInitializing = false;
//         resolve(client);
        
//       } catch (err) {
//         console.error('❌ Error during enhanced WebTorrent initialization:', err);
//         isInitializing = false;
//         reject(err);
//       }
//     });
    
//     return initializePromise;
//   },
  
//   /**
//    * Enhance metadata support for a specific torrent
//    * @private
//    * @param {Object} torrent - The torrent to enhance
//    */
//   _enhanceTorrentMetadataSupport: function(torrent) {
//     if (!torrent) return;
    
//     console.log(`🔧 Enhancing metadata support for torrent: ${torrent.name || torrent.infoHash}`);
    
//     // Store reference to the torrent
//     this._torrents.set(torrent.infoHash, torrent);
    
//     // Setup enhanced event handlers
//     this._setupEnhancedTorrentEvents(torrent);
    
//     // Ensure metadata is properly shared for seeding torrents
//     if (torrent.files && torrent.files.length > 0) {
//       console.log(`📤 Torrent is seeding ${torrent.files.length} files, ensuring metadata sharing`);
      
//       // Force metadata availability
//       torrent.on('wire', function(wire) {
//         console.log(`🔌 New peer connection for seeding torrent: ${wire.remoteAddress}`);
        
//         // Ensure ut_metadata extension is available
//         setTimeout(function() {
//           if (!wire.ut_metadata) {
//             console.log(`📡 Loading ut_metadata extension for seeding peer ${wire.remoteAddress}`);
//             try {
//               const ut_metadata = require('ut_metadata');
//               wire.use(ut_metadata(torrent.metadata || torrent.info));
//               console.log(`✅ ut_metadata extension loaded for ${wire.remoteAddress}`);
//             } catch (err) {
//               console.error(`❌ Error loading ut_metadata for ${wire.remoteAddress}:`, err);
//             }
//           }
          
//           // Be aggressive about sharing metadata
//           if (wire.ut_metadata && torrent.metadata) {
//             try {
//               if (typeof wire.ut_metadata.setMetadata === 'function') {
//                 wire.ut_metadata.setMetadata(torrent.metadata);
//                 console.log(`📤 Metadata set for peer ${wire.remoteAddress}`);
//               }
//             } catch (err) {
//               console.error(`Error setting metadata for ${wire.remoteAddress}:`, err);
//             }
//           }
//         }, 1000); // Small delay to ensure wire is properly initialized
//       });
//     }
//   },
  
//   /**
//    * Setup enhanced event handlers for a torrent
//    * @private
//    * @param {Object} torrent - The torrent object
//    */
//   _setupEnhancedTorrentEvents: function(torrent) {
//     if (!torrent) {
//       console.error('Cannot setup events for null torrent');
//       return;
//     }
    
//     const self = this;
    
//     // Enhanced wire handling
//     torrent.on('wire', function(wire) {
//       console.log(`🔌 Enhanced wire connection: ${wire.remoteAddress}:${wire.remotePort}`);
      
//       // Log extension support
//       setTimeout(function() {
//         const extensions = wire.peerExtensions ? Object.keys(wire.peerExtensions) : [];
//         console.log(`📡 Peer ${wire.remoteAddress} extensions: [${extensions.join(', ')}]`);
        
//         if (wire.peerExtensions && wire.peerExtensions.ut_metadata) {
//           console.log(`✅ Peer ${wire.remoteAddress} supports ut_metadata extension`);
//         } else {
//           console.log(`❌ Peer ${wire.remoteAddress} does NOT support ut_metadata extension`);
//         }
//       }, 2000);
      
//       // Enhanced metadata request for downloading torrents
//       if (!torrent.done && (!torrent.files || torrent.files.length === 0)) {
//         wire.on('extended', function(ext, buf) {
//           if (ext === 'handshake' && wire.peerExtensions && wire.peerExtensions.ut_metadata) {
//             console.log(`📥 Requesting metadata from ${wire.remoteAddress} (enhanced)`);
            
//             setTimeout(function() {
//               if (wire.ut_metadata && typeof wire.ut_metadata.fetch === 'function') {
//                 try {
//                   wire.ut_metadata.fetch();
//                   console.log(`✅ Metadata fetch initiated from ${wire.remoteAddress}`);
//                 } catch (err) {
//                   console.error(`Error fetching metadata from ${wire.remoteAddress}:`, err);
//                 }
//               }
//             }, 500);
//           }
//         });
//       }
      
//       self._updateTorrentRecord(torrent);
//     });
    
//     // Standard event handlers
//     const updateInterval = Meteor.setInterval(function() {
//       if (torrent) self._updateTorrentRecord(torrent);
//     }, 5000); // Less frequent updates to reduce noise
    
//     torrent.on('close', function() {
//       Meteor.clearInterval(updateInterval);
//     });
    
//     torrent.on('done', function() {
//       console.log(`✅ Torrent ${torrent.name} (${torrent.infoHash}) download complete, now seeding with metadata support`);
//       self._updateTorrentRecord(torrent);
//     });
    
//     torrent.on('metadata', function() {
//       console.log(`🎉 Metadata received for torrent ${torrent.name} (${torrent.infoHash})`);
//       self._updateTorrentRecord(torrent);
//     });
    
//     torrent.on('ready', function() {
//       console.log(`✅ Torrent ready: ${torrent.name} (${torrent.infoHash}) with ${torrent.files.length} files`);
//       self._updateTorrentRecord(torrent);
//     });
    
//     torrent.on('error', function(err) {
//       console.error(`❌ Torrent ${torrent.name} (${torrent.infoHash}) error:`, err);
//     });
//   },
  
//   // All other methods remain the same as the original WebTorrentServer
//   // but use the enhanced client...
  
//   getClient: function() {
//     return client;
//   },
  
//   addTorrent: function(torrentId, opts = {}) {
//     const self = this;
    
//     return new Promise(function(resolve, reject) {
//       try {
//         const torrentClient = self.getClient();
        
//         if (!torrentClient) {
//           return self.initialize().then(function(initializedClient) {
//             return self.addTorrent(torrentId, opts);
//           }).then(resolve).catch(reject);
//         }
        
//         console.log(`🎯 Adding torrent with enhanced metadata support: ${torrentId.substring(0, 50)}...`);
        
//         // Enhanced options for metadata support
//         const enhancedOpts = {
//           ...opts,
//           path: opts.path || function() {
//             const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
//             const port = process.env.PORT || 3000;
//             return storagePath.replace(/\${PORT}/g, port);
//           }(),
//           enableMetadata: true,
//           extensions: true
//         };
        
//         torrentClient.add(torrentId, enhancedOpts, function(torrent) {
//           console.log(`✅ Enhanced torrent added: ${torrent.name} (${torrent.infoHash})`);
          
//           // Enhance this specific torrent
//           self._enhanceTorrentMetadataSupport(torrent);
          
//           resolve(torrent);
//         });
        
//       } catch (err) {
//         console.error('❌ Error in enhanced addTorrent:', err);
//         reject(err);
//       }
//     });
//   },
  
//   createTorrent: function(filesOrPath, opts = {}) {
//     const self = this;
    
//     return new Promise(function(resolve, reject) {
//       try {
//         const torrentClient = self.getClient();
        
//         if (!torrentClient) {
//           return self.initialize().then(function(initializedClient) {
//             return self.createTorrent(filesOrPath, opts);
//           }).then(resolve).catch(reject);
//         }
        
//         console.log(`🌱 Creating torrent with enhanced metadata support`);
        
//         // Enhanced options for seeding with metadata
//         const enhancedOpts = {
//           ...opts,
//           path: opts.path || function() {
//             const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
//             const port = process.env.PORT || 3000;
//             return storagePath.replace(/\${PORT}/g, port);
//           }(),
//           announceList: Settings.get('public.webtorrent.announceList', [
//             ['wss://tracker.openwebtorrent.com']
//           ]),
//           enableMetadata: true,
//           shareMetadata: true
//         };
        
//         torrentClient.seed(filesOrPath, enhancedOpts, function(torrent) {
//           console.log(`✅ Enhanced seeding torrent created: ${torrent.name} (${torrent.infoHash})`);
          
//           // Enhance this seeding torrent
//           self._enhanceTorrentMetadataSupport(torrent);
          
//           resolve(torrent);
//         });
        
//       } catch (err) {
//         console.error('❌ Error in enhanced createTorrent:', err);
//         reject(err);
//       }
//     });
//   },
  
//   // Include all other methods from the original WebTorrentServer...
//   // (getTorrent, getAllTorrents, removeTorrent, etc.)
  
//   getTorrent: function(infoHash) {
//     return this._torrents.get(infoHash);
//   },
  
//   getAllTorrents: function() {
//     return Array.from(this._torrents.values());
//   },
  
//   _updateTorrentRecord: async function(torrent) {
//     // Same as original implementation
//     if (!torrent) {
//       console.error('Cannot update record for null torrent');
//       return;
//     }
    
//     try {
//       const files = torrent.files.map(function(file) {
//         return {
//           name: file.name,
//           path: file.path || file.name,
//           size: file.length,
//           type: file.type || 'application/octet-stream'
//         };
//       });
      
//       const torrentData = {
//         infoHash: torrent.infoHash,
//         name: torrent.name || 'Unnamed Torrent',
//         magnetURI: torrent.magnetURI,
//         size: torrent.length || 0,
//         files: files,
//         status: {
//           downloaded: torrent.downloaded || 0,
//           uploaded: torrent.uploaded || 0,
//           downloadSpeed: torrent.downloadSpeed || 0,
//           uploadSpeed: torrent.uploadSpeed || 0,
//           progress: torrent.progress || 0,
//           peers: torrent.numPeers || 0,
//           seeds: (torrent.numPeers || 0) - get(torrent, '_peersLength', 0),
//           state: torrent.done ? 'seeding' : 
//                  torrent.paused ? 'paused' : 'downloading'
//         }
//       };
      
//       let existing = null;
//       try {
//         existing = await TorrentsCollection.findOneAsync({ infoHash: torrent.infoHash });
//       } catch (findErr) {
//         console.error(`Error finding torrent ${torrent.infoHash} in database:`, findErr);
//       }
      
//       if (existing) {
//         try {
//           await TorrentsCollection.updateAsync(
//             { infoHash: torrent.infoHash },
//             { $set: torrentData }
//           );
//         } catch (updateErr) {
//           console.error(`Error updating torrent ${torrent.infoHash} in database:`, updateErr);
//         }
//       } else {
//         try {
//           torrentData.created = new Date();
//           torrentData.description = torrent.comment || '';
//           torrentData.fhirType = 'unknown';
//           torrentData.meta = {
//             fhirVersion: '',
//             resourceCount: 0,
//             profile: ''
//           };
          
//           await TorrentsCollection.insertAsync(torrentData);
//           console.log(`Inserted new torrent ${torrent.name} (${torrent.infoHash}) into database`);
//         } catch (insertErr) {
//           console.error(`Error inserting torrent ${torrent.infoHash} into database:`, insertErr);
//         }
//       }
//     } catch (err) {
//       console.error(`Error updating torrent ${torrent ? torrent.infoHash : 'unknown'} record:`, err);
//     }
//   }
// };

// // Initialize enhanced client on server startup
// Meteor.startup(function() {
//   console.log('🚀 Initializing ENHANCED WebTorrent server on Meteor startup...');
//   Meteor.setTimeout(function() {
//     WebTorrentServer.initialize()
//       .then(function() {
//         console.log('✅ Enhanced WebTorrent server initialized successfully from startup!');
//       })
//       .catch(function(err) {
//         console.error('❌ Failed to initialize enhanced WebTorrent server from startup:', err);
//       });
//   }, 1000);
// });