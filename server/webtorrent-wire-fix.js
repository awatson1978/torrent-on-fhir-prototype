// server/webtorrent-wire-fix.js - Fix for metadata exchange between peers

import { Meteor } from 'meteor/meteor';

/**
 * Enhanced wire protocol fix for WebTorrent metadata exchange
 * This addresses the core issue where peers can't exchange metadata properly
 */
export const WebTorrentWireFix = {
  /**
   * Apply comprehensive fixes to a torrent for proper metadata exchange
   * @param {Object} torrent - WebTorrent torrent object
   * @param {Boolean} isSeeding - Whether this is a seeding torrent
   */
  applyTorrentFixes: function(torrent, isSeeding = false) {
    if (!torrent) return;
    
    console.log(`🔧 Applying WebTorrent wire protocol fixes for ${torrent.name} (${isSeeding ? 'seeding' : 'downloading'})`);
    
    // Fix 1: Override wire creation to ensure proper initialization
    const originalOnWire = torrent._onWire;
    let wireCount = 0;
    
    torrent._onWire = function(wire) {
      wireCount++;
      const wireId = wireCount;
      console.log(`🔌 Wire ${wireId} created, starting enhanced initialization`);
      
      // Call original handler first
      if (originalOnWire) {
        originalOnWire.call(this, wire);
      }
      
      // Set up enhanced wire initialization
      WebTorrentWireFix.initializeWire(wire, torrent, wireId, isSeeding);
    };
    
    // Fix 2: Process existing wires
    if (torrent.wires && torrent.wires.length > 0) {
      console.log(`🔧 Processing ${torrent.wires.length} existing wires`);
      torrent.wires.forEach(function(wire, index) {
        WebTorrentWireFix.initializeWire(wire, torrent, index, isSeeding);
      });
    }
    
    // Fix 3: Ensure torrent has proper metadata object (for seeding)
    if (isSeeding && torrent.info && !torrent.metadata) {
      try {
        const bencode = require('bencode');
        torrent.metadata = bencode.encode(torrent.info);
        console.log(`✅ Created metadata object for seeding: ${torrent.metadata.length} bytes`);
      } catch (err) {
        console.error('Error creating metadata:', err);
      }
    }
  },
  
  /**
   * Initialize a wire connection with proper timing and metadata support
   * @param {Object} wire - Wire connection object
   * @param {Object} torrent - Parent torrent
   * @param {Number} wireId - Wire identifier
   * @param {Boolean} isSeeding - Whether this is a seeding torrent
   */
  initializeWire: function(wire, torrent, wireId, isSeeding) {
    if (!wire) {
      console.log(`❌ Wire ${wireId} is null`);
      return;
    }
    
    // Check if wire is ready for initialization
    function checkWireReady() {
      // Critical checks for wire readiness
      const checks = {
        exists: !!wire,
        notDestroyed: !wire.destroyed,
        hasSocket: !!wire._socket,
        hasRemoteAddress: !!wire.remoteAddress,
        handshakeComplete: !!wire._handshakeComplete
      };
      
      // Minimum requirements
      const ready = checks.exists && checks.notDestroyed && checks.hasSocket;
      
      return { ready, checks };
    }
    
    // Retry initialization until wire is ready
    let attempts = 0;
    const maxAttempts = 20;
    
    function attemptInitialization() {
      attempts++;
      
      const readiness = checkWireReady();
      
      if (!readiness.ready) {
        if (attempts < maxAttempts) {
          // console.log(`⏳ Wire ${wireId} not ready (attempt ${attempts}/${maxAttempts})`);
          Meteor.setTimeout(attemptInitialization, 500);
        } else {
          console.log(`❌ Wire ${wireId} initialization timeout`);
        }
        return;
      }
      
      // Wire has basic connectivity, wait for handshake
      if (!readiness.checks.handshakeComplete) {
        console.log(`⏳ Wire ${wireId} waiting for handshake...`);
        
        // Set up one-time handshake listener
        const onHandshake = function() {
          console.log(`✅ Wire ${wireId} handshake complete: ${wire.remoteAddress}`);
          WebTorrentWireFix.setupMetadataExchange(wire, torrent, wireId, isSeeding);
        };
        
        // Check if already handshaked
        if (wire._handshakeComplete) {
          onHandshake();
        } else {
          wire.once('handshake', onHandshake);
          
          // Timeout safety
          Meteor.setTimeout(function() {
            wire.removeListener('handshake', onHandshake);
            if (!wire._handshakeComplete) {
              console.log(`⏰ Wire ${wireId} handshake timeout`);
            }
          }, 15000);
        }
      } else {
        // Already handshaked
        console.log(`✅ Wire ${wireId} ready: ${wire.remoteAddress}`);
        WebTorrentWireFix.setupMetadataExchange(wire, torrent, wireId, isSeeding);
      }
    }
    
    // Start initialization attempts
    attemptInitialization();
  },
  
  /**
   * Set up metadata exchange on a ready wire
   * @param {Object} wire - Wire connection that's ready
   * @param {Object} torrent - Parent torrent
   * @param {Number} wireId - Wire identifier
   * @param {Boolean} isSeeding - Whether this is a seeding torrent
   */
  setupMetadataExchange: function(wire, torrent, wireId, isSeeding) {
    if (!wire || wire.destroyed) return;
    
    console.log(`📡 Setting up metadata exchange for wire ${wireId}: ${wire.remoteAddress} (${isSeeding ? 'seeding' : 'downloading'})`);
    
    try {
      // Load ut_metadata extension
      const ut_metadata = require('ut_metadata');
      
      // Remove any existing ut_metadata
      if (wire.ut_metadata) {
        delete wire.ut_metadata;
      }
      
      // Install ut_metadata based on role
      if (isSeeding && torrent.metadata) {
        // Seeding: provide metadata
        wire.use(ut_metadata(torrent.metadata));
        console.log(`✅ Installed ut_metadata for seeding (${torrent.metadata.length} bytes)`);
        
        // Send extended handshake advertising metadata
        WebTorrentWireFix.sendExtendedHandshake(wire, torrent, true);
        
        // Set up metadata response handler
        WebTorrentWireFix.setupSeedingHandler(wire, torrent, wireId);
        
      } else if (!isSeeding) {
        // Downloading: request metadata
        wire.use(ut_metadata());
        console.log(`✅ Installed ut_metadata for downloading`);
        
        // Send extended handshake
        WebTorrentWireFix.sendExtendedHandshake(wire, torrent, false);
        
        // Request metadata after a short delay
        Meteor.setTimeout(function() {
          if (wire.ut_metadata && typeof wire.ut_metadata.fetch === 'function') {
            console.log(`📥 Requesting metadata from ${wire.remoteAddress}`);
            wire.ut_metadata.fetch();
          }
        }, 1000);
      }
      
      // Ensure we're interested and not choking
      if (!wire.amInterested) {
        wire.interested();
      }
      
      if (wire.amChoking) {
        wire.unchoke();
      }
      
    } catch (err) {
      console.error(`Error setting up metadata exchange for wire ${wireId}:`, err);
    }
  },
  
  /**
   * Send proper extended handshake
   * @param {Object} wire - Wire connection
   * @param {Object} torrent - Parent torrent
   * @param {Boolean} isSeeding - Whether seeding
   */
  sendExtendedHandshake: function(wire, torrent, isSeeding) {
    if (!wire.extended) return;
    
    try {
      const handshake = {
        m: {
          ut_metadata: 1
        },
        v: 'WebTorrent-Fixed'
      };
      
      if (isSeeding && torrent.metadata) {
        handshake.metadata_size = torrent.metadata.length;
      }
      
      // Wait for extended protocol to be ready
      if (!wire.peerExtended) {
        console.log(`⏳ Waiting for peer extended protocol...`);
        
        const onExtended = function() {
          wire.extended('handshake', Buffer.from(JSON.stringify(handshake)));
          console.log(`📡 Sent extended handshake to ${wire.remoteAddress}`);
        };
        
        wire.once('extended', onExtended);
        
        // Timeout
        Meteor.setTimeout(function() {
          wire.removeListener('extended', onExtended);
        }, 5000);
      } else {
        wire.extended('handshake', Buffer.from(JSON.stringify(handshake)));
        console.log(`📡 Sent extended handshake to ${wire.remoteAddress}`);
      }
      
    } catch (err) {
      console.error('Error sending extended handshake:', err);
    }
  },
  
  /**
   * Set up metadata serving for seeding torrents
   * @param {Object} wire - Wire connection
   * @param {Object} torrent - Parent torrent
   * @param {Number} wireId - Wire identifier
   */
  setupSeedingHandler: function(wire, torrent, wireId) {
    // Remove any existing listeners
    wire.removeAllListeners('extended');
    
    wire.on('extended', function(ext, buf) {
      if (ext === 'ut_metadata' && torrent.metadata) {
        console.log(`📤 Metadata request from ${wire.remoteAddress}`);
        
        try {
          // Parse request
          let request;
          try {
            request = JSON.parse(buf.toString());
          } catch (e) {
            // Binary format
            request = { msg_type: 0, piece: 0 };
          }
          
          if (request.msg_type === 0) { // request
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
            console.log(`✅ Sent metadata to ${wire.remoteAddress}`);
          }
        } catch (err) {
          console.error('Error handling metadata request:', err);
        }
      }
    });
  },
  
  /**
   * Apply fixes to WebTorrent client for better connectivity
   * @param {Object} client - WebTorrent client
   */
  applyClientFixes: function(client) {
    if (!client) return;
    
    console.log('🔧 Applying WebTorrent client fixes');
    
    // Override torrent creation to auto-apply fixes
    const originalAdd = client.add;
    const originalSeed = client.seed;
    
    client.add = function(torrentId, opts, cb) {
      console.log('🔧 Intercepting torrent add for wire fixes');
      
      const torrent = originalAdd.call(this, torrentId, opts, function(torrent) {
        console.log(`✅ Torrent added: ${torrent.name}, applying wire fixes`);
        WebTorrentWireFix.applyTorrentFixes(torrent, false);
        
        if (cb) cb(torrent);
      });
      
      // Also handle synchronous return
      if (torrent && torrent.infoHash) {
        Meteor.setTimeout(function() {
          WebTorrentWireFix.applyTorrentFixes(torrent, false);
        }, 100);
      }
      
      return torrent;
    };
    
    client.seed = function(input, opts, cb) {
      console.log('🔧 Intercepting torrent seed for wire fixes');
      
      return originalSeed.call(this, input, opts, function(torrent) {
        console.log(`✅ Torrent seeding: ${torrent.name}, applying wire fixes`);
        WebTorrentWireFix.applyTorrentFixes(torrent, true);
        
        if (cb) cb(torrent);
      });
    };
  }
};

// Auto-apply fixes on startup
Meteor.startup(function() {
  console.log('🔧 WebTorrent Wire Fix module loaded');
});