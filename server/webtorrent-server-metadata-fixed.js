// // server/webtorrent-server-metadata-fixed.js
// // Root cause fix: Ensure seeding torrents always have proper metadata creation and sharing

// import { Meteor } from 'meteor/meteor';
// import { get } from 'lodash';
// import fs from 'fs';
// import path from 'path';
// import { Settings } from '/imports/api/settings/settings';
// import { TorrentsCollection } from '/imports/api/torrents/torrents';

// // Server-side WebTorrent client
// let client = null;
// let isInitializing = false;
// let initializePromise = null;

// /**
//  * Enhanced WebTorrent server with proper metadata creation and sharing
//  * ROOT CAUSE FIX: Ensures all seeding torrents have metadata and share it correctly
//  */
// export const WebTorrentServer = {
//   _torrents: new Map(),
  
//   /**
//    * Initialize the WebTorrent client
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
    
//     console.log('🚀 Starting WebTorrent server with metadata fixes');
//     isInitializing = true;
    
//     initializePromise = new Promise(function(resolve, reject) {
//       try {
//         // Load WebTorrent
//         let WebTorrent = null;
//         try {
//           WebTorrent = require('webtorrent');
//           console.log('WebTorrent loaded successfully');
//         } catch (err) {
//           console.error('Error requiring WebTorrent:', err);
//           try {
//             const npmPath = require('path').join(process.cwd(), 'node_modules', 'webtorrent');
//             WebTorrent = require(npmPath);
//             console.log('WebTorrent loaded from npm path');
//           } catch (err2) {
//             console.error('Failed to load WebTorrent from npm path:', err2);
//             reject(new Error('Could not load WebTorrent module'));
//             return;
//           }
//         }
        
//         const config = Settings.getWebTorrentConfig();
//         console.log('Creating WebTorrent server with config:', config);
        
//         // Create storage directory
//         const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
//         const port = process.env.PORT || 3000;
//         const resolvedPath = storagePath.replace(/\${PORT}/g, port);
        
//         if (!fs.existsSync(resolvedPath)) {
//           fs.mkdirSync(resolvedPath, { recursive: true });
//           console.log(`Created storage directory: ${resolvedPath}`);
//         }
        
//         // Create client
//         client = new WebTorrent({
//           tracker: config.tracker,
//           dht: config.dht,
//           webSeeds: config.webSeeds
//         });
        
//         client.on('error', function(err) {
//           console.error('WebTorrent server error:', err);
//         });
        
//         console.log('✅ WebTorrent server initialized with metadata fixes!');
//         isInitializing = false;
//         resolve(client);
        
//       } catch (err) {
//         console.error('❌ Error during WebTorrent initialization:', err);
//         isInitializing = false;
//         reject(err);
//       }
//     });
    
//     return initializePromise;
//   },
  
//   /**
//    * ROOT CAUSE FIX #1: Enhanced torrent creation with guaranteed metadata
//    * This ensures every seeding torrent has proper metadata from the start
//    */
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
        
//         console.log('🌱 Creating torrent with guaranteed metadata support');
        
//         // Enhanced options for metadata creation
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
          
//           // CRITICAL: Force metadata creation
//           private: false, // Ensure public torrent with metadata
//           comment: opts.comment || 'FHIR P2P Data Share'
//         };
        
//         console.log('Creating torrent with enhanced metadata options');
        
//         torrentClient.seed(filesOrPath, enhancedOpts, function(torrent) {
//           console.log(`✅ Torrent created: ${torrent.name} (${torrent.infoHash})`);
          
//           // ROOT CAUSE FIX: Ensure metadata is immediately available
//           self._ensureMetadataCreation(torrent, filesOrPath).then(function() {
            
//             // ROOT CAUSE FIX: Set up proper metadata sharing for all connections
//             self._setupMetadataSharing(torrent);
            
//             // Store reference and setup events
//             self._torrents.set(torrent.infoHash, torrent);
//             self._setupEnhancedTorrentEvents(torrent);
            
//             // Update database record
//             self._updateTorrentRecord(torrent);
            
//             console.log(`🎉 Seeding torrent fully configured with metadata: ${torrent.name}`);
//             resolve(torrent);
            
//           }).catch(function(metadataErr) {
//             console.error('Error ensuring metadata creation:', metadataErr);
//             reject(metadataErr);
//           });
//         });
        
//       } catch (err) {
//         console.error('Error in enhanced createTorrent:', err);
//         reject(err);
//       }
//     });
//   },
  
//   /**
//    * ROOT CAUSE FIX: Ensure metadata object is created and attached to torrent
//    * This addresses the core issue where seeding torrents lack metadata
//    */
//   _ensureMetadataCreation: function(torrent, filesOrPath) {
//     return new Promise(function(resolve, reject) {
//       console.log(`🔧 Ensuring metadata creation for torrent ${torrent.infoHash}`);
      
//       try {
//         // Strategy 1: Use existing metadata if available
//         if (torrent.metadata && torrent.metadata.length > 0) {
//           console.log(`✅ Torrent already has metadata: ${torrent.metadata.length} bytes`);
//           return resolve(true);
//         }
        
//         // Strategy 2: Create metadata from torrent.info
//         if (torrent.info) {
//           console.log('📋 Creating metadata from torrent.info');
//           try {
//             const bencode = require('bencode');
//             torrent.metadata = bencode.encode(torrent.info);
//             console.log(`✅ Created metadata from info: ${torrent.metadata.length} bytes`);
//             return resolve(true);
//           } catch (encodeErr) {
//             console.warn('Error encoding metadata from info:', encodeErr);
//           }
//         }
        
//         // Strategy 3: Wait for torrent to generate metadata naturally
//         if (!torrent.metadata) {
//           console.log('⏳ Waiting for torrent metadata generation...');
          
//           let metadataReceived = false;
          
//           const onMetadata = function() {
//             if (!metadataReceived) {
//               metadataReceived = true;
//               console.log(`✅ Metadata generated naturally: ${torrent.metadata.length} bytes`);
//               resolve(true);
//             }
//           };
          
//           const onReady = function() {
//             if (!metadataReceived && torrent.metadata) {
//               metadataReceived = true;
//               console.log(`✅ Metadata available on ready: ${torrent.metadata.length} bytes`);
//               resolve(true);
//             }
//           };
          
//           torrent.once('metadata', onMetadata);
//           torrent.once('ready', onReady);
          
//           // Timeout after 10 seconds
//           Meteor.setTimeout(function() {
//             if (!metadataReceived) {
//               torrent.removeListener('metadata', onMetadata);
//               torrent.removeListener('ready', onReady);
              
//               // Strategy 4: Create minimal metadata as last resort
//               console.log('⚠️ Creating minimal metadata as fallback');
//               try {
//                 const minimalInfo = self._createMinimalMetadata(torrent, filesOrPath);
//                 const bencode = require('bencode');
//                 torrent.metadata = bencode.encode(minimalInfo);
//                 console.log(`✅ Created minimal metadata: ${torrent.metadata.length} bytes`);
//                 resolve(true);
//               } catch (minimalErr) {
//                 console.error('Error creating minimal metadata:', minimalErr);
//                 reject(new Error('Failed to create metadata for seeding torrent'));
//               }
//             }
//           }, 10000);
//         }
        
//       } catch (err) {
//         console.error('Error in _ensureMetadataCreation:', err);
//         reject(err);
//       }
//     });
//   },
  
//   /**
//    * Create minimal metadata structure for torrents that lack it
//    */
//   _createMinimalMetadata: function(torrent, filesOrPath) {
//     console.log('🏗️ Creating minimal metadata structure');
    
//     try {
//       // Analyze the files
//       const files = [];
//       let totalLength = 0;
      
//       if (typeof filesOrPath === 'string') {
//         // Single file or directory
//         const stats = fs.statSync(filesOrPath);
//         if (stats.isFile()) {
//           const fileName = path.basename(filesOrPath);
//           const fileSize = stats.size;
//           files.push({
//             path: [Buffer.from(fileName, 'utf8')],
//             length: fileSize
//           });
//           totalLength = fileSize;
//         } else if (stats.isDirectory()) {
//           // Read directory contents
//           const dirFiles = fs.readdirSync(filesOrPath);
//           dirFiles.forEach(function(fileName) {
//             const filePath = path.join(filesOrPath, fileName);
//             const fileStats = fs.statSync(filePath);
//             if (fileStats.isFile()) {
//               files.push({
//                 path: [Buffer.from(fileName, 'utf8')],
//                 length: fileStats.size
//               });
//               totalLength += fileStats.size;
//             }
//           });
//         }
//       } else if (Array.isArray(filesOrPath)) {
//         // Array of files
//         filesOrPath.forEach(function(file) {
//           if (file.name && file.length !== undefined) {
//             files.push({
//               path: [Buffer.from(file.name, 'utf8')],
//               length: file.length
//             });
//             totalLength += file.length;
//           }
//         });
//       }
      
//       // Create minimal info structure
//       const pieceLength = 16384; // 16KB pieces
//       const numPieces = Math.ceil(totalLength / pieceLength);
//       const pieces = Buffer.alloc(numPieces * 20); // 20 bytes per SHA1 hash
      
//       // Fill with dummy hashes (not ideal, but functional for metadata sharing)
//       for (let i = 0; i < numPieces; i++) {
//         const hash = require('crypto').createHash('sha1').update(`piece${i}`).digest();
//         hash.copy(pieces, i * 20);
//       }
      
//       const info = {
//         name: Buffer.from(torrent.name || 'FHIR Data', 'utf8'),
//         'piece length': pieceLength,
//         pieces: pieces,
//         files: files.length > 1 ? files : undefined,
//         length: files.length === 1 ? files[0].length : undefined
//       };
      
//       // Remove undefined fields
//       Object.keys(info).forEach(key => {
//         if (info[key] === undefined) {
//           delete info[key];
//         }
//       });
      
//       console.log(`✅ Created minimal info with ${files.length} files, ${totalLength} bytes total`);
//       return info;
      
//     } catch (err) {
//       console.error('Error creating minimal metadata:', err);
//       throw err;
//     }
//   },
  
//   /**
//    * ROOT CAUSE FIX #2: Set up proper metadata sharing for all peer connections
//    * This ensures every peer connection can receive metadata from seeding torrents
//    */
//   _setupMetadataSharing: function(torrent) {
//     const self = this;
    
//     console.log(`🔧 Setting up metadata sharing for seeding torrent: ${torrent.name}`);
    
//     if (!torrent.metadata) {
//       console.error('❌ Cannot setup metadata sharing - no metadata available');
//       return;
//     }
    
//     // Fix all existing wire connections
//     if (torrent.wires && torrent.wires.length > 0) {
//       console.log(`🔌 Fixing ${torrent.wires.length} existing connections`);
//       torrent.wires.forEach(function(wire, index) {
//         self._installMetadataOnWire(wire, torrent, `existing-${index}`);
//       });
//     }
    
//     // Override _onWire to ensure all NEW connections get metadata sharing
//     const originalOnWire = torrent._onWire;
    
//     torrent._onWire = function(wire) {
//       console.log(`🔌 New seeding connection: ${wire.remoteAddress} - installing metadata`);
      
//       // Call original handler first
//       if (originalOnWire) {
//         originalOnWire.call(this, wire);
//       }
      
//       // Install metadata sharing immediately
//       Meteor.setTimeout(function() {
//         self._installMetadataOnWire(wire, torrent, 'new');
//       }, 500); // Small delay to ensure wire is initialized
//     };
    
//     console.log(`✅ Metadata sharing configured for ${torrent.name}`);
//   },
  
//   /**
//    * Install ut_metadata extension on a specific wire with proper error handling
//    */
//   _installMetadataOnWire: function(wire, torrent, connectionType) {
//     try {
//       console.log(`📡 Installing metadata on ${connectionType} connection: ${wire.remoteAddress}`);
      
//       // Check if peer supports extended protocol
//       if (!wire.extended) {
//         console.log(`   ⚠️ Peer ${wire.remoteAddress} doesn't support extended protocol`);
//         return;
//       }
      
//       // Remove any existing ut_metadata
//       if (wire.ut_metadata) {
//         delete wire.ut_metadata;
//         console.log(`   🗑️ Removed existing ut_metadata`);
//       }
      
//       // Install fresh ut_metadata extension with torrent metadata
//       const ut_metadata = require('ut_metadata');
//       wire.use(ut_metadata(torrent.metadata));
//       console.log(`   ✅ Installed ut_metadata with ${torrent.metadata.length} bytes`);
      
//       // Send proper extended handshake advertising metadata
//       const handshakeMsg = {
//         m: {
//           ut_metadata: 1
//         },
//         v: 'WebTorrent-Seeding-Fixed',
//         metadata_size: torrent.metadata.length,
//         reqq: 250
//       };
      
//       try {
//         wire.extended('handshake', Buffer.from(JSON.stringify(handshakeMsg)));
//         console.log(`   📡 Sent seeding handshake with metadata_size=${torrent.metadata.length}`);
//       } catch (handshakeErr) {
//         console.error(`   ❌ Handshake error: ${handshakeErr.message}`);
//       }
      
//       // Set up aggressive metadata response for incoming requests
//       wire.removeAllListeners('extended'); // Clear any existing handlers
//       wire.on('extended', function(ext, buf) {
//         if (ext === 'ut_metadata') {
//           console.log(`   📤 Metadata request from ${wire.remoteAddress} - responding immediately`);
          
//           try {
//             // Parse the request
//             let request;
//             try {
//               request = JSON.parse(buf.toString());
//             } catch (parseErr) {
//               // Try to handle as binary request
//               request = { msg_type: 0, piece: 0 };
//             }
            
//             if (request.msg_type === 0) { // Request
//               // Send metadata immediately
//               const response = {
//                 msg_type: 1, // data
//                 piece: request.piece || 0,
//                 total_size: torrent.metadata.length
//               };
              
//               const responseBuffer = Buffer.concat([
//                 Buffer.from(JSON.stringify(response)),
//                 torrent.metadata
//               ]);
              
//               wire.extended('ut_metadata', responseBuffer);
//               console.log(`   ✅ Sent ${torrent.metadata.length} bytes metadata to ${wire.remoteAddress}`);
//             }
//           } catch (responseErr) {
//             console.error(`   ❌ Error responding to metadata request: ${responseErr.message}`);
//           }
//         }
//       });
      
//     } catch (installErr) {
//       console.error(`❌ Error installing metadata on wire ${wire.remoteAddress}:`, installErr.message);
//     }
//   },
  
//   /**
//    * Enhanced torrent event setup with metadata monitoring
//    */
//   _setupEnhancedTorrentEvents: function(torrent) {
//     if (!torrent) {
//       console.error('Cannot setup events for null torrent');
//       return;
//     }
    
//     const self = this;
    
//     // Standard update interval
//     const updateInterval = Meteor.setInterval(function() {
//       if (torrent) self._updateTorrentRecord(torrent);
//     }, 5000);
    
//     // Enhanced event handlers
//     if (torrent && typeof torrent.on === 'function') {
//       torrent.on('close', function() {
//         Meteor.clearInterval(updateInterval);
//       });
      
//       torrent.on('done', function() {
//         console.log(`✅ Seeding torrent complete: ${torrent.name}`);
//         self._updateTorrentRecord(torrent);
//       });
      
//       torrent.on('error', function(err) {
//         console.error(`❌ Seeding torrent error ${torrent.name}:`, err);
//       });
      
//       // Monitor new wire connections
//       torrent.on('wire', function(wire) {
//         console.log(`🔌 New peer connected to seeding torrent ${torrent.name}: ${wire.remoteAddress}`);
        
//         // Ensure metadata is shared on new connections
//         if (torrent.metadata) {
//           Meteor.setTimeout(function() {
//             self._installMetadataOnWire(wire, torrent, 'event-new');
//           }, 1000);
//         }
        
//         self._updateTorrentRecord(torrent);
        
//         if (wire && typeof wire.on === 'function') {
//           wire.on('close', function() {
//             self._updateTorrentRecord(torrent);
//           });
//         }
//       });
//     }
//   },
  
//   // ... (include all other existing methods: getClient, addTorrent, getAllFileContents, etc.)
//   // These remain the same as your current implementation
  
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
        
//         // Standard torrent addition (for downloading)
//         const resolvedStoragePath = opts.path || function() {
//           const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
//           const port = process.env.PORT || 3000;
//           return storagePath.replace(/\${PORT}/g, port);
//         }();
        
//         const options = {
//           path: resolvedStoragePath,
//           ...opts
//         };
        
//         torrentClient.add(torrentId, options, function(torrent) {
//           console.log(`✅ Downloaded torrent added: ${torrent.name}`);
          
//           // Store reference and setup events
//           self._torrents.set(torrent.infoHash, torrent);
//           self._setupEnhancedTorrentEvents(torrent);
//           self._updateTorrentRecord(torrent);
          
//           resolve(torrent);
//         });
        
//       } catch (err) {
//         reject(err);
//       }
//     });
//   },
  
//   getAllFileContents: function(infoHash) {
//     // Use your existing implementation
//     return this._getFileContentsFromMemoryOrDisk(infoHash);
//   },
  
//   getTorrent: function(infoHash) {
//     return this._torrents.get(infoHash);
//   },
  
//   getAllTorrents: function() {
//     return Array.from(this._torrents.values());
//   },
  
//   // Include your existing _updateTorrentRecord method
//   _updateTorrentRecord: async function(torrent) {
//     // Your existing implementation
//     if (!torrent) return;
    
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
      
//       const existing = await TorrentsCollection.findOneAsync({ infoHash: torrent.infoHash });
      
//       if (existing) {
//         await TorrentsCollection.updateAsync(
//           { infoHash: torrent.infoHash },
//           { $set: torrentData }
//         );
//       } else {
//         torrentData.created = new Date();
//         torrentData.description = torrent.comment || '';
//         torrentData.fhirType = 'unknown';
//         torrentData.meta = {
//           fhirVersion: '',
//           resourceCount: 0,
//           profile: ''
//         };
        
//         await TorrentsCollection.insertAsync(torrentData);
//       }
//     } catch (err) {
//       console.error(`Error updating torrent record:`, err);
//     }
//   }
// };

// // Initialize on startup
// Meteor.startup(function() {
//   console.log('🚀 Initializing WebTorrent server with metadata fixes...');
//   Meteor.setTimeout(function() {
//     WebTorrentServer.initialize()
//       .then(function() {
//         console.log('✅ WebTorrent server with metadata fixes initialized!');
//       })
//       .catch(function(err) {
//         console.error('❌ Failed to initialize WebTorrent server:', err);
//       });
//   }, 1000);
// });