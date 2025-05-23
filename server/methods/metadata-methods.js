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
   * Force aggressive metadata request with enhanced peer communication
   * @param {String} infoHash - Info hash of the torrent
   * @return {Object} Result of enhanced metadata request
   */
  'torrents.forceMetadataExchange': async function(infoHash) {
    check(infoHash, String);
    
    console.log(`🔧 Starting enhanced metadata exchange for torrent ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      actions: [],
      success: false,
      strategy: 'enhanced'
    };
    
    try {
      let torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        // Try to reload torrent first
        const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
        if (torrentRecord && torrentRecord.magnetURI) {
          result.actions.push('🔄 Reloading torrent from database');
          torrent = await WebTorrentServer.addTorrent(torrentRecord.magnetURI, {
            timeout: 60000 // Longer timeout for metadata exchange
          });
          result.actions.push(`✅ Reloaded torrent: ${torrent.name}`);
        } else {
          throw new Error('Torrent not found and cannot be reloaded');
        }
      }
      
      result.actions.push(`📊 Initial status: peers=${torrent.numPeers}, files=${torrent.files?.length || 0}, ready=${torrent.ready}`);
      
      // Strategy 1: Enhanced peer communication for metadata
      if (torrent.wires && torrent.wires.length > 0) {
        result.actions.push(`💬 Enhancing communication with ${torrent.wires.length} connected peers`);
        
        for (const wire of torrent.wires) {
          try {
            // Check if peer supports metadata extension
            if (wire.peerExtensions && wire.peerExtensions.ut_metadata) {
              result.actions.push(`📡 Peer ${wire.remoteAddress} supports ut_metadata extension`);
              
              // Send interested signal if not already interested
              if (!wire.amInterested) {
                wire.interested();
                result.actions.push(`📢 Sent interested signal to ${wire.remoteAddress}`);
              }
              
              // Unchoke the peer if we're choking them
              if (wire.amChoking) {
                wire.unchoke();
                result.actions.push(`🔓 Unchoked peer ${wire.remoteAddress}`);
              }
              
              // Explicitly request metadata if the extension is available
              if (wire.ut_metadata && typeof wire.ut_metadata.fetch === 'function') {
                wire.ut_metadata.fetch();
                result.actions.push(`🎯 Explicitly requested metadata from ${wire.remoteAddress}`);
              }
              
            } else {
              result.actions.push(`⚠️ Peer ${wire.remoteAddress} does not support ut_metadata extension`);
            }
          } catch (wireErr) {
            result.actions.push(`❌ Error communicating with peer ${wire.remoteAddress}: ${wireErr.message}`);
          }
        }
      } else {
        result.actions.push('❌ No wire connections available for metadata exchange');
      }
      
      // Strategy 2: Enhanced announce with metadata request flags
      result.actions.push('📢 Performing enhanced announce with metadata request flags');
      try {
        // Force announce to all available trackers
        if (typeof torrent.announce === 'function') {
          torrent.announce();
          result.actions.push('✅ Announced to trackers');
        }
        
        // DHT announce with metadata request
        if (torrent.discovery && torrent.discovery.dht) {
          try {
            torrent.discovery.dht.announce(torrent.infoHash, { metadata: true });
            result.actions.push('✅ DHT announce with metadata flag');
          } catch (dhtErr) {
            // Fallback to regular DHT announce
            torrent.discovery.dht.announce(torrent.infoHash);
            result.actions.push('✅ Regular DHT announce (metadata flag not supported)');
          }
        }
      } catch (announceErr) {
        result.actions.push(`⚠️ Announce error: ${announceErr.message}`);
      }
      
      // Strategy 3: Enable all WebTorrent extensions that might help with metadata
      result.actions.push('🔧 Enabling enhanced WebTorrent extensions');
      try {
        // Make sure the torrent is not paused
        if (torrent.paused) {
          torrent.resume();
          result.actions.push('▶️ Resumed paused torrent');
        }
        
        // Enable all pieces with metadata priority
        if (typeof torrent.select === 'function') {
          // Request the first few pieces which contain metadata
          torrent.select(0, Math.min(32768, torrent.length || 32768), 7); // High priority for first 32KB
          result.actions.push('🎯 Selected initial pieces with high priority for metadata');
        }
        
        // Set up enhanced event listeners for metadata
        const metadataListener = function() {
          result.actions.push('🎉 Metadata event fired!');
          result.success = true;
        };
        
        const readyListener = function() {
          result.actions.push('✅ Torrent ready event fired!');
          result.success = true;
        };
        
        torrent.once('metadata', metadataListener);
        torrent.once('ready', readyListener);
        
        // Clean up listeners after a timeout
        Meteor.setTimeout(function() {
          torrent.removeListener('metadata', metadataListener);
          torrent.removeListener('ready', readyListener);
        }, 120000); // 2 minutes
        
      } catch (enhanceErr) {
        result.actions.push(`⚠️ Enhancement error: ${enhanceErr.message}`);
      }
      
      // Strategy 4: Wait with periodic status checks
      result.actions.push('⏳ Starting enhanced metadata wait with status monitoring');
      
      const maxWaitTime = 90000; // 90 seconds
      const startTime = Date.now();
      const checkInterval = 2000; // Check every 2 seconds
      
      return new Promise(function(resolve) {
        const checker = Meteor.setInterval(function() {
          const elapsed = Date.now() - startTime;
          const currentStatus = {
            ready: torrent.ready,
            files: torrent.files ? torrent.files.length : 0,
            peers: torrent.numPeers,
            progress: Math.round(torrent.progress * 100),
            wires: torrent.wires ? torrent.wires.length : 0
          };
          
          result.actions.push(`📊 Status check (${elapsed}ms): ready=${currentStatus.ready}, files=${currentStatus.files}, peers=${currentStatus.peers}, wires=${currentStatus.wires}`);
          
          // Success condition
          if (torrent.ready && torrent.files && torrent.files.length > 0) {
            Meteor.clearInterval(checker);
            result.success = true;
            result.finalStatus = currentStatus;
            result.actions.push(`🎉 SUCCESS: Metadata received after ${elapsed}ms!`);
            
            // Update database record immediately
            WebTorrentServer._updateTorrentRecord(torrent);
            result.actions.push('💾 Updated database record with new metadata');
            
            resolve(result);
            return;
          }
          
          // Re-trigger metadata requests periodically
          if (elapsed % 15000 < checkInterval && torrent.wires && torrent.wires.length > 0) {
            let metadataRequested = false;
            torrent.wires.forEach(function(wire) {
              if (wire.ut_metadata && typeof wire.ut_metadata.fetch === 'function') {
                try {
                  wire.ut_metadata.fetch();
                  metadataRequested = true;
                } catch (e) {
                  // Ignore individual wire errors
                }
              }
            });
            
            if (metadataRequested) {
              result.actions.push('🔄 Re-requested metadata from available peers');
            }
          }
          
          // Timeout condition
          if (elapsed >= maxWaitTime) {
            Meteor.clearInterval(checker);
            result.success = false;
            result.finalStatus = currentStatus;
            result.timeoutReached = true;
            result.actions.push(`⏰ Timeout reached after ${elapsed}ms`);
            
            // If we have peers but no metadata, this might be a protocol issue
            if (currentStatus.peers > 0 && currentStatus.files === 0) {
              result.actions.push('⚠️ Peers connected but no metadata received - possible protocol compatibility issue');
              result.actions.push('💡 Suggestion: The seeding peer may not be properly sharing metadata');
            }
            
            resolve(result);
          }
        }, checkInterval);
      });
      
    } catch (error) {
      console.error('Error in enhanced metadata exchange:', error);
      result.error = error.message;
      result.actions.push(`❌ Fatal error: ${error.message}`);
      return result;
    }
  },

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
          const peerInfo = {
            index: index,
            address: wire.remoteAddress,
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
   * Focused metadata exchange fix that addresses the specific ut_metadata issue
   * without causing bencode/DHT errors
   */
  'torrents.focusedMetadataFix': async function(infoHash) {
    check(infoHash, String);
    
    console.log(`🎯 FOCUSED METADATA FIX for torrent ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      actions: [],
      success: false,
      strategy: 'focused-fix'
    };
    
    try {
      let torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
        if (!torrentRecord?.magnetURI) {
          throw new Error('Torrent not found');
        }
        
        result.actions.push('🔄 Reloading torrent for focused metadata fix');
        torrent = await WebTorrentServer.addTorrent(torrentRecord.magnetURI);
      }
      
      result.actions.push(`📊 Initial: files=${torrent.files?.length || 0}, peers=${torrent.numPeers}, ready=${torrent.ready}`);
      
      // Step 1: Fix existing wire connections with ut_metadata
      if (torrent.wires && torrent.wires.length > 0) {
        result.actions.push(`🔧 Fixing ${torrent.wires.length} existing wire connections`);
        
        for (let i = 0; i < torrent.wires.length; i++) {
          const wire = torrent.wires[i];
          
          try {
            result.actions.push(`🔌 Processing wire ${i}: ${wire.remoteAddress}:${wire.remotePort}`);
            
            // Check current extension status
            const hasExtended = !!wire.extended;
            const hasUtMetadata = !!wire.ut_metadata;
            const peerSupportsMetadata = wire.peerExtensions && wire.peerExtensions.ut_metadata;
            
            result.actions.push(`   Extended: ${hasExtended}, ut_metadata: ${hasUtMetadata}, peer supports: ${peerSupportsMetadata}`);
            
            // If peer supports extended but we don't have ut_metadata, install it
            if (hasExtended && !hasUtMetadata) {
              result.actions.push(`   Installing ut_metadata extension`);
              
              try {
                const ut_metadata = require('ut_metadata');
                
                if (torrent.metadata) {
                  // We have metadata (seeding mode)
                  wire.use(ut_metadata(torrent.metadata));
                  result.actions.push(`   ✅ Installed ut_metadata with metadata for seeding`);
                } else {
                  // We need metadata (downloading mode)
                  wire.use(ut_metadata());
                  result.actions.push(`   ✅ Installed ut_metadata for downloading`);
                }
              } catch (installErr) {
                result.actions.push(`   ❌ Error installing ut_metadata: ${installErr.message}`);
                continue;
              }
            }
            
            // Force extended handshake if we have the extension now
            if (wire.ut_metadata) {
              result.actions.push(`   Sending enhanced extended handshake`);
              
              try {
                const handshakeMsg = {
                  m: {
                    ut_metadata: 1
                  },
                  v: 'WebTorrent-Enhanced-Fix',
                  reqq: 250
                };
                
                // Add metadata_size if we're seeding
                if (torrent.metadata) {
                  handshakeMsg.metadata_size = torrent.metadata.length;
                }
                
                wire.extended('handshake', Buffer.from(JSON.stringify(handshakeMsg)));
                result.actions.push(`   ✅ Sent enhanced handshake`);
              } catch (handshakeErr) {
                result.actions.push(`   ⚠️ Handshake error: ${handshakeErr.message}`);
              }
            }
            
            // For downloading, request metadata aggressively
            if (!torrent.ready && wire.ut_metadata) {
              result.actions.push(`   Requesting metadata aggressively`);
              
              try {
                // Multiple fetch attempts
                for (let attempt = 0; attempt < 3; attempt++) {
                  if (wire.ut_metadata.fetch && typeof wire.ut_metadata.fetch === 'function') {
                    wire.ut_metadata.fetch();
                  }
                }
                result.actions.push(`   ✅ Sent multiple metadata requests`);
              } catch (fetchErr) {
                result.actions.push(`   ⚠️ Fetch error: ${fetchErr.message}`);
              }
            }
            
            // Ensure proper peer state
            if (!wire.amInterested) {
              wire.interested();
              result.actions.push(`   📢 Sent interested signal`);
            }
            
            if (wire.amChoking) {
              wire.unchoke();
              result.actions.push(`   🔓 Unchoked peer`);
            }
            
          } catch (wireErr) {
            result.actions.push(`❌ Error processing wire ${i}: ${wireErr.message}`);
          }
        }
      } else {
        result.actions.push('⚠️ No wire connections available to fix');
      }
      
      // Step 2: Set up enhanced wire handler for new connections
      result.actions.push('🔧 Setting up enhanced handler for new connections');
      
      // Store original handler
      const originalOnWire = torrent._onWire.bind(torrent);
      
      torrent._onWire = function(wire) {
        result.actions.push(`🔌 New connection: ${wire.remoteAddress}`);
        
        // Call original handler first
        originalOnWire(wire);
        
        // Apply our enhancements after a short delay
        setTimeout(function() {
          try {
            if (!wire.ut_metadata && wire.extended) {
              const ut_metadata = require('ut_metadata');
              
              if (torrent.metadata) {
                wire.use(ut_metadata(torrent.metadata));
              } else {
                wire.use(ut_metadata());
              }
              
              result.actions.push(`✅ Auto-installed ut_metadata on new connection ${wire.remoteAddress}`);
              
              // Send enhanced handshake
              const handshakeMsg = {
                m: { ut_metadata: 1 },
                v: 'WebTorrent-Enhanced-Auto'
              };
              
              if (torrent.metadata) {
                handshakeMsg.metadata_size = torrent.metadata.length;
              }
              
              wire.extended('handshake', Buffer.from(JSON.stringify(handshakeMsg)));
            }
          } catch (err) {
            result.actions.push(`⚠️ Error auto-enhancing new connection: ${err.message}`);
          }
        }, 1000);
      };
      
      // Step 3: Simple, safe announce (no custom DHT options)
      result.actions.push('📢 Performing safe announce');
      
      try {
        if (typeof torrent.announce === 'function') {
          torrent.announce();
          result.actions.push('✅ Announced to trackers');
        }
        
        // Simple DHT announce without custom options (to avoid bencode issues)
        if (torrent.discovery?.dht && typeof torrent.discovery.dht.announce === 'function') {
          torrent.discovery.dht.announce(torrent.infoHash);
          result.actions.push('✅ Simple DHT announce (no custom options)');
        }
      } catch (announceErr) {
        result.actions.push(`⚠️ Announce error: ${announceErr.message}`);
      }
      
      // Step 4: Wait for results with focused monitoring
      result.actions.push('⏳ Monitoring for metadata exchange success (60 seconds)');
      
      const maxWaitTime = 60000; // 60 seconds
      const startTime = Date.now();
      
      return new Promise(function(resolve) {
        const checker = Meteor.setInterval(function() {
          const elapsed = Date.now() - startTime;
          const status = {
            ready: torrent.ready,
            files: torrent.files?.length || 0,
            peers: torrent.numPeers,
            wires: torrent.wires?.length || 0,
            progress: Math.round(torrent.progress * 100)
          };
          
          // Log every 10 seconds
          if (elapsed % 10000 < 2000) {
            result.actions.push(`📊 ${elapsed}ms: ready=${status.ready}, files=${status.files}, peers=${status.peers}`);
          }
          
          // Success condition
          if (torrent.ready && torrent.files && torrent.files.length > 0) {
            Meteor.clearInterval(checker);
            result.success = true;
            result.finalStatus = status;
            result.actions.push(`🎉 SUCCESS: Metadata received after ${elapsed}ms!`);
            
            // Update database
            WebTorrentServer._updateTorrentRecord(torrent);
            
            resolve(result);
            return;
          }
          
          // Timeout condition
          if (elapsed >= maxWaitTime) {
            Meteor.clearInterval(checker);
            result.success = false;
            result.finalStatus = status;
            result.actions.push(`⏰ Timeout after ${elapsed}ms`);
            
            if (status.peers > 0 && status.files === 0) {
              result.actions.push('⚠️ Have peers but no metadata - may need seeding peer to apply fix');
            }
            
            resolve(result);
          }
        }, 2000);
        
        // Also listen for success events
        const onMetadata = function() {
          result.actions.push('🎉 Metadata event fired!');
        };
        
        const onReady = function() {
          result.actions.push('🎉 Ready event fired!');
        };
        
        torrent.once('metadata', onMetadata);
        torrent.once('ready', onReady);
        
        // Clean up listeners
        setTimeout(function() {
          torrent.removeListener('metadata', onMetadata);
          torrent.removeListener('ready', onReady);
        }, maxWaitTime + 1000);
      });
      
    } catch (error) {
      console.error('Focused metadata fix error:', error);
      result.error = error.message;
      result.actions.push(`❌ Error: ${error.message}`);
      return result;
    }
  },

  /**
   * Simple seeding metadata fix without complex DHT operations
   */
  'torrents.simpleSeedingFix': function(infoHash) {
    check(infoHash, String);
    
    console.log(`🌱 SIMPLE SEEDING FIX for torrent ${infoHash}`);
    
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
      
      result.actions.push(`🌱 Applying simple seeding fix for: ${torrent.name}`);
      result.actions.push(`📊 Status: files=${torrent.files.length}, peers=${torrent.numPeers}`);
      
      // Fix all existing wires
      if (torrent.wires && torrent.wires.length > 0) {
        torrent.wires.forEach(function(wire, index) {
          result.actions.push(`🔧 Fixing seeding wire ${index}: ${wire.remoteAddress}`);
          
          try {
            // Install fresh ut_metadata extension with metadata
            const ut_metadata = require('ut_metadata');
            
            // Remove any existing extension
            if (wire.ut_metadata) {
              delete wire.ut_metadata;
            }
            
            // Install with metadata
            wire.use(ut_metadata(torrent.metadata));
            result.actions.push(`   ✅ Installed ut_metadata with ${torrent.metadata.length} bytes`);
            
            // Send proper seeding handshake
            const handshakeMsg = {
              m: { ut_metadata: 1 },
              v: 'WebTorrent-Seeding-Fix',
              metadata_size: torrent.metadata.length
            };
            
            wire.extended('handshake', Buffer.from(JSON.stringify(handshakeMsg)));
            result.actions.push(`   ✅ Sent seeding handshake`);
            
            // Set up immediate metadata response
            wire.removeAllListeners('extended'); // Clear existing listeners
            wire.on('extended', function(ext, buf) {
              if (ext === 'ut_metadata') {
                result.actions.push(`   📤 Metadata request from ${wire.remoteAddress} - responding`);
                
                try {
                  // Send the metadata immediately
                  const response = {
                    msg_type: 1, // data
                    piece: 0,
                    total_size: torrent.metadata.length
                  };
                  
                  const responseData = Buffer.concat([
                    Buffer.from(JSON.stringify(response)),
                    torrent.metadata
                  ]);
                  
                  wire.extended('ut_metadata', responseData);
                  result.actions.push(`   ✅ Sent metadata to ${wire.remoteAddress}`);
                } catch (responseErr) {
                  result.actions.push(`   ❌ Response error: ${responseErr.message}`);
                }
              }
            });
            
          } catch (wireErr) {
            result.actions.push(`   ❌ Wire error: ${wireErr.message}`);
          }
        });
      }
      
      // Set up handler for new connections
      const originalOnWire = torrent._onWire.bind(torrent);
      torrent._onWire = function(wire) {
        result.actions.push(`🔌 New seeding connection: ${wire.remoteAddress}`);
        
        originalOnWire(wire);
        
        // Auto-setup metadata sharing
        setTimeout(function() {
          try {
            const ut_metadata = require('ut_metadata');
            wire.use(ut_metadata(torrent.metadata));
            
            const handshakeMsg = {
              m: { ut_metadata: 1 },
              v: 'WebTorrent-Auto-Seeding',
              metadata_size: torrent.metadata.length
            };
            
            wire.extended('handshake', Buffer.from(JSON.stringify(handshakeMsg)));
            result.actions.push(`✅ Auto-setup seeding for ${wire.remoteAddress}`);
          } catch (err) {
            result.actions.push(`⚠️ Auto-setup error: ${err.message}`);
          }
        }, 500);
      };
      
      result.success = true;
      result.actions.push('🎉 Simple seeding fix applied - should now share metadata properly');
      
      return result;
      
    } catch (error) {
      console.error('Simple seeding fix error:', error);
      result.error = error.message;
      result.actions.push(`❌ Error: ${error.message}`);
      return result;
    }
  }
  
});