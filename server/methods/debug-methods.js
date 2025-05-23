// server/methods/debug-methods.js - Enhanced debugging for metadata issues

import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { WebTorrentServer } from '../webtorrent-server';
import { TorrentsCollection } from '/imports/api/torrents/torrents';

Meteor.methods({
  /**
   * Enhanced torrent metadata diagnosis
   * @param {String} infoHash - Info hash of the torrent to diagnose
   * @return {Object} Comprehensive diagnosis information
   */
  'debug.diagnoseTorrentMetadata': async function(infoHash) {
    check(infoHash, String);
    
    console.log(`🔍 Starting comprehensive metadata diagnosis for torrent ${infoHash}`);
    
    const diagnosis = {
      timestamp: new Date(),
      infoHash: infoHash,
      database: {},
      client: {},
      webTorrentClient: {},
      network: {},
      recommendations: []
    };
    
    try {
      // Database analysis
      const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
      diagnosis.database = {
        exists: !!torrentRecord,
        data: torrentRecord ? {
          name: torrentRecord.name,
          magnetURI: torrentRecord.magnetURI ? torrentRecord.magnetURI.substring(0, 100) + '...' : null,
          filesCount: torrentRecord.files ? torrentRecord.files.length : 0,
          status: torrentRecord.status,
          created: torrentRecord.created
        } : null
      };
      
      // WebTorrent Server analysis
      const torrent = WebTorrentServer.getTorrent(infoHash);
      diagnosis.client = {
        exists: !!torrent,
        data: torrent ? {
          name: torrent.name,
          ready: torrent.ready,
          filesCount: torrent.files ? torrent.files.length : 0,
          progress: torrent.progress,
          downloaded: torrent.downloaded,
          uploaded: torrent.uploaded,
          numPeers: torrent.numPeers,
          paused: torrent.paused,
          done: torrent.done,
          length: torrent.length,
          magnetURI: torrent.magnetURI ? torrent.magnetURI.substring(0, 100) + '...' : null,
          files: torrent.files ? torrent.files.map(f => ({
            name: f.name,
            length: f.length,
            path: f.path,
            downloaded: f.downloaded || 0
          })) : []
        } : null
      };
      
      // Raw WebTorrent client analysis
      const webTorrentClient = WebTorrentServer.getClient();
      if (webTorrentClient) {
        const clientTorrent = webTorrentClient.get(infoHash);
        diagnosis.webTorrentClient = {
          clientExists: !!webTorrentClient,
          torrentInClient: !!clientTorrent,
          clientTorrentsCount: webTorrentClient.torrents ? webTorrentClient.torrents.length : 0,
          data: clientTorrent ? {
            infoHash: clientTorrent.infoHash,
            name: clientTorrent.name,
            ready: clientTorrent.ready,
            files: clientTorrent.files ? clientTorrent.files.length : 0,
            wires: clientTorrent.wires ? clientTorrent.wires.length : 0,
            peers: clientTorrent.numPeers || 0
          } : null
        };
      }
      
      // Network analysis
      if (torrent) {
        diagnosis.network = {
          peers: torrent.numPeers || 0,
          wires: torrent.wires ? torrent.wires.length : 0,
          downloadSpeed: torrent.downloadSpeed || 0,
          uploadSpeed: torrent.uploadSpeed || 0,
          trackers: torrent._trackers ? torrent._trackers.length : 0,
          discovery: !!torrent.discovery,
          dht: torrent.discovery && torrent.discovery.dht ? 'available' : 'not available'
        };
        
        // Peer details
        if (torrent.wires && torrent.wires.length > 0) {
          diagnosis.network.peerDetails = torrent.wires.map(wire => ({
            remoteAddress: wire.remoteAddress,
            remotePort: wire.remotePort,
            type: wire.type || 'unknown',
            downloadSpeed: wire.downloadSpeed ? wire.downloadSpeed() : 0,
            uploadSpeed: wire.uploadSpeed ? wire.uploadSpeed() : 0
          }));
        }
      }
      
      // Generate recommendations based on analysis
      if (!diagnosis.database.exists) {
        diagnosis.recommendations.push('Torrent not found in database - this may indicate a sync issue');
      }
      
      if (!diagnosis.client.exists) {
        diagnosis.recommendations.push('Torrent not found in WebTorrent server - try reloading torrent');
      } else {
        const clientData = diagnosis.client.data;
        
        if (!clientData.ready) {
          diagnosis.recommendations.push('Torrent not ready - waiting for metadata from peers');
        }
        
        if (clientData.filesCount === 0) {
          diagnosis.recommendations.push('No files detected - metadata not received yet');
          if (clientData.numPeers === 0) {
            diagnosis.recommendations.push('No peers connected - torrent cannot receive metadata without peers');
          } else {
            diagnosis.recommendations.push(`${clientData.numPeers} peers connected but metadata not received - may need more time or different peers`);
          }
        }
        
        if (clientData.progress === 0 && clientData.filesCount > 0) {
          diagnosis.recommendations.push('Files detected but no download progress - try manually selecting files');
        }
        
        if (clientData.numPeers > 0 && !clientData.ready) {
          diagnosis.recommendations.push('Peers connected but torrent not ready - force announce may help');
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
   * Force metadata request for a torrent
   * @param {String} infoHash - Info hash of the torrent
   * @return {Object} Result of the metadata request
   */
  'debug.forceMetadataRequest': async function(infoHash) {
    check(infoHash, String);
    
    console.log(`🔧 Forcing metadata request for torrent ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      actions: [],
      success: false
    };
    
    try {
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        // Try to reload torrent first
        const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
        if (torrentRecord && torrentRecord.magnetURI) {
          result.actions.push('Reloading torrent from database');
          const reloadedTorrent = await WebTorrentServer.addTorrent(torrentRecord.magnetURI);
          result.actions.push(`Reloaded torrent: ${reloadedTorrent.name}`);
          torrent = reloadedTorrent;
        } else {
          throw new Error('Torrent not found and cannot be reloaded');
        }
      }
      
      // Force announce to all trackers
      result.actions.push('Forcing announce to all trackers');
      try {
        if (typeof torrent.announce === 'function') {
          torrent.announce();
          result.actions.push('✓ Called torrent.announce()');
        }
        
        if (torrent.discovery && typeof torrent.discovery.announce === 'function') {
          torrent.discovery.announce();
          result.actions.push('✓ Called torrent.discovery.announce()');
        }
        
        if (torrent.discovery && torrent.discovery.dht && typeof torrent.discovery.dht.announce === 'function') {
          torrent.discovery.dht.announce(torrent.infoHash);
          result.actions.push('✓ Called DHT announce');
        }
      } catch (announceErr) {
        result.actions.push(`⚠ Announce error: ${announceErr.message}`);
      }
      
      // Try to resume if paused
      if (torrent.paused) {
        result.actions.push('Resuming paused torrent');
        torrent.resume();
        result.actions.push('✓ Torrent resumed');
      }
      
      // Select all files to ensure they're being requested
      if (torrent.files && torrent.files.length > 0) {
        result.actions.push(`Selecting all ${torrent.files.length} files for download`);
        try {
          torrent.files.forEach(function(file) {
            if (typeof file.select === 'function') {
              file.select();
            }
          });
          result.actions.push('✓ All files selected');
        } catch (selectErr) {
          result.actions.push(`⚠ File selection error: ${selectErr.message}`);
        }
      } else {
        result.actions.push('No files available to select - metadata still needed');
      }
      
      // Try to request specific pieces (if available)
      try {
        if (typeof torrent.select === 'function') {
          torrent.select(0, 1, false); // Select first piece with low priority
          result.actions.push('✓ Requested first piece');
        }
      } catch (selectErr) {
        result.actions.push(`⚠ Piece selection error: ${selectErr.message}`);
      }
      
      // Force update torrent record
      result.actions.push('Updating torrent record in database');
      await WebTorrentServer._updateTorrentRecord(torrent);
      result.actions.push('✓ Database record updated');
      
      result.success = true;
      result.torrentStatus = {
        ready: torrent.ready,
        files: torrent.files ? torrent.files.length : 0,
        peers: torrent.numPeers,
        progress: torrent.progress
      };
      
      console.log('🔧 Force metadata request completed:', result);
      return result;
      
    } catch (error) {
      console.error('Error in force metadata request:', error);
      result.error = error.message;
      result.actions.push(`❌ Error: ${error.message}`);
      return result;
    }
  },

  /**
   * Wait for torrent metadata with real-time updates
   * @param {String} infoHash - Info hash of the torrent
   * @param {Number} timeoutMs - Timeout in milliseconds (default 30000)
   * @return {Object} Result of waiting for metadata
   */
  'debug.waitForMetadata': async function(infoHash, timeoutMs = 30000) {
    check(infoHash, String);
    check(timeoutMs, Number);
    
    console.log(`⏱ Waiting for metadata for torrent ${infoHash} (timeout: ${timeoutMs}ms)`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      timeout: timeoutMs,
      success: false,
      checkpoints: [],
      finalStatus: {}
    };
    
    try {
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        throw new Error('Torrent not found in WebTorrent server');
      }
      
      const startTime = Date.now();
      
      // Check if already ready
      if (torrent.ready && torrent.files && torrent.files.length > 0) {
        result.success = true;
        result.checkpoints.push(`Already ready at start - files: ${torrent.files.length}`);
        result.finalStatus = {
          ready: true,
          files: torrent.files.length,
          peers: torrent.numPeers,
          progress: torrent.progress
        };
        return result;
      }
      
      // Wait with periodic checks
      return new Promise(function(resolve) {
        const checkInterval = 1000; // Check every second
        let checks = 0;
        
        const checker = Meteor.setInterval(function() {
          checks++;
          const elapsed = Date.now() - startTime;
          
          const checkpoint = {
            check: checks,
            elapsed: elapsed,
            ready: torrent.ready,
            files: torrent.files ? torrent.files.length : 0,
            peers: torrent.numPeers,
            progress: Math.round(torrent.progress * 100),
            downloadSpeed: torrent.downloadSpeed || 0
          };
          
          result.checkpoints.push(checkpoint);
          console.log(`⏱ Metadata check ${checks}: ready=${checkpoint.ready}, files=${checkpoint.files}, peers=${checkpoint.peers}, progress=${checkpoint.progress}%`);
          
          // Success condition
          if (torrent.ready && torrent.files && torrent.files.length > 0) {
            Meteor.clearInterval(checker);
            result.success = true;
            result.finalStatus = checkpoint;
            console.log(`✓ Metadata received after ${elapsed}ms`);
            resolve(result);
            return;
          }
          
          // Timeout condition
          if (elapsed >= timeoutMs) {
            Meteor.clearInterval(checker);
            result.success = false;
            result.finalStatus = checkpoint;
            result.timeoutReached = true;
            console.log(`⏱ Metadata wait timed out after ${elapsed}ms`);
            resolve(result);
            return;
          }
        }, checkInterval);
        
        // Also listen for events
        const onMetadata = function() {
          console.log(`✓ Metadata event fired for ${infoHash}`);
          result.checkpoints.push({ event: 'metadata', elapsed: Date.now() - startTime });
        };
        
        const onReady = function() {
          console.log(`✓ Ready event fired for ${infoHash}`);
          result.checkpoints.push({ event: 'ready', elapsed: Date.now() - startTime });
        };
        
        torrent.once('metadata', onMetadata);
        torrent.once('ready', onReady);
        
        // Cleanup
        Meteor.setTimeout(function() {
          torrent.removeListener('metadata', onMetadata);
          torrent.removeListener('ready', onReady);
        }, timeoutMs + 1000);
      });
      
    } catch (error) {
      console.error('Error waiting for metadata:', error);
      result.error = error.message;
      return result;
    }
  },


/**
   * Comprehensive wire state analysis to debug the "undefined peer" issue
   */
  'debug.analyzeWireStates': function(infoHash) {
    check(infoHash, String);
    
    console.log(`🔬 DEEP WIRE ANALYSIS for torrent ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      torrentState: {},
      wireAnalysis: [],
      clientState: {},
      recommendations: []
    };
    
    try {
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        result.error = 'Torrent not found in WebTorrentServer';
        return result;
      }
      
      // Analyze torrent state
      result.torrentState = {
        name: torrent.name,
        ready: torrent.ready,
        destroyed: torrent.destroyed,
        paused: torrent.paused,
        numPeers: torrent.numPeers,
        wiresLength: torrent.wires ? torrent.wires.length : 0,
        wiresExists: !!torrent.wires,
        metadata: !!torrent.metadata,
        metadataSize: torrent.metadata ? torrent.metadata.length : 0,
        infoHash: torrent.infoHash
      };
      
      // Deep wire analysis
      if (torrent.wires && Array.isArray(torrent.wires)) {
        result.wireAnalysis = torrent.wires.map(function(wire, index) {
          const analysis = {
            index: index,
            exists: !!wire,
            type: typeof wire,
            constructorName: wire ? wire.constructor.name : null
          };
          
          if (wire) {
            // Basic wire properties
            analysis.basic = {
              remoteAddress: wire.remoteAddress,
              remotePort: wire.remotePort,
              destroyed: wire.destroyed,
              readable: wire.readable,
              writable: wire.writable,
              connected: wire._connected,
              type: wire.type
            };
            
            // Check for undefined/null remoteAddress specifically
            analysis.addressIssues = {
              remoteAddressUndefined: wire.remoteAddress === undefined,
              remoteAddressNull: wire.remoteAddress === null,
              remoteAddressEmpty: wire.remoteAddress === '',
              remoteAddressType: typeof wire.remoteAddress,
              hasSocket: !!wire._socket,
              socketRemoteAddress: wire._socket ? wire._socket.remoteAddress : 'no socket',
              socketReadyState: wire._socket ? wire._socket.readyState : 'no socket'
            };
            
            // Protocol state
            analysis.protocol = {
              handshakeComplete: wire._handshakeComplete,
              extended: !!wire.extended,
              peerExtended: !!wire.peerExtended,
              peerExtensions: wire.peerExtensions ? Object.keys(wire.peerExtensions) : [],
              amInterested: wire.amInterested,
              amChoking: wire.amChoking,
              peerInterested: wire.peerInterested,
              peerChoking: wire.peerChoking
            };
            
            // Extension analysis
            analysis.extensions = {
              hasUtMetadata: !!wire.ut_metadata,
              utMetadataType: typeof wire.ut_metadata,
              utMetadataId: wire.ut_metadata ? wire.ut_metadata.id : null,
              extensionCount: wire._extensions ? Object.keys(wire._extensions).length : 0,
              extensionNames: wire._extensions ? Object.keys(wire._extensions) : []
            };
            
            // Error states
            analysis.errors = {
              hasError: !!wire._error,
              errorMessage: wire._error ? wire._error.message : null,
              lastError: wire._lastError ? wire._lastError.message : null
            };
            
            // Connection timing
            analysis.timing = {
              created: wire._created || null,
              connected: wire._connectedAt || null,
              handshaked: wire._handshakedAt || null,
              age: wire._created ? Date.now() - wire._created : null
            };
            
          } else {
            // Wire is null/undefined
            analysis.nullWireDetails = {
              arrayElement: `Array element ${index} is ${wire}`,
              typeofResult: typeof wire,
              stringValue: String(wire)
            };
          }
          
          return analysis;
        });
      } else {
        result.wireAnalysis = [{
          error: 'torrent.wires is not an array',
          wiresType: typeof torrent.wires,
          wiresValue: torrent.wires
        }];
      }
      
      // Client state analysis
      const client = WebTorrentServer.getClient();
      if (client) {
        result.clientState = {
          destroyed: client.destroyed,
          torrentsCount: client.torrents ? client.torrents.length : 0,
          maxConns: client.maxConns,
          nodeId: client.nodeId ? client.nodeId.toString('hex') : null,
          listening: client.listening,
          tcpPort: client.tcpPort,
          udpPort: client.udpPort
        };
        
        // Check if this torrent exists in client's torrents array
        const clientTorrent = client.get(infoHash);
        result.clientState.hasTorrent = !!clientTorrent;
        result.clientState.torrentMatch = clientTorrent === torrent;
      }
      
      // Generate specific recommendations
      const undefinedWires = result.wireAnalysis.filter(w => !w.exists || w.addressIssues?.remoteAddressUndefined);
      const incompleteHandshakes = result.wireAnalysis.filter(w => w.exists && !w.protocol?.handshakeComplete);
      const missingExtensions = result.wireAnalysis.filter(w => w.exists && !w.extensions?.hasUtMetadata);
      
      if (undefinedWires.length > 0) {
        result.recommendations.push(`🚨 CRITICAL: ${undefinedWires.length} wire(s) have undefined remoteAddress - this is the source of your error`);
        result.recommendations.push('This indicates wires are being created but not fully initialized before diagnosis runs');
      }
      
      if (incompleteHandshakes.length > 0) {
        result.recommendations.push(`⚠️ ${incompleteHandshakes.length} wire(s) have incomplete handshakes`);
        result.recommendations.push('Add wire state checking before attempting metadata operations');
      }
      
      if (missingExtensions.length > 0) {
        result.recommendations.push(`🔧 ${missingExtensions.length} wire(s) missing ut_metadata extension`);
        result.recommendations.push('Extension installation needs to wait for handshake completion');
      }
      
      // Check for common patterns
      const hasNullWires = result.wireAnalysis.some(w => w.nullWireDetails);
      if (hasNullWires) {
        result.recommendations.push('🚨 FOUND NULL WIRES: Array contains null/undefined elements - memory corruption or cleanup issue');
      }
      
      const hasSocketIssues = result.wireAnalysis.some(w => w.addressIssues?.hasSocket === false);
      if (hasSocketIssues) {
        result.recommendations.push('🔌 Socket connectivity issues detected - network layer problems');
      }
      
      const hasDestroyedWires = result.wireAnalysis.some(w => w.basic?.destroyed === true);
      if (hasDestroyedWires) {
        result.recommendations.push('💀 Destroyed wires still in array - cleanup issue in WebTorrent');
      }
      
      console.log('🔬 Wire analysis completed:', result);
      return result;
      
    } catch (error) {
      console.error('Error in wire analysis:', error);
      result.error = error.message;
      result.stackTrace = error.stack;
      return result;
    }
  },
  
  /**
   * Test wire state changes over time
   */
  'debug.monitorWireStates': function(infoHash, durationMs = 30000) {
    check(infoHash, String);
    check(durationMs, Number);
    
    console.log(`📊 MONITORING WIRE STATES for ${durationMs}ms`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      snapshots: [],
      changes: [],
      duration: durationMs
    };
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    if (!torrent) {
      result.error = 'Torrent not found';
      return result;
    }
    
    let previousState = null;
    const startTime = Date.now();
    
    // Take snapshots every 2 seconds
    const intervalId = Meteor.setInterval(function() {
      const elapsed = Date.now() - startTime;
      
      if (elapsed >= durationMs) {
        Meteor.clearInterval(intervalId);
        return;
      }
      
      const snapshot = {
        timestamp: new Date(),
        elapsed: elapsed,
        wireCount: torrent.wires ? torrent.wires.length : 0,
        wires: []
      };
      
      if (torrent.wires) {
        snapshot.wires = torrent.wires.map(function(wire, index) {
          return {
            index: index,
            exists: !!wire,
            remoteAddress: wire ? wire.remoteAddress : undefined,
            destroyed: wire ? wire.destroyed : undefined,
            handshakeComplete: wire ? wire._handshakeComplete : undefined,
            hasUtMetadata: wire ? !!wire.ut_metadata : false
          };
        });
      }
      
      result.snapshots.push(snapshot);
      
      // Detect changes
      if (previousState) {
        const changes = [];
        
        if (snapshot.wireCount !== previousState.wireCount) {
          changes.push(`Wire count changed: ${previousState.wireCount} → ${snapshot.wireCount}`);
        }
        
        // Check for new undefined addresses
        const newUndefined = snapshot.wires.filter(w => w.remoteAddress === undefined).length;
        const oldUndefined = previousState.wires.filter(w => w.remoteAddress === undefined).length;
        
        if (newUndefined !== oldUndefined) {
          changes.push(`Undefined addresses changed: ${oldUndefined} → ${newUndefined}`);
        }
        
        if (changes.length > 0) {
          result.changes.push({
            timestamp: new Date(),
            elapsed: elapsed,
            changes: changes
          });
        }
      }
      
      previousState = snapshot;
      
    }, 2000);
    
    // Return immediately, monitoring continues in background
    return {
      ...result,
      status: 'monitoring started',
      message: `Monitoring ${infoHash} for ${durationMs}ms, check logs for real-time updates`
    };
  },
  
  /**
   * Safe wire operation wrapper that checks wire state first
   */
  'debug.safeWireOperation': function(infoHash, operation) {
    check(infoHash, String);
    check(operation, String);
    
    console.log(`🛡️ SAFE WIRE OPERATION: ${operation} for ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      operation: operation,
      results: [],
      errors: []
    };
    
    try {
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        throw new Error('Torrent not found');
      }
      
      if (!torrent.wires || !Array.isArray(torrent.wires)) {
        throw new Error('No wires array available');
      }
      
      torrent.wires.forEach(function(wire, index) {
        const wireResult = {
          index: index,
          operation: operation,
          success: false,
          message: '',
          preChecks: {}
        };
        
        try {
          // Pre-operation safety checks
          wireResult.preChecks = {
            wireExists: !!wire,
            hasRemoteAddress: wire ? !!wire.remoteAddress : false,
            notDestroyed: wire ? !wire.destroyed : false,
            handshakeComplete: wire ? !!wire._handshakeComplete : false,
            hasExtended: wire ? !!wire.extended : false,
            hasSocket: wire ? !!wire._socket : false
          };
          
          // Only proceed if all critical checks pass
          const criticalChecks = ['wireExists', 'hasRemoteAddress', 'notDestroyed'];
          const criticalPass = criticalChecks.every(check => wireResult.preChecks[check]);
          
          if (!criticalPass) {
            wireResult.message = `Critical pre-checks failed: ${JSON.stringify(wireResult.preChecks)}`;
            result.errors.push(`Wire ${index}: ${wireResult.message}`);
            result.results.push(wireResult);
            return;
          }
          
          // Perform the requested operation safely
          switch (operation) {
            case 'diagnose':
              wireResult.diagnosis = {
                address: `${wire.remoteAddress}:${wire.remotePort}`,
                extensions: wire.peerExtensions ? Object.keys(wire.peerExtensions) : [],
                supportsMetadata: !!(wire.peerExtensions && wire.peerExtensions.ut_metadata),
                hasUtMetadata: !!wire.ut_metadata,
                interested: wire.amInterested,
                choking: wire.amChoking
              };
              wireResult.success = true;
              wireResult.message = 'Diagnosis completed safely';
              break;
              
            case 'install-metadata':
              if (wireResult.preChecks.handshakeComplete && wireResult.preChecks.hasExtended) {
                const ut_metadata = require('ut_metadata');
                wire.use(ut_metadata());
                wireResult.success = true;
                wireResult.message = 'ut_metadata installed safely';
              } else {
                wireResult.message = 'Handshake/extended protocol not ready for metadata installation';
              }
              break;
              
            case 'request-metadata':
              if (wire.ut_metadata && typeof wire.ut_metadata.fetch === 'function') {
                wire.ut_metadata.fetch();
                wireResult.success = true;
                wireResult.message = 'Metadata requested safely';
              } else {
                wireResult.message = 'ut_metadata extension not available for request';
              }
              break;
              
            default:
              wireResult.message = `Unknown operation: ${operation}`;
          }
          
        } catch (wireError) {
          wireResult.message = `Wire operation error: ${wireError.message}`;
          result.errors.push(`Wire ${index}: ${wireError.message}`);
        }
        
        result.results.push(wireResult);
      });
      
      // Summary
      const successful = result.results.filter(r => r.success).length;
      const total = result.results.length;
      
      result.summary = {
        total: total,
        successful: successful,
        failed: total - successful,
        successRate: total > 0 ? Math.round((successful / total) * 100) : 0
      };
      
      console.log(`🛡️ Safe operation completed: ${successful}/${total} successful`);
      return result;
      
    } catch (error) {
      console.error('Error in safe wire operation:', error);
      result.error = error.message;
      return result;
    }
  }
});