// server/webtorrent-metadata-fix.js - Fix for WebTorrent metadata extension support

import { Meteor } from 'meteor/meteor';

/**
 * Enhanced WebTorrent client initialization with proper metadata extension support
 * This ensures that all torrents properly support the ut_metadata extension (BEP 9)
 */

// Store original WebTorrent constructor
let OriginalWebTorrent = null;

/**
 * Get WebTorrent with enhanced metadata support
 */
function getEnhancedWebTorrent() {
  if (!OriginalWebTorrent) {
    try {
      OriginalWebTorrent = require('webtorrent');
      console.log('✅ Loaded WebTorrent for metadata enhancement');
    } catch (err) {
      console.error('❌ Failed to load WebTorrent:', err);
      throw err;
    }
  }
  
  // Enhanced WebTorrent class that ensures metadata support
  class EnhancedWebTorrent extends OriginalWebTorrent {
    constructor(opts = {}) {
      // Enhanced options that force metadata extension support
      const enhancedOpts = {
        ...opts,
        
        // Ensure DHT is enabled for peer discovery
        dht: true,
        
        // Enable all extensions
        webSeeds: true,
        
        // Force metadata extension to be available
        enableExtensions: true,
        
        // Enhanced tracker configuration
        tracker: opts.tracker || [
          'wss://tracker.openwebtorrent.com',
          'wss://tracker.btorrent.xyz', 
          'wss://tracker.fastcast.nz'
        ]
      };
      
      console.log('🔧 Creating enhanced WebTorrent client with metadata support');
      super(enhancedOpts);
      
      // Ensure metadata extension is properly initialized
      this._enhanceMetadataSupport();
    }
    
    /**
     * Enhanced metadata support for all torrents
     * @private
     */
    _enhanceMetadataSupport() {
      const originalAdd = this.add.bind(this);
      const originalSeed = this.seed.bind(this);
      
      // Override add method to ensure metadata support
      this.add = function(torrentId, opts = {}, callback) {
        console.log('🎯 Enhanced add: ensuring metadata support for torrent');
        
        // Enhanced options for metadata support
        const metadataOpts = {
          ...opts,
          
          // Force metadata extension
          enableMetadata: true,
          
          // Ensure extensions are enabled
          extensions: true,
          
          // Store references for metadata sharing
          storeMetadata: true
        };
        
        const torrent = originalAdd(torrentId, metadataOpts, callback);
        
        if (torrent) {
          // Enhance the torrent with metadata support
          this._enhanceTorrentMetadata(torrent);
        }
        
        return torrent;
      };
      
      // Override seed method to ensure metadata support
      this.seed = function(input, opts = {}, callback) {
        console.log('🌱 Enhanced seed: ensuring metadata support for seeded torrent');
        
        // Enhanced options for seeding with metadata
        const seedOpts = {
          ...opts,
          
          // Force metadata sharing
          shareMetadata: true,
          
          // Enable all extensions for seeding
          extensions: true,
          
          // Ensure metadata is available
          enableMetadata: true
        };
        
        const torrent = originalSeed(input, seedOpts, callback);
        
        if (torrent) {
          // Enhance the seeded torrent with metadata support
          this._enhanceTorrentMetadata(torrent, true);
        }
        
        return torrent;
      };
    }
    
    /**
     * Enhance a torrent with proper metadata support
     * @private
     * @param {Object} torrent - The torrent to enhance
     * @param {Boolean} isSeeding - Whether this is a seeding torrent
     */
    _enhanceTorrentMetadata(torrent, isSeeding = false) {
      if (!torrent) return;
      
      console.log(`🔧 Enhancing metadata support for ${isSeeding ? 'seeding' : 'downloading'} torrent: ${torrent.name || torrent.infoHash}`);
      
      // Store original wire handler
      const originalOnWire = torrent._onWire;
      
      // Enhanced wire handling with metadata support
      torrent._onWire = function(wire) {
        console.log(`🔌 Enhanced wire connection for ${wire.remoteAddress}:${wire.remotePort}`);
        
        // Call original handler first
        if (originalOnWire) {
          originalOnWire.call(this, wire);
        }
        
        // Ensure ut_metadata extension is loaded
        try {
          if (!wire.ut_metadata) {
            console.log(`📡 Loading ut_metadata extension for peer ${wire.remoteAddress}`);
            
            // Dynamically load ut_metadata extension if not present
            const ut_metadata = require('ut_metadata');
            
            if (isSeeding && torrent.metadata) {
              // For seeding torrents, provide the metadata
              wire.use(ut_metadata(torrent.metadata));
              console.log(`✅ Loaded ut_metadata extension with metadata for seeding peer ${wire.remoteAddress}`);
            } else {
              // For downloading torrents, load extension without metadata
              wire.use(ut_metadata());
              console.log(`✅ Loaded ut_metadata extension for downloading peer ${wire.remoteAddress}`);
            }
          } else {
            console.log(`✅ ut_metadata extension already available for peer ${wire.remoteAddress}`);
          }
        } catch (metadataErr) {
          console.error(`❌ Error loading ut_metadata extension for ${wire.remoteAddress}:`, metadataErr);
        }
        
        // Enhanced peer communication
        this._enhancePeerCommunication(wire, isSeeding);
      }.bind(torrent);
      
      // If this is a seeding torrent, ensure metadata is immediately available
      if (isSeeding) {
        torrent.on('ready', function() {
          console.log(`🌱 Seeding torrent ready: ${torrent.name}, ensuring metadata is available`);
          
          // Force metadata availability for all connected peers
          if (torrent.wires) {
            torrent.wires.forEach(function(wire) {
              if (wire.ut_metadata && torrent.metadata) {
                console.log(`📤 Ensuring metadata is available for peer ${wire.remoteAddress}`);
                
                // Make sure the peer knows we have metadata
                if (typeof wire.ut_metadata.setMetadata === 'function') {
                  wire.ut_metadata.setMetadata(torrent.metadata);
                }
              }
            });
          }
        });
      }
    }
    
    /**
     * Enhance peer communication for better metadata exchange
     * @private
     * @param {Object} wire - The wire (peer connection)
     * @param {Boolean} isSeeding - Whether this is a seeding torrent
     */
    _enhancePeerCommunication(wire, isSeeding) {
      // Enhanced handshake for metadata support
      const originalHandshake = wire.handshake;
      
      wire.handshake = function(infoHash, peerId, extensions = {}) {
        // Enhanced extensions that advertise metadata support
        const enhancedExtensions = {
          ...extensions,
          extended: true,  // Enable extended protocol
          ut_metadata: true  // Advertise metadata support
        };
        
        console.log(`🤝 Enhanced handshake with ${wire.remoteAddress}, advertising metadata support`);
        
        return originalHandshake.call(this, infoHash, peerId, enhancedExtensions);
      };
      
      // For seeding peers, be more aggressive about sharing metadata
      if (isSeeding) {
        wire.on('extended', function(ext, buf) {
          if (ext === 'ut_metadata' && wire.ut_metadata) {
            console.log(`📤 Received metadata request from ${wire.remoteAddress}, responding...`);
            
            // Immediately respond to metadata requests
            try {
              if (wire.torrent && wire.torrent.metadata) {
                wire.ut_metadata.setMetadata(wire.torrent.metadata);
              }
            } catch (err) {
              console.error(`Error responding to metadata request from ${wire.remoteAddress}:`, err);
            }
          }
        });
      }
      
      // For downloading peers, be more aggressive about requesting metadata
      if (!isSeeding) {
        wire.on('extended', function(ext, buf) {
          if (ext === 'handshake' && wire.peerExtensions && wire.peerExtensions.ut_metadata) {
            console.log(`📥 Peer ${wire.remoteAddress} supports metadata, requesting...`);
            
            // Immediately request metadata
            try {
              if (wire.ut_metadata && typeof wire.ut_metadata.fetch === 'function') {
                wire.ut_metadata.fetch();
                console.log(`✅ Requested metadata from ${wire.remoteAddress}`);
              }
            } catch (err) {
              console.error(`Error requesting metadata from ${wire.remoteAddress}:`, err);
            }
          }
        });
      }
    }
  }
  
  return EnhancedWebTorrent;
}

// Export the enhanced WebTorrent
export default getEnhancedWebTorrent;