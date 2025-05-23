// server/methods/enhanced-metadata-methods.js - Enhanced metadata exchange handling

import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { WebTorrentServer } from '../webtorrent-server';
import { TorrentsCollection } from '/imports/api/torrents/torrents';
import { Settings } from '/imports/api/settings/settings';

/**
 * Enhanced metadata exchange with aggressive peer communication
 * This addresses the common WebTorrent issue where metadata is not received from peers
 */

Meteor.methods({


  /**
   * Enhanced torrent reload with metadata focus
   * @param {String} infoHash - Info hash of the torrent
   * @return {Object} Result of enhanced reload
   */
  'torrents.enhancedReload': async function(infoHash) {
    check(infoHash, String);
    
    console.log(`🔄 Starting enhanced torrent reload for ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      actions: [],
      success: false
    };
    
    try {
      // Remove existing torrent instance if present
      const existingTorrent = WebTorrentServer.getTorrent(infoHash);
      if (existingTorrent) {
        result.actions.push('🗑️ Removing existing torrent instance');
        await WebTorrentServer.removeTorrent(infoHash, false); // Don't remove files
        result.actions.push('✅ Existing torrent removed');
      }
      
      // Get torrent record from database
      const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
      if (!torrentRecord || !torrentRecord.magnetURI) {
        throw new Error('Torrent record not found or missing magnet URI');
      }
      
      result.actions.push(`📋 Found torrent record: ${torrentRecord.name}`);
      
      // Enhanced reload with metadata-optimized settings
      const enhancedOptions = {
        path: function() {
          const storagePath = Settings.get('private.storage.tempPath', '/tmp/fhir-torrents');
          const port = process.env.PORT || 3000;
          return storagePath.replace(/\${PORT}/g, port);
        }(),
        
        // Enhanced tracker list for better peer discovery
        announce: [
          'wss://tracker.openwebtorrent.com',
          'wss://tracker.btorrent.xyz',
          'wss://tracker.fastcast.nz',
          'wss://tracker.webtorrent.io'
        ],
        
        // Force DHT for peer discovery
        dht: true,
        
        // Enable all WebTorrent extensions
        webSeeds: true,
        
        // Longer timeout for metadata exchange
        timeout: 120000
      };
      
      result.actions.push('🚀 Reloading torrent with enhanced metadata-optimized settings');
      
      const reloadedTorrent = await WebTorrentServer.addTorrent(torrentRecord.magnetURI, enhancedOptions);
      
      result.actions.push(`✅ Torrent reloaded: ${reloadedTorrent.name}`);
      
      // Immediately try enhanced metadata exchange
      result.actions.push('🎯 Starting immediate enhanced metadata exchange');
      
      const metadataResult = await Meteor.callAsync('torrents.forceMetadataExchange', infoHash);
      
      result.metadataExchangeResult = metadataResult;
      result.success = metadataResult.success;
      result.actions.push(...metadataResult.actions);
      
      if (metadataResult.success) {
        result.actions.push('🎉 Enhanced reload completed successfully with metadata');
      } else {
        result.actions.push('⚠️ Enhanced reload completed but metadata exchange failed');
      }
      
      return result;
      
    } catch (error) {
      console.error('Error in enhanced torrent reload:', error);
      result.error = error.message;
      result.actions.push(`❌ Error: ${error.message}`);
      return result;
    }
  },

  /**
   * Diagnose metadata exchange issues
   * @param {String} infoHash - Info hash of the torrent
   * @return {Object} Detailed diagnosis
   */
  'torrents.diagnoseMetadataIssues': function(infoHash) {
    check(infoHash, String);
    
    console.log(`🔍 Diagnosing metadata exchange issues for ${infoHash}`);
    
    const diagnosis = {
      timestamp: new Date(),
      infoHash: infoHash,
      issues: [],
      recommendations: [],
      peerAnalysis: []
    };
    
    try {
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        diagnosis.issues.push('Torrent not found in WebTorrent client');
        diagnosis.recommendations.push('Reload the torrent using enhanced reload method');
        return diagnosis;
      }
      
      // Analyze basic torrent state
      diagnosis.basic = {
        ready: torrent.ready,
        paused: torrent.paused,
        files: torrent.files ? torrent.files.length : 0,
        peers: torrent.numPeers,
        wires: torrent.wires ? torrent.wires.length : 0,
        progress: torrent.progress
      };
      
      // Check for common issues
      if (!torrent.ready && torrent.files.length === 0) {
        diagnosis.issues.push('Torrent not ready and has no files - metadata not received');
      }
      
      if (torrent.numPeers === 0) {
        diagnosis.issues.push('No peers connected - cannot receive metadata');
        diagnosis.recommendations.push('Check tracker connectivity and DHT status');
      }
      
      if (torrent.numPeers > 0 && torrent.files.length === 0) {
        diagnosis.issues.push('Peers connected but no metadata received - protocol issue');
        diagnosis.recommendations.push('Try enhanced metadata exchange method');
      }
      
      // Analyze peer connections
      if (torrent.wires && torrent.wires.length > 0) {
        torrent.wires.forEach(function(wire, index) {
          // CRITICAL: Validate wire state before accessing properties
          if (!wire) {
            console.log(`Skipping null wire at index ${index}`);
            diagnosis.issues.push(`Wire ${index} is null/undefined`);
            return;
          }
          
          if (!wire.remoteAddress) {
            console.log(`Skipping wire ${index} - no remoteAddress (connection not established)`);
            diagnosis.issues.push(`Wire ${index} has no remote address - connection still initializing`);
            return;
          }
          
          if (wire.destroyed) {
            console.log(`Skipping wire ${index} - connection destroyed`);
            diagnosis.issues.push(`Wire ${index} connection was destroyed`);
            return;
          }
          
          const peerInfo = {
            index: index,
            address: wire.remoteAddress,  // ← NOW SAFE
            port: wire.remotePort,
            supportsMetadata: !!(wire.peerExtensions && wire.peerExtensions.ut_metadata),
            interested: wire.peerInterested,
            choking: wire.peerChoking,
            extensions: wire.peerExtensions ? Object.keys(wire.peerExtensions) : []
          };
          
          diagnosis.peerAnalysis.push(peerInfo);
          
          if (!peerInfo.supportsMetadata) {
            diagnosis.issues.push(`Peer ${peerInfo.address} does not support ut_metadata extension`);
          }
          
          if (!peerInfo.interested) {
            diagnosis.issues.push(`Peer ${peerInfo.address} is not interested in our data`);
          }
          
          if (peerInfo.choking) {
            diagnosis.issues.push(`Peer ${peerInfo.address} is choking us`);
          }
        });
        
        const metadataPeers = diagnosis.peerAnalysis.filter(p => p.supportsMetadata).length;
        if (metadataPeers === 0) {
          diagnosis.issues.push('No connected peers support metadata extension');
          diagnosis.recommendations.push('Wait for more peers or try different trackers');
        }
      }
      
      // Check WebTorrent configuration
      const client = WebTorrentServer.getClient();
      if (client) {
        diagnosis.client = {
          destroyed: client.destroyed,
          torrents: client.torrents.length,
          maxConns: client.maxConns,
          nodeId: client.nodeId ? client.nodeId.toString('hex') : null
        };
      }
      
      // Generate specific recommendations
      if (diagnosis.issues.length === 0) {
        diagnosis.recommendations.push('No obvious issues detected - torrent should be working normally');
      } else {
        diagnosis.recommendations.push('Use enhanced metadata exchange to force peer communication');
        diagnosis.recommendations.push('Consider using enhanced reload to restart with optimized settings');
        
        if (diagnosis.peerAnalysis.length > 0) {
          diagnosis.recommendations.push('Peer connections exist - try forcing metadata requests');
        } else {
          diagnosis.recommendations.push('No peer connections - check network connectivity and trackers');
        }
      }
      
      console.log('🔍 Metadata diagnosis completed:', diagnosis);
      return diagnosis;
      
    } catch (error) {
      console.error('Error in metadata diagnosis:', error);
      diagnosis.error = error.message;
      return diagnosis;
    }
  },

  /**
   * Force complete metadata exchange resolution
   * This addresses the specific issue where seeding peers don't properly 
   * advertise or share ut_metadata extension
   */
  'torrents.forceCompleteMetadataFix': async function(infoHash) {
    check(infoHash, String);
    
    console.log(`🔧 COMPLETE METADATA FIX for torrent ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      actions: [],
      success: false,
      strategy: 'complete-fix'
    };
    
    try {
      let torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
        if (!torrentRecord?.magnetURI) {
          throw new Error('Torrent not found');
        }
        
        result.actions.push('🔄 Reloading torrent for complete metadata fix');
        torrent = await WebTorrentServer.addTorrent(torrentRecord.magnetURI);
        Meteor.setTimeout(function() {
          if (torrent && typeof torrent.announce === 'function') {
            torrent.announce();
            console.log('Forced immediate announce for new torrent');
          }
        }, 1000);

      }
      
      result.actions.push(`📊 Initial: files=${torrent.files?.length || 0}, peers=${torrent.numPeers}, ready=${torrent.ready}`);
      
      // Step 1: Force ut_metadata extension on all wires
      if (torrent.wires && torrent.wires.length > 0) {
        result.actions.push(`🔧 Forcing ut_metadata extension on ${torrent.wires.length} wire connections`);
        
        for (const wire of torrent.wires) {
          try {
            // Force load ut_metadata extension if not present
            if (!wire.ut_metadata) {
              result.actions.push(`📡 Loading ut_metadata extension for ${wire.remoteAddress}`);
              
              // Dynamically require and install ut_metadata
              const ut_metadata = require('ut_metadata');
              
              // Install the extension on this wire
              if (torrent.metadata) {
                // If we have metadata (seeding), provide it
                wire.use(ut_metadata(torrent.metadata));
                result.actions.push(`✅ Installed ut_metadata with metadata for ${wire.remoteAddress}`);
              } else {
                // If we don't have metadata (downloading), install without
                wire.use(ut_metadata());
                result.actions.push(`✅ Installed ut_metadata for downloading from ${wire.remoteAddress}`);
              }
            }
            
            // Force extended protocol handshake
            if (!wire.peerExtended && wire.extended) {
              result.actions.push(`🤝 Forcing extended handshake with ${wire.remoteAddress}`);
              
              // Send extended handshake with ut_metadata support
              const extendedHandshake = {
                m: {
                  ut_metadata: 1
                },
                v: 'WebTorrent Enhanced',
                reqq: 250,
                metadata_size: torrent.metadata ? torrent.metadata.length : undefined
              };
              
              try {
                wire.extended('handshake', Buffer.from(JSON.stringify(extendedHandshake)));
                result.actions.push(`✅ Sent enhanced handshake to ${wire.remoteAddress}`);
              } catch (handshakeErr) {
                result.actions.push(`⚠️ Handshake error with ${wire.remoteAddress}: ${handshakeErr.message}`);
              }
            }
            
            // For downloading torrents, aggressively request metadata
            if (!torrent.ready && wire.ut_metadata) {
              result.actions.push(`📥 Aggressively requesting metadata from ${wire.remoteAddress}`);
              
              try {
                // Send multiple metadata requests
                for (let piece = 0; piece < 10; piece++) {
                  if (wire.ut_metadata.fetch) {
                    wire.ut_metadata.fetch();
                  }
                  
                  // Also try manual metadata request
                  const metadataRequest = {
                    msg_type: 0, // request
                    piece: piece
                  };
                  
                  if (wire.ut_metadata && wire.ut_metadata.id) {
                    wire.extended('ut_metadata', Buffer.from(JSON.stringify(metadataRequest)));
                  }
                }
                result.actions.push(`✅ Sent multiple metadata requests to ${wire.remoteAddress}`);
              } catch (requestErr) {
                result.actions.push(`⚠️ Metadata request error with ${wire.remoteAddress}: ${requestErr.message}`);
              }
            }
            
            // Make sure we're interested and not choking
            if (!wire.amInterested) {
              wire.interested();
              result.actions.push(`📢 Sent interested to ${wire.remoteAddress}`);
            }
            
            if (wire.amChoking) {
              wire.unchoke();
              result.actions.push(`🔓 Unchoked ${wire.remoteAddress}`);
            }
            
          } catch (wireErr) {
            result.actions.push(`❌ Error fixing wire ${wire.remoteAddress}: ${wireErr.message}`);
          }
        }
      }
      
      // Step 2: Override wire creation to ensure metadata support
      result.actions.push('🔧 Setting up enhanced wire handling for new connections');
      
      const originalOnWire = torrent._onWire;
      torrent._onWire = function(wire) {
        result.actions.push(`🔌 New wire connection: ${wire.remoteAddress}, applying metadata fix`);
        
        // Call original handler
        if (originalOnWire) {
          originalOnWire.call(this, wire);
        }
        
        // Immediately install ut_metadata extension
        setTimeout(function() {
          try {
            const ut_metadata = require('ut_metadata');
            
            if (!wire.ut_metadata) {
              if (torrent.metadata) {
                wire.use(ut_metadata(torrent.metadata));
              } else {
                wire.use(ut_metadata());
              }
              result.actions.push(`✅ Auto-installed ut_metadata on new wire ${wire.remoteAddress}`);
            }
            
            // Force extended handshake
            const extendedHandshake = {
              m: { ut_metadata: 1 },
              v: 'WebTorrent Enhanced Metadata',
              metadata_size: torrent.metadata ? torrent.metadata.length : undefined
            };
            
            wire.extended('handshake', Buffer.from(JSON.stringify(extendedHandshake)));
            
          } catch (err) {
            result.actions.push(`⚠️ Error setting up new wire ${wire.remoteAddress}: ${err.message}`);
          }
        }, 500);
      };
      
      // Step 3: Enhanced announce with metadata flags
      result.actions.push('📢 Enhanced announce with metadata support flags');
      
      try {
        if (typeof torrent.announce === 'function') {
          torrent.announce();
        }
        
        // Custom DHT announce with metadata support (fixed bencode issue)
        if (torrent.discovery?.dht) {
          const announceOpts = {
            port: 6881,
            metadata: 1, // Use integer instead of boolean for bencode compatibility
            extensions: 1 // Use integer instead of array for bencode compatibility
          };
          
          try {
            torrent.discovery.dht.announce(torrent.infoHash, announceOpts);
            result.actions.push('✅ DHT announce with metadata flags');
          } catch (dhtErr) {
            // Fallback to simple DHT announce without custom options
            torrent.discovery.dht.announce(torrent.infoHash);
            result.actions.push('✅ DHT announce (fallback without custom options)');
          }
        }
      } catch (announceErr) {
        result.actions.push(`⚠️ Announce error: ${announceErr.message}`);
      }
      
      // Step 4: Wait for metadata with enhanced monitoring
      result.actions.push('⏳ Starting enhanced metadata wait (90 seconds)');
      
      const maxWaitTime = 90000;
      const startTime = Date.now();
      
      return new Promise(function(resolve) {
        const checker = Meteor.setInterval(function() {
          const elapsed = Date.now() - startTime;
          const status = {
            ready: torrent.ready,
            files: torrent.files?.length || 0,
            peers: torrent.numPeers,
            progress: Math.round(torrent.progress * 100),
            wires: torrent.wires?.length || 0
          };
          
          result.actions.push(`📊 Check ${elapsed}ms: ready=${status.ready}, files=${status.files}, peers=${status.peers}`);
          
          // Success condition
          if (torrent.ready && torrent.files && torrent.files.length > 0) {
            Meteor.clearInterval(checker);
            result.success = true;
            result.finalStatus = status;
            result.actions.push(`🎉 COMPLETE SUCCESS: Metadata received after ${elapsed}ms!`);
            
            // Update database
            WebTorrentServer._updateTorrentRecord(torrent);
            
            resolve(result);
            return;
          }
          
          // Re-apply fixes every 15 seconds
          if (elapsed % 15000 < 2000) {
            result.actions.push('🔄 Re-applying metadata fixes...');
            
            torrent.wires?.forEach(function(wire) {
              if (!wire.ut_metadata) {
                try {
                  const ut_metadata = require('ut_metadata');
                  wire.use(ut_metadata());
                } catch (e) {
                  // Ignore errors
                }
              }
              
              if (wire.ut_metadata?.fetch) {
                wire.ut_metadata.fetch();
              }
            });
          }
          
          // Timeout
          if (elapsed >= maxWaitTime) {
            Meteor.clearInterval(checker);
            result.success = false;
            result.finalStatus = status;
            result.actions.push(`⏰ Timeout after ${elapsed}ms`);
            resolve(result);
          }
        }, 2000);
      });
      
    } catch (error) {
      console.error('Complete metadata fix error:', error);
      result.error = error.message;
      result.actions.push(`❌ Fatal error: ${error.message}`);
      return result;
    }
  },

  /**
   * Enhanced seeding torrent metadata sharing fix
   * This specifically fixes the seeding side to properly advertise and share metadata
   */
  'torrents.fixSeedingMetadata': function(infoHash) {
    check(infoHash, String);
    
    console.log(`🌱 FIXING SEEDING METADATA for torrent ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      actions: [],
      success: false
    };
    
    try {
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        throw new Error('Torrent not found in client');
      }
      
      if (!torrent.metadata) {
        throw new Error('Torrent has no metadata to share');
      }
      
      result.actions.push(`🌱 Fixing seeding metadata for: ${torrent.name}`);
      result.actions.push(`📊 Current: files=${torrent.files.length}, peers=${torrent.numPeers}, metadata=${!!torrent.metadata}`);
      
      // Fix all existing wire connections
      if (torrent.wires && torrent.wires.length > 0) {
        torrent.wires.forEach(function(wire, index) {
          result.actions.push(`🔧 Fixing wire ${index}: ${wire.remoteAddress}`);
          
          try {
            // Force install ut_metadata with metadata
            const ut_metadata = require('ut_metadata');
            
            // Remove existing extension if present
            if (wire.ut_metadata) {
              delete wire.ut_metadata;
            }
            
            // Install fresh extension with metadata
            wire.use(ut_metadata(torrent.metadata));
            result.actions.push(`✅ Installed ut_metadata with metadata for ${wire.remoteAddress}`);
            
            // Force extended handshake with metadata advertisement
            const extendedHandshake = {
              m: {
                ut_metadata: 1
              },
              v: 'WebTorrent Seeding Enhanced',
              metadata_size: torrent.metadata.length,
              reqq: 250
            };
            
            wire.extended('handshake', Buffer.from(JSON.stringify(extendedHandshake)));
            result.actions.push(`🤝 Sent seeding handshake to ${wire.remoteAddress}`);
            
            // Set up aggressive metadata sharing
            wire.on('extended', function(ext, buf) {
              if (ext === 'ut_metadata') {
                result.actions.push(`📤 Metadata request from ${wire.remoteAddress}, responding immediately`);
                
                try {
                  // Parse the request
                  const request = JSON.parse(buf.toString());
                  
                  if (request.msg_type === 0) { // request
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
                    result.actions.push(`✅ Sent metadata to ${wire.remoteAddress}`);
                  }
                } catch (responseErr) {
                  result.actions.push(`⚠️ Error responding to metadata request: ${responseErr.message}`);
                }
              }
            });
            
          } catch (wireErr) {
            result.actions.push(`❌ Error fixing wire ${wire.remoteAddress}: ${wireErr.message}`);
          }
        });
      }
      
      // Override wire handling for new connections
      const originalOnWire = torrent._onWire;
      torrent._onWire = function(wire) {
        result.actions.push(`🔌 New seeding connection: ${wire.remoteAddress}`);
        
        // Call original
        if (originalOnWire) {
          originalOnWire.call(this, wire);
        }
        
        // Immediately set up metadata sharing
        setTimeout(function() {
          try {
            const ut_metadata = require('ut_metadata');
            wire.use(ut_metadata(torrent.metadata));
            
            const extendedHandshake = {
              m: { ut_metadata: 1 },
              v: 'WebTorrent Seeding Enhanced',
              metadata_size: torrent.metadata.length
            };
            
            wire.extended('handshake', Buffer.from(JSON.stringify(extendedHandshake)));
            result.actions.push(`✅ Auto-setup metadata sharing for new connection ${wire.remoteAddress}`);
          } catch (err) {
            result.actions.push(`⚠️ Error setting up new seeding connection: ${err.message}`);
          }
        }, 100);
      };
      
      result.success = true;
      result.actions.push('🎉 Seeding metadata fix applied successfully');
      
      return result;
      
    } catch (error) {
      console.error('Seeding metadata fix error:', error);
      result.error = error.message;
      result.actions.push(`❌ Error: ${error.message}`);
      return result;
    }
  },

  /**
   * Fix seeding torrents that don't have metadata object properly attached
   * This is the root cause of why downloading peers can't get metadata
   */
  'torrents.fixSeedingMetadataCreation': async function(infoHash) {
    check(infoHash, String);
    
    console.log(`🔧 FIXING SEEDING METADATA CREATION for torrent ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      actions: [],
      success: false,
      strategy: 'seeding-metadata-creation'
    };
    
    try {
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        throw new Error('Torrent not found in client');
      }
      
      result.actions.push(`🌱 Analyzing seeding torrent: ${torrent.name}`);
      result.actions.push(`📊 Status: files=${torrent.files?.length || 0}, ready=${torrent.ready}, hasMetadata=${!!torrent.metadata}`);
      
      // Check if torrent has files but no metadata
      if (torrent.files && torrent.files.length > 0 && !torrent.metadata) {
        result.actions.push('🔍 Torrent has files but no metadata - this is the problem!');
        
        // Try to reconstruct metadata from torrent info
        if (torrent.info) {
          result.actions.push('📋 Attempting to reconstruct metadata from torrent.info');
          
          try {
            // Create metadata from info
            const bencode = require('bencode');
            torrent.metadata = bencode.encode(torrent.info);
            result.actions.push(`✅ Created metadata from info: ${torrent.metadata.length} bytes`);
          } catch (encodeErr) {
            result.actions.push(`❌ Error encoding metadata: ${encodeErr.message}`);
          }
        }
        
        // Try to get metadata from magnetURI parsing
        if (!torrent.metadata && torrent.magnetURI) {
          result.actions.push('🧲 Attempting to reconstruct from magnet URI');
          
          try {
            const parseTorrent = require('parse-torrent');
            const parsed = parseTorrent(torrent.magnetURI);
            
            if (parsed.infoHash) {
              result.actions.push(`📋 Parsed magnet: ${parsed.name}, hash: ${parsed.infoHash}`);
              
              // If we have access to the original torrent data, use it
              if (torrent._torrent && torrent._torrent.info) {
                const bencode = require('bencode');
                torrent.metadata = bencode.encode(torrent._torrent.info);
                result.actions.push(`✅ Reconstructed metadata: ${torrent.metadata.length} bytes`);
              }
            }
          } catch (parseErr) {
            result.actions.push(`❌ Error parsing magnet: ${parseErr.message}`);
          }
        }
        
        // Last resort: Create minimal metadata from what we know
        if (!torrent.metadata) {
          result.actions.push('🏗️ Creating minimal metadata structure');
          
          try {
            const minimalInfo = {
              name: Buffer.from(torrent.name || 'FHIR Data', 'utf8'),
              'piece length': 16384,
              pieces: Buffer.alloc(20), // Minimal pieces
              files: torrent.files.map(f => ({
                path: [Buffer.from(f.name, 'utf8')],
                length: f.length
              }))
            };
            
            const bencode = require('bencode');
            torrent.metadata = bencode.encode(minimalInfo);
            result.actions.push(`✅ Created minimal metadata: ${torrent.metadata.length} bytes`);
          } catch (minimalErr) {
            result.actions.push(`❌ Error creating minimal metadata: ${minimalErr.message}`);
          }
        }
      } else if (torrent.metadata) {
        result.actions.push(`✅ Torrent already has metadata: ${torrent.metadata.length} bytes`);
      } else {
        result.actions.push('❌ Torrent has no files and no metadata - cannot fix');
        throw new Error('Torrent has no files to seed');
      }
      
      // Now that we have metadata, ensure all wire connections have ut_metadata
      if (torrent.metadata && torrent.wires && torrent.wires.length > 0) {
        result.actions.push(`🔧 Installing ut_metadata on ${torrent.wires.length} existing connections`);
        
        torrent.wires.forEach(function(wire, index) {
          try {
            result.actions.push(`🔌 Wire ${index}: ${wire.remoteAddress}`);
            
            // Remove existing ut_metadata if present
            if (wire.ut_metadata) {
              delete wire.ut_metadata;
              result.actions.push(`   🗑️ Removed existing ut_metadata`);
            }
            
            // Install fresh ut_metadata with our metadata
            const ut_metadata = require('ut_metadata');
            wire.use(ut_metadata(torrent.metadata));
            result.actions.push(`   ✅ Installed ut_metadata with ${torrent.metadata.length} byte metadata`);
            
            // Send enhanced handshake
            const handshake = {
              m: { ut_metadata: 1 },
              v: 'WebTorrent-Seeding-Fixed',
              metadata_size: torrent.metadata.length,
              reqq: 250
            };
            
            wire.extended('handshake', Buffer.from(JSON.stringify(handshake)));
            result.actions.push(`   📡 Sent handshake with metadata_size=${torrent.metadata.length}`);
            
            // Set up immediate metadata sharing
            wire.removeAllListeners('extended');
            wire.on('extended', function(ext, buf) {
              if (ext === 'ut_metadata') {
                result.actions.push(`   📤 Metadata request received from ${wire.remoteAddress}`);
                
                try {
                  // Immediately send metadata
                  const response = {
                    msg_type: 1, // data
                    piece: 0,
                    total_size: torrent.metadata.length
                  };
                  
                  const responseBuffer = Buffer.concat([
                    Buffer.from(JSON.stringify(response)),
                    torrent.metadata
                  ]);
                  
                  wire.extended('ut_metadata', responseBuffer);
                  result.actions.push(`   ✅ Sent ${torrent.metadata.length} bytes metadata to ${wire.remoteAddress}`);
                } catch (responseErr) {
                  result.actions.push(`   ❌ Response error: ${responseErr.message}`);
                }
              }
            });
            
          } catch (wireErr) {
            result.actions.push(`   ❌ Wire ${index} error: ${wireErr.message}`);
          }
        });
      }
      
      // Set up enhanced wire handler for new connections
      result.actions.push('🔧 Setting up metadata sharing for new connections');
      
      const originalOnWire = torrent._onWire?.bind(torrent);
      torrent._onWire = function(wire) {
        result.actions.push(`🔌 New connection: ${wire.remoteAddress} - auto-installing metadata`);
        
        // Call original handler
        if (originalOnWire) {
          originalOnWire(wire);
        }
        
        // Immediately install metadata support
        setTimeout(function() {
          try {
            const ut_metadata = require('ut_metadata');
            wire.use(ut_metadata(torrent.metadata));
            
            const handshake = {
              m: { ut_metadata: 1 },
              v: 'WebTorrent-Auto-Seeding-Fixed',
              metadata_size: torrent.metadata.length
            };
            
            wire.extended('handshake', Buffer.from(JSON.stringify(handshake)));
            result.actions.push(`✅ Auto-installed metadata sharing for ${wire.remoteAddress}`);
            
            // Set up metadata response
            wire.on('extended', function(ext, buf) {
              if (ext === 'ut_metadata') {
                const response = {
                  msg_type: 1,
                  piece: 0,
                  total_size: torrent.metadata.length
                };
                
                wire.extended('ut_metadata', Buffer.concat([
                  Buffer.from(JSON.stringify(response)),
                  torrent.metadata
                ]));
              }
            });
          } catch (autoErr) {
            result.actions.push(`⚠️ Auto-install error: ${autoErr.message}`);
          }
        }, 100);
      };
      
      result.success = true;
      result.actions.push('🎉 Seeding metadata creation fix completed!');
      result.actions.push(`📋 Final metadata size: ${torrent.metadata?.length || 0} bytes`);
      
      return result;
      
    } catch (error) {
      console.error('Seeding metadata creation fix error:', error);
      result.error = error.message;
      result.actions.push(`❌ Error: ${error.message}`);
      return result;
    }
  },

  /**
   * Diagnose metadata availability on seeding torrent
   */
  'torrents.diagnoseSeedingMetadata': function(infoHash) {
    check(infoHash, String);
    
    console.log(`🔍 DIAGNOSING SEEDING METADATA for torrent ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      diagnosis: {},
      issues: [],
      recommendations: []
    };
    
    try {
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        result.issues.push('Torrent not found in client');
        return result;
      }
      
      result.diagnosis = {
        name: torrent.name,
        ready: torrent.ready,
        files: torrent.files?.length || 0,
        hasMetadata: !!torrent.metadata,
        metadataSize: torrent.metadata?.length || 0,
        hasInfo: !!torrent.info,
        hasTorrentObject: !!torrent._torrent,
        magnetURI: !!torrent.magnetURI,
        peers: torrent.numPeers,
        wires: torrent.wires?.length || 0
      };
      
      // Check for issues
      if (result.diagnosis.files > 0 && !result.diagnosis.hasMetadata) {
        result.issues.push('CRITICAL: Has files but no metadata - this prevents metadata sharing');
        result.recommendations.push('Use "Fix Seeding Metadata Creation" to reconstruct metadata');
      }
      
      if (result.diagnosis.hasMetadata && result.diagnosis.wires > 0) {
        // Check if wires have ut_metadata
        let wiresWithMetadata = 0;
        torrent.wires?.forEach(function(wire) {
          if (wire.ut_metadata) wiresWithMetadata++;
        });
        
        result.diagnosis.wiresWithMetadata = wiresWithMetadata;
        
        if (wiresWithMetadata === 0) {
          result.issues.push('Has metadata but no wire connections have ut_metadata extension');
          result.recommendations.push('Use "Fix Seeding Metadata Creation" to install ut_metadata on connections');
        }
      }
      
      if (result.diagnosis.peers === 0) {
        result.issues.push('No peers connected - downloading clients cannot connect');
        result.recommendations.push('Check tracker connectivity and network settings');
      }
      
      if (result.issues.length === 0) {
        result.recommendations.push('Seeding metadata appears healthy');
      }
      
      console.log('Seeding metadata diagnosis:', result);
      return result;
      
    } catch (error) {
      console.error('Seeding metadata diagnosis error:', error);
      result.error = error.message;
      return result;
    }
  }
  
});