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
  }
  
});