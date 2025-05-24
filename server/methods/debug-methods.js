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
  },

  /**
   * Deep network connection debugging
   */
  'debug.analyzeNetworkConnections': function(infoHash) {
    check(infoHash, String);
    
    console.log(`🌐 DEEP NETWORK CONNECTION ANALYSIS for ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      networkState: {},
      connectionAttempts: [],
      socketAnalysis: [],
      trackerStatus: {},
      recommendations: []
    };
    
    try {
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        result.error = 'Torrent not found';
        return result;
      }
      
      // Basic network state
      result.networkState = {
        torrentName: torrent.name,
        ready: torrent.ready,
        paused: torrent.paused,
        destroyed: torrent.destroyed,
        listening: !!torrent._listening,
        announced: !!torrent._announced,
        numPeers: torrent.numPeers || 0,
        wireCount: torrent.wires ? torrent.wires.length : 0,
        hasDiscovery: !!torrent.discovery,
        magnetURI: !!torrent.magnetURI
      };
      
      // Analyze wire connections in detail
      if (torrent.wires && torrent.wires.length > 0) {
        torrent.wires.forEach(function(wire, index) {
          const socketAnalysis = {
            wireIndex: index,
            wireExists: !!wire,
            wireType: typeof wire,
            basic: {},
            socket: {},
            timing: {},
            errors: []
          };
          
          if (wire) {
            // Basic wire state
            socketAnalysis.basic = {
              remoteAddress: wire.remoteAddress || 'undefined',
              remotePort: wire.remotePort || 'undefined',
              localAddress: wire.localAddress || 'undefined',
              localPort: wire.localPort || 'undefined',
              destroyed: wire.destroyed,
              readable: wire.readable,
              writable: wire.writable,
              connected: wire._connected || false,
              handshakeComplete: wire._handshakeComplete || false
            };
            
            // Socket-level analysis
            if (wire._socket) {
              socketAnalysis.socket = {
                exists: true,
                readyState: wire._socket.readyState,
                remoteAddress: wire._socket.remoteAddress || 'undefined',
                remotePort: wire._socket.remotePort || 'undefined',
                localAddress: wire._socket.localAddress || 'undefined', 
                localPort: wire._socket.localPort || 'undefined',
                destroyed: wire._socket.destroyed,
                readable: wire._socket.readable,
                writable: wire._socket.writable,
                connecting: wire._socket.connecting,
                pending: wire._socket.pending
              };
            } else {
              socketAnalysis.socket = { exists: false };
            }
            
            // Connection timing
            socketAnalysis.timing = {
              created: wire._created || null,
              connectedAt: wire._connectedAt || null,
              lastActivity: wire._lastActivity || null,
              age: wire._created ? Date.now() - wire._created : null
            };
            
            // Check for specific error conditions
            if (!wire.remoteAddress && !wire._socket) {
              socketAnalysis.errors.push('No socket object - connection never started');
            } else if (!wire.remoteAddress && wire._socket) {
              if (wire._socket.connecting) {
                socketAnalysis.errors.push('Socket still connecting - TCP handshake in progress');
              } else if (wire._socket.destroyed) {
                socketAnalysis.errors.push('Socket destroyed - connection failed');
              } else {
                socketAnalysis.errors.push('Socket exists but remoteAddress not populated - unusual state');
              }
            }
            
            if (wire.destroyed) {
              socketAnalysis.errors.push('Wire marked as destroyed');
            }
            
            if (socketAnalysis.timing.age && socketAnalysis.timing.age > 30000) {
              socketAnalysis.errors.push(`Wire very old (${Math.round(socketAnalysis.timing.age/1000)}s) - connection likely stuck`);
            }
          }
          
          result.socketAnalysis.push(socketAnalysis);
        });
      }
      
      // Tracker status analysis
      if (torrent.discovery) {
        result.trackerStatus = {
          hasTracker: !!torrent.discovery.tracker,
          hasDHT: !!torrent.discovery.dht,
          trackerAnnounced: false,
          dhtAnnounced: false,
          trackerErrors: [],
          dhtErrors: []
        };
        
        // Check tracker status
        if (torrent.discovery.tracker) {
          result.trackerStatus.trackerAnnounced = torrent.discovery.tracker._announcing || false;
          
          // Look for tracker errors
          if (torrent.discovery.tracker._errors) {
            result.trackerStatus.trackerErrors = torrent.discovery.tracker._errors;
          }
        }
        
        // Check DHT status
        if (torrent.discovery.dht) {
          result.trackerStatus.dhtAnnounced = !!torrent.discovery.dht._announcing;
          
          if (torrent.discovery.dht._errors) {
            result.trackerStatus.dhtErrors = torrent.discovery.dht._errors;
          }
        }
      }
      
      // Generate specific recommendations
      const socketsWithIssues = result.socketAnalysis.filter(s => s.errors.length > 0);
      const connectingCount = result.socketAnalysis.filter(s => s.socket.connecting).length;
      const destroyedCount = result.socketAnalysis.filter(s => s.basic.destroyed).length;
      const noSocketCount = result.socketAnalysis.filter(s => !s.socket.exists).length;
      
      if (connectingCount > 0) {
        result.recommendations.push(`${connectingCount} wire(s) still connecting - TCP handshake in progress`);
        result.recommendations.push('Wait longer for TCP connections to complete');
      }
      
      if (destroyedCount > 0) {
        result.recommendations.push(`${destroyedCount} wire(s) destroyed - connections failed`);
        result.recommendations.push('Check network connectivity and firewall settings');
      }
      
      if (noSocketCount > 0) {
        result.recommendations.push(`${noSocketCount} wire(s) have no socket - connections never started`);
        result.recommendations.push('Check if WebTorrent client can create outbound connections');
      }
      
      if (result.trackerStatus.trackerErrors && result.trackerStatus.trackerErrors.length > 0) {
        result.recommendations.push('Tracker connection errors detected - check tracker URLs');
      }
      
      if (result.trackerStatus.dhtErrors && result.trackerStatus.dhtErrors.length > 0) {
        result.recommendations.push('DHT errors detected - check DHT configuration');
      }
      
      if (socketsWithIssues.length === 0) {
        result.recommendations.push('All socket connections appear healthy');
      }
      
      console.log('Network connection analysis completed:', result);
      return result;
      
    } catch (error) {
      console.error('Error in network connection analysis:', error);
      result.error = error.message;
      return result;
    }
  },
  
  /**
   * Monitor connection attempts in real-time
   */
  'debug.monitorConnectionAttempts': function(infoHash, durationMs = 60000) {
    check(infoHash, String);
    check(durationMs, Number);
    
    console.log(`📊 MONITORING CONNECTION ATTEMPTS for ${durationMs}ms`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      monitoring: true,
      duration: durationMs,
      events: []
    };
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    if (!torrent) {
      result.error = 'Torrent not found';
      return result;
    }
    
    const startTime = Date.now();
    let eventCount = 0;
    
    // Enhanced wire monitoring
    const originalOnWire = torrent._onWire;
    
    torrent._onWire = function(wire) {
      eventCount++;
      const wireEvent = {
        event: 'wire_created',
        timestamp: new Date(),
        elapsed: Date.now() - startTime,
        wireIndex: eventCount,
        initialState: {
          hasSocket: !!wire._socket,
          socketState: wire._socket ? wire._socket.readyState : 'no socket',
          remoteAddress: wire.remoteAddress || 'undefined',
          destroyed: wire.destroyed
        }
      };
      
      result.events.push(wireEvent);
      console.log(`📊 Wire created #${eventCount}:`, wireEvent);
      
      // Monitor this specific wire
      const wireMonitor = Meteor.setInterval(function() {
        const currentState = {
          remoteAddress: wire.remoteAddress || 'undefined',
          destroyed: wire.destroyed,
          socketExists: !!wire._socket,
          socketState: wire._socket ? wire._socket.readyState : 'no socket',
          handshakeComplete: wire._handshakeComplete || false
        };
        
        // Check if state changed
        const lastState = wireEvent.initialState;
        const changed = JSON.stringify(currentState) !== JSON.stringify(lastState);
        
        if (changed) {
          const stateEvent = {
            event: 'wire_state_change',
            timestamp: new Date(),
            elapsed: Date.now() - startTime,
            wireIndex: eventCount,
            oldState: lastState,
            newState: currentState
          };
          
          result.events.push(stateEvent);
          console.log(`📊 Wire #${eventCount} state changed:`, stateEvent);
          
          // Update for next comparison
          Object.assign(wireEvent.initialState, currentState);
        }
        
        // Clean up monitor if wire is destroyed or connection established
        if (wire.destroyed || wire.remoteAddress) {
          Meteor.clearInterval(wireMonitor);
          
          const finalEvent = {
            event: wire.remoteAddress ? 'wire_connected' : 'wire_destroyed',
            timestamp: new Date(),
            elapsed: Date.now() - startTime,
            wireIndex: eventCount,
            finalState: currentState
          };
          
          result.events.push(finalEvent);
          console.log(`📊 Wire #${eventCount} final state:`, finalEvent);
        }
      }, 1000);
      
      // Clean up after max duration
      Meteor.setTimeout(function() {
        Meteor.clearInterval(wireMonitor);
      }, durationMs);
      
      // Call original handler
      if (originalOnWire) {
        originalOnWire.call(this, wire);
      }
    };
    
    // Restore original handler after monitoring period
    Meteor.setTimeout(function() {
      torrent._onWire = originalOnWire;
      result.monitoring = false;
      result.totalEvents = result.events.length;
      console.log(`📊 Connection monitoring completed. Total events: ${result.events.length}`);
    }, durationMs);
    
    return {
      ...result,
      status: 'monitoring started',
      message: `Monitoring connection attempts for ${durationMs}ms, check logs for real-time updates`
    };
  },

  /**
   * Force socket recreation for torrent wires
   */
  'debug.forceSocketRecreation': function(infoHash) {
    check(infoHash, String);
    
    console.log(`🔧 FORCING SOCKET RECREATION for ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      actions: [],
      wireResults: [],
      success: false
    };
    
    try {
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        throw new Error('Torrent not found');
      }
      
      result.actions.push(`Found torrent: ${torrent.name}`);
      result.actions.push(`Initial wire count: ${torrent.wires ? torrent.wires.length : 0}`);
      
      // Get the WebTorrent client
      const client = WebTorrentServer.getClient();
      if (!client) {
        throw new Error('WebTorrent client not available');
      }
      
      result.actions.push('WebTorrent client available');
      
      // Analyze current wires
      if (torrent.wires && torrent.wires.length > 0) {
        result.actions.push('Analyzing existing wires...');
        
        torrent.wires.forEach(function(wire, index) {
          const wireResult = {
            index: index,
            before: {
              remoteAddress: wire.remoteAddress,
              hasSocket: !!wire._socket,
              destroyed: wire.destroyed,
              readable: wire.readable,
              writable: wire.writable
            },
            actions: [],
            success: false
          };
          
          try {
            // Check if wire has remote address but no socket
            if (wire.remoteAddress && !wire._socket) {
              wireResult.actions.push(`Wire ${index} has remoteAddress but no socket - attempting recreation`);
              
              // Try to manually create a socket connection
              const net = require('net');
              const socket = new net.Socket();
              
              // Extract port from remoteAddress if IPv6 format
              let cleanAddress = wire.remoteAddress;
              let port = wire.remotePort;
              
              if (cleanAddress.startsWith('::ffff:')) {
                cleanAddress = cleanAddress.substring(7); // Remove IPv6 prefix
              }
              
              wireResult.actions.push(`Attempting socket connection to ${cleanAddress}:${port}`);
              
              // Set up socket event handlers
              socket.on('connect', function() {
                wireResult.actions.push(`Socket connected successfully to ${cleanAddress}:${port}`);
                
                // Try to attach this socket to the wire
                try {
                  wire._socket = socket;
                  wire.readable = true;
                  wire.writable = true;
                  wire._connected = true;
                  
                  wireResult.actions.push('Socket attached to wire successfully');
                  wireResult.success = true;
                  
                  // Trigger wire initialization
                  if (typeof wire._init === 'function') {
                    wire._init();
                    wireResult.actions.push('Wire initialization triggered');
                  }
                  
                } catch (attachErr) {
                  wireResult.actions.push(`Error attaching socket: ${attachErr.message}`);
                }
              });
              
              socket.on('error', function(err) {
                wireResult.actions.push(`Socket connection error: ${err.message}`);
              });
              
              socket.on('close', function() {
                wireResult.actions.push('Socket closed');
              });
              
              // Attempt connection with timeout
              socket.setTimeout(10000, function() {
                wireResult.actions.push('Socket connection timeout');
                socket.destroy();
              });
              
              // Start connection
              socket.connect(port, cleanAddress);
              
            } else if (!wire.remoteAddress) {
              wireResult.actions.push(`Wire ${index} has no remoteAddress - cannot recreate socket`);
            } else if (wire._socket) {
              wireResult.actions.push(`Wire ${index} already has socket`);
              wireResult.success = true;
            }
            
          } catch (wireErr) {
            wireResult.actions.push(`Wire ${index} error: ${wireErr.message}`);
          }
          
          result.wireResults.push(wireResult);
        });
      }
      
      // Also try to force client to create new connections
      result.actions.push('Forcing client to create new peer connections...');
      
      try {
        // Force announce to get more peers
        if (typeof torrent.announce === 'function') {
          torrent.announce();
          result.actions.push('Forced announce to trackers');
        }
        
        // Force DHT announce
        if (torrent.discovery && torrent.discovery.dht) {
          torrent.discovery.dht.announce(torrent.infoHash);
          result.actions.push('Forced DHT announce');
        }
        
        // Try to resume torrent if paused
        if (torrent.paused) {
          torrent.resume();
          result.actions.push('Resumed torrent');
        }
        
      } catch (announceErr) {
        result.actions.push(`Announce error: ${announceErr.message}`);
      }
      
      // Check if any operations succeeded
      const successfulWires = result.wireResults.filter(w => w.success).length;
      result.success = successfulWires > 0;
      
      result.summary = {
        totalWires: result.wireResults.length,
        successfulRecreations: successfulWires,
        pendingConnections: result.wireResults.filter(w => w.actions.some(a => a.includes('Attempting socket'))).length
      };
      
      console.log('🔧 Socket recreation completed:', result.summary);
      return result;
      
    } catch (error) {
      console.error('Error in socket recreation:', error);
      result.error = error.message;
      result.actions.push(`❌ Error: ${error.message}`);
      return result;
    }
  },

  /**
   * Monitor socket creation in real-time
   */
  'debug.monitorSocketCreation': function(infoHash, durationMs = 30000) {
    check(infoHash, String);
    check(durationMs, Number);
    
    console.log(`📊 MONITORING SOCKET CREATION for ${durationMs}ms`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      duration: durationMs,
      events: [],
      monitoring: true
    };
    
    try {
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        throw new Error('Torrent not found');
      }
      
      const startTime = Date.now();
      let eventCount = 0;
      
      // Override the wire creation to monitor socket attachment
      const originalOnWire = torrent._onWire;
      
      torrent._onWire = function(wire) {
        eventCount++;
        const wireEvent = {
          event: 'wire_created',
          timestamp: new Date(),
          elapsed: Date.now() - startTime,
          wireIndex: eventCount,
          remoteAddress: wire.remoteAddress || 'undefined',
          hasSocket: !!wire._socket,
          socketDetails: wire._socket ? {
            readyState: wire._socket.readyState,
            connecting: wire._socket.connecting,
            destroyed: wire._socket.destroyed
          } : null
        };
        
        result.events.push(wireEvent);
        console.log(`📊 Wire created #${eventCount}:`, wireEvent);
        
        // Monitor socket state changes for this wire
        let lastSocketState = !!wire._socket;
        
        const socketMonitor = Meteor.setInterval(function() {
          const currentSocketState = !!wire._socket;
          
          if (currentSocketState !== lastSocketState) {
            const socketEvent = {
              event: currentSocketState ? 'socket_attached' : 'socket_detached',
              timestamp: new Date(),
              elapsed: Date.now() - startTime,
              wireIndex: eventCount,
              socketDetails: wire._socket ? {
                readyState: wire._socket.readyState,
                connecting: wire._socket.connecting,
                destroyed: wire._socket.destroyed,
                remoteAddress: wire._socket.remoteAddress,
                localAddress: wire._socket.localAddress
              } : null
            };
            
            result.events.push(socketEvent);
            console.log(`📊 Socket state changed for wire #${eventCount}:`, socketEvent);
            
            lastSocketState = currentSocketState;
          }
          
          // Stop monitoring if wire is destroyed
          if (wire.destroyed) {
            Meteor.clearInterval(socketMonitor);
            
            const destroyEvent = {
              event: 'wire_destroyed',
              timestamp: new Date(),
              elapsed: Date.now() - startTime,
              wireIndex: eventCount
            };
            
            result.events.push(destroyEvent);
            console.log(`📊 Wire #${eventCount} destroyed:`, destroyEvent);
          }
        }, 1000);
        
        // Clean up monitor after duration
        Meteor.setTimeout(function() {
          Meteor.clearInterval(socketMonitor);
        }, durationMs);
        
        // Call original handler
        if (originalOnWire) {
          originalOnWire.call(this, wire);
        }
      };
      
      // Restore original handler after monitoring
      Meteor.setTimeout(function() {
        torrent._onWire = originalOnWire;
        result.monitoring = false;
        result.totalEvents = result.events.length;
        console.log(`📊 Socket monitoring completed. Total events: ${result.events.length}`);
      }, durationMs);
      
      return {
        ...result,
        status: 'monitoring started',
        message: `Monitoring socket creation for ${durationMs}ms`
      };
      
    } catch (error) {
      console.error('Error in socket monitoring:', error);
      result.error = error.message;
      return result;
    }
  },

  /**
   * Advanced WebTorrent client diagnostics
   */
  'debug.diagnoseWebTorrentClient': function() {
    console.log(`🔬 DIAGNOSING WEBTORRENT CLIENT STATE`);
    
    const result = {
      timestamp: new Date(),
      client: {},
      system: {},
      network: {},
      limitations: {},
      recommendations: []
    };
    
    try {
      const client = WebTorrentServer.getClient();
      
      if (!client) {
        result.error = 'WebTorrent client not initialized';
        return result;
      }
      
      // Basic client state
      result.client = {
        destroyed: client.destroyed,
        listening: client.listening,
        tcpPort: client.tcpPort,
        udpPort: client.udpPort,
        maxConns: client.maxConns,
        torrentsCount: client.torrents ? client.torrents.length : 0,
        nodeId: client.nodeId ? client.nodeId.toString('hex') : null,
        peerId: client.peerId ? client.peerId.toString('hex') : null,
        throttleDownload: client.throttleDownload,
        throttleUpload: client.throttleUpload
      };
      
      // System limitations
      const os = require('os');
      result.system = {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        totalMemory: Math.round(os.totalmem() / 1024 / 1024) + ' MB',
        freeMemory: Math.round(os.freemem() / 1024 / 1024) + ' MB',
        loadAverage: os.loadavg(),
        uptime: Math.round(os.uptime() / 60) + ' minutes',
        cpuCount: os.cpus().length
      };
      
      // Check file descriptor limits (Unix-like systems)
      if (process.platform !== 'win32') {
        try {
          const { execSync } = require('child_process');
          const ulimitResult = execSync('ulimit -n', { encoding: 'utf8' }).trim();
          result.limitations.fileDescriptors = {
            current: parseInt(ulimitResult),
            recommended: 8192,
            sufficient: parseInt(ulimitResult) >= 1024
          };
        } catch (ulimitErr) {
          result.limitations.fileDescriptors = {
            error: 'Could not check ulimit'
          };
        }
      }
      
      // Network interface analysis
      const networkInterfaces = os.networkInterfaces();
      result.network = {
        interfaces: Object.keys(networkInterfaces).map(name => ({
          name: name,
          addresses: networkInterfaces[name].map(addr => ({
            address: addr.address,
            family: addr.family,
            internal: addr.internal
          }))
        })),
        hasIPv4: Object.values(networkInterfaces).flat().some(addr => addr.family === 'IPv4' && !addr.internal),
        hasIPv6: Object.values(networkInterfaces).flat().some(addr => addr.family === 'IPv6' && !addr.internal)
      };
      
      // Check if client has socket creation capability
      try {
        const net = require('net');
        const testSocket = new net.Socket();
        testSocket.destroy();
        result.limitations.canCreateSockets = true;
      } catch (socketErr) {
        result.limitations.canCreateSockets = false;
        result.limitations.socketError = socketErr.message;
      }
      
      // WebTorrent-specific checks
      if (client._tcpPool) {
        result.client.tcpPool = {
          exists: true,
          listening: client._tcpPool.listening,
          port: client._tcpPool.port
        };
      } else {
        result.client.tcpPool = { exists: false };
      }
      
      // Generate recommendations
      if (!result.client.listening) {
        result.recommendations.push('WebTorrent client not listening - check port binding');
      }
      
      if (result.client.maxConns < 100) {
        result.recommendations.push(`Low maxConns (${result.client.maxConns}) - consider increasing for better connectivity`);
      }
      
      if (result.limitations.fileDescriptors && !result.limitations.fileDescriptors.sufficient) {
        result.recommendations.push('Low file descriptor limit may cause connection issues');
      }
      
      if (!result.limitations.canCreateSockets) {
        result.recommendations.push('CRITICAL: Cannot create sockets - permission or system issue');
      }
      
      if (!result.network.hasIPv4) {
        result.recommendations.push('No IPv4 addresses found - may limit peer connectivity');
      }
      
      if (!result.client.tcpPool.exists) {
        result.recommendations.push('No TCP pool - WebTorrent may not be able to create outbound connections');
      }
      
      console.log('🔬 WebTorrent client diagnosis completed:', result);
      return result;
      
    } catch (error) {
      console.error('Error in WebTorrent client diagnosis:', error);
      result.error = error.message;
      return result;
    }
  },
  /**
   * Quick fix: Force TCP pool creation for existing client
   */
  'debug.forceTcpPoolCreation': function() {
    console.log('🔧 FORCING TCP POOL CREATION');
    
    const result = {
      timestamp: new Date(),
      actions: [],
      success: false,
      before: {},
      after: {}
    };
    
    try {
      const client = WebTorrentServer.getClient();
      
      if (!client) {
        throw new Error('WebTorrent client not available');
      }
      
      // Check current state
      result.before = {
        tcpPoolExists: !!client._tcpPool,
        listening: client.listening,
        maxConns: client.maxConns,
        torrents: client.torrents.length
      };
      
      result.actions.push(`Before: TCP pool exists = ${result.before.tcpPoolExists}`);
      
      // Method 1: Try to force listen if not listening
      if (!client.listening) {
        result.actions.push('Client not listening, attempting to start...');
        
        try {
          client.listen(0, function() {
            result.actions.push('✅ Client listen() called successfully');
          });
        } catch (listenErr) {
          result.actions.push(`❌ Listen error: ${listenErr.message}`);
        }
      }
      
      // Method 2: Increase maxConns to trigger internal changes
      if (client.maxConns < 100) {
        const oldMaxConns = client.maxConns;
        client.maxConns = 200;
        result.actions.push(`Increased maxConns from ${oldMaxConns} to ${client.maxConns}`);
      }
      
      // Method 3: Try to access internal TCP pool methods
      try {
        if (typeof client._startTcpPool === 'function') {
          client._startTcpPool();
          result.actions.push('✅ Called _startTcpPool()');
        } else {
          result.actions.push('⚠️ _startTcpPool method not available');
        }
      } catch (poolErr) {
        result.actions.push(`⚠️ _startTcpPool error: ${poolErr.message}`);
      }
      
      // Method 4: Force a connection attempt to trigger pool
      try {
        // Create a temporary torrent to trigger TCP pool
        const testMagnet = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel';
        
        result.actions.push('Adding temporary torrent to trigger TCP pool...');
        
        client.add(testMagnet, { path: '/tmp' }, function(torrent) {
          result.actions.push('✅ Temporary torrent added');
          
          // Remove it immediately
          Meteor.setTimeout(function() {
            try {
              torrent.destroy();
              result.actions.push('✅ Temporary torrent removed');
            } catch (removeErr) {
              result.actions.push(`⚠️ Error removing temp torrent: ${removeErr.message}`);
            }
          }, 2000);
        });
        
      } catch (tempErr) {
        result.actions.push(`⚠️ Temporary torrent error: ${tempErr.message}`);
      }
      
      // Check results after a delay
      Meteor.setTimeout(function() {
        result.after = {
          tcpPoolExists: !!client._tcpPool,
          listening: client.listening,
          maxConns: client.maxConns,
          torrents: client.torrents.length
        };
        
        result.success = result.after.tcpPoolExists && !result.before.tcpPoolExists;
        result.actions.push(`After: TCP pool exists = ${result.after.tcpPoolExists}`);
        
        if (result.success) {
          result.actions.push('🎉 SUCCESS: TCP pool created!');
        } else if (result.after.tcpPoolExists) {
          result.actions.push('✅ TCP pool was already working');
        } else {
          result.actions.push('❌ TCP pool still missing');
        }
        
        console.log('🔧 TCP pool creation result:', result);
      }, 3000);
      
      return result;
      
    } catch (error) {
      console.error('Error in TCP pool creation:', error);
      result.error = error.message;
      result.actions.push(`❌ Error: ${error.message}`);
      return result;
    }
  },


  /**
   * Force WebTorrent to use different ports for Client 2
   */
  'debug.fixPortConflict': function() {
    console.log('🔧 FIXING PORT CONFLICT - FORCING DIFFERENT PORTS');
    
    const result = {
      timestamp: new Date(),
      actions: [],
      success: false,
      before: {},
      after: {}
    };
    
    try {
      const client = WebTorrentServer.getClient();
      
      if (!client) {
        throw new Error('WebTorrent client not available');
      }
      
      result.before = {
        listening: client.listening,
        tcpPort: client.tcpPort,
        udpPort: client.udpPort,
        destroyed: client.destroyed,
        tcpPoolExists: !!client._tcpPool
      };
      
      result.actions.push(`Before: listening=${result.before.listening}, tcpPort=${result.before.tcpPort}, tcpPool=${result.before.tcpPoolExists}`);
      
      // If not listening, force it to listen on a different port range
      if (!client.listening || !client._tcpPool) {
        result.actions.push('Client not properly listening, forcing port binding...');
        
        // Find an available port in a different range
        const net = require('net');
        const testPorts = [7881, 7882, 7883, 8881, 8882, 8883, 9881, 9882];
        
        function tryPort(portIndex) {
          if (portIndex >= testPorts.length) {
            result.actions.push('❌ No available ports found');
            return;
          }
          
          const testPort = testPorts[portIndex];
          const testServer = net.createServer();
          
          testServer.on('error', function(err) {
            result.actions.push(`Port ${testPort} unavailable: ${err.message}`);
            tryPort(portIndex + 1);
          });
          
          testServer.listen(testPort, function() {
            const availablePort = testServer.address().port;
            result.actions.push(`✅ Found available port: ${availablePort}`);
            
            testServer.close(function() {
              // Now force WebTorrent to use this port
              try {
                // Method 1: Use WebTorrent's listen method with specific port
                if (typeof client.listen === 'function') {
                  client.listen(availablePort, function() {
                    result.actions.push(`✅ WebTorrent listening on port ${availablePort}`);
                    
                    result.after = {
                      listening: client.listening,
                      tcpPort: client.tcpPort,
                      udpPort: client.udpPort,
                      tcpPoolExists: !!client._tcpPool
                    };
                    
                    result.success = client.listening && !!client._tcpPool;
                    result.actions.push(`After: listening=${result.after.listening}, tcpPort=${result.after.tcpPort}, tcpPool=${result.after.tcpPoolExists}`);
                    
                    if (result.success) {
                      result.actions.push('🎉 SUCCESS: Port conflict resolved!');
                    }
                  });
                } else {
                  result.actions.push('❌ client.listen method not available');
                }
                
                // Method 2: Force internal port binding
                if (client._tcpPool) {
                  result.actions.push('TCP pool exists, checking port binding...');
                } else {
                  result.actions.push('⚠️ TCP pool still missing after port assignment');
                  
                  // Try to manually create TCP pool with specific port
                  try {
                    // Access internal WebTorrent methods
                    if (client._startTcpPool) {
                      client._startTcpPool(availablePort);
                      result.actions.push(`Attempted _startTcpPool(${availablePort})`);
                    }
                  } catch (internalErr) {
                    result.actions.push(`Internal method error: ${internalErr.message}`);
                  }
                }
                
              } catch (listenErr) {
                result.actions.push(`❌ Listen error: ${listenErr.message}`);
                tryPort(portIndex + 1);
              }
            });
          });
        }
        
        // Start trying ports
        tryPort(0);
        
      } else {
        result.actions.push('✅ Client already listening properly');
        result.success = true;
      }
      
      // Set up verification after delay
      Meteor.setTimeout(function() {
        result.after = {
          listening: client.listening,
          tcpPort: client.tcpPort,
          udpPort: client.udpPort,
          tcpPoolExists: !!client._tcpPool
        };
        
        result.finalSuccess = client.listening && !!client._tcpPool;
        result.actions.push(`Final check: listening=${result.after.listening}, tcpPort=${result.after.tcpPort}, tcpPool=${result.after.tcpPoolExists}`);
        
        console.log('🔧 Port conflict fix result:', result);
      }, 5000);
      
      return result;
      
    } catch (error) {
      console.error('Error fixing port conflict:', error);
      result.error = error.message;
      result.actions.push(`❌ Error: ${error.message}`);
      return result;
    }
  }, 



  /**
   * Test TCP server creation capabilities
   */
  'debug.testTcpServerCreation': async function() {
    console.log('🧪 TESTING TCP SERVER CREATION');
    
    const result = {
      timestamp: new Date(),
      tests: [],
      success: false,
      workingPorts: [],
      errors: []
    };
    
    const testPorts = [6881, 6882, 7881, 8881, 0]; // 0 = random port
    
    for (const port of testPorts) {
      const test = {
        port: port,
        success: false,
        actualPort: null,
        error: null,
        duration: 0
      };
      
      const startTime = Date.now();
      
      try {
        await new Promise(function(resolve, reject) {
          const server = net.createServer();
          
          const timeout = setTimeout(function() {
            server.close();
            reject(new Error('Connection timeout'));
          }, 5000);
          
          server.listen(port, '0.0.0.0', function() {
            clearTimeout(timeout);
            const address = server.address();
            test.success = true;
            test.actualPort = address.port;
            
            server.close(function() {
              resolve();
            });
          });
          
          server.on('error', function(err) {
            clearTimeout(timeout);
            test.error = err.message;
            reject(err);
          });
        });
        
        test.duration = Date.now() - startTime;
        result.workingPorts.push(test.actualPort);
        
      } catch (err) {
        test.error = err.message;
        test.duration = Date.now() - startTime;
        result.errors.push(`Port ${port}: ${err.message}`);
      }
      
      result.tests.push(test);
      console.log(`TCP test port ${port}: ${test.success ? 'SUCCESS' : 'FAILED'} (${test.duration}ms)`);
    }
    
    result.success = result.workingPorts.length > 0;
    
    if (result.success) {
      console.log(`✅ TCP server creation working. Available ports: ${result.workingPorts.join(', ')}`);
    } else {
      console.log('❌ TCP server creation completely broken');
    }
    
    return result;
  },

  /**
   * Force TCP pool creation with multiple strategies
   */
  'debug.forceTcpPoolCreation': async function() {
    console.log('🔧 FORCING TCP POOL CREATION');
    
    const result = {
      timestamp: new Date(),
      attempts: [],
      success: false,
      finalState: {}
    };
    
    try {
      const client = WebTorrentServer.getClient();
      
      if (!client) {
        throw new Error('WebTorrent client not available');
      }
      
      result.initialState = {
        tcpPoolExists: !!client._tcpPool,
        listening: client.listening,
        tcpPort: client.tcpPort
      };
      
      // Strategy 1: Use listen() method
      if (!client.listening) {
        const attempt1 = { strategy: 'client.listen()', success: false };
        
        try {
          await new Promise(function(resolve, reject) {
            const timeout = setTimeout(function() {
              reject(new Error('Listen timeout'));
            }, 10000);
            
            client.listen(0, function() {
              clearTimeout(timeout);
              attempt1.success = true;
              attempt1.port = client.tcpPort;
              resolve();
            });
          });
        } catch (listenErr) {
          attempt1.error = listenErr.message;
        }
        
        result.attempts.push(attempt1);
      }
      
      // Strategy 2: Call internal _startTcpPool
      if (!client._tcpPool && typeof client._startTcpPool === 'function') {
        const attempt2 = { strategy: '_startTcpPool()', success: false };
        
        try {
          await client._startTcpPool();
          attempt2.success = !!client._tcpPool;
        } catch (poolErr) {
          attempt2.error = poolErr.message;
        }
        
        result.attempts.push(attempt2);
      }
      
      // Strategy 3: Manual TCP pool creation
      if (!client._tcpPool) {
        const attempt3 = { strategy: 'manual TCP pool', success: false };
        
        try {
          const availablePort = await new Promise(function(resolve, reject) {
            const server = net.createServer();
            server.listen(0, function() {
              const port = server.address().port;
              server.close(function() {
                resolve(port);
              });
            });
            server.on('error', reject);
          });
          
          const tcpPool = net.createServer();
          
          await new Promise(function(resolve, reject) {
            tcpPool.listen(availablePort, '0.0.0.0', function() {
              // Attach to WebTorrent
              client._tcpPool = tcpPool;
              client.tcpPort = availablePort;
              client.listening = true;
              
              attempt3.success = true;
              attempt3.port = availablePort;
              resolve();
            });
            
            tcpPool.on('error', reject);
          });
          
        } catch (manualErr) {
          attempt3.error = manualErr.message;
        }
        
        result.attempts.push(attempt3);
      }
      
      // Strategy 4: Client recreation
      if (!client._tcpPool) {
        const attempt4 = { strategy: 'client recreation', success: false };
        
        try {
          // Destroy current client
          client.destroy();
          
          // Create new client with forced config
          const WebTorrent = require('webtorrent');
          const newClient = new WebTorrent({
            maxConns: 100,
            tcpPool: true
          });
          
          // Force listen immediately
          await new Promise(function(resolve, reject) {
            newClient.listen(0, function() {
              attempt4.success = !!newClient._tcpPool;
              attempt4.port = newClient.tcpPort;
              resolve();
            });
            
            setTimeout(function() {
              reject(new Error('Recreation timeout'));
            }, 10000);
          });
          
          // Note: This would require updating the WebTorrentServer reference
          attempt4.note = 'New client created but not integrated - manual integration required';
          
        } catch (recreateErr) {
          attempt4.error = recreateErr.message;
        }
        
        result.attempts.push(attempt4);
      }
      
      // Final state check
      result.finalState = {
        tcpPoolExists: !!client._tcpPool,
        listening: client.listening,
        tcpPort: client.tcpPort,
        destroyed: client.destroyed
      };
      
      result.success = result.finalState.tcpPoolExists;
      
      const successfulAttempts = result.attempts.filter(a => a.success).length;
      console.log(`TCP pool creation result: ${successfulAttempts}/${result.attempts.length} strategies successful`);
      
      return result;
      
    } catch (error) {
      console.error('Error in force TCP pool creation:', error);
      result.error = error.message;
      return result;
    }
  },

  /**
   * Alternative: Use HTTP-based tracker instead of TCP
   */
  'debug.switchToHttpTrackers': function() {
    console.log('🔄 SWITCHING TO HTTP-BASED TRACKERS');
    
    const result = {
      timestamp: new Date(),
      actions: [],
      success: false
    };
    
    try {
      const client = WebTorrentServer.getClient();
      
      if (!client) {
        throw new Error('WebTorrent client not available');
      }
      
      // HTTP/WebSocket trackers that don't require TCP pool
      const httpTrackers = [
        'wss://tracker.openwebtorrent.com',
        'wss://tracker.btorrent.xyz',
        'wss://tracker.fastcast.nz',
        'wss://tracker.webtorrent.io'
      ];
      
      result.actions.push(`Configured ${httpTrackers.length} HTTP/WebSocket trackers`);
      result.actions.push('These trackers work without TCP pool');
      
      // Update tracker configuration in settings
      const currentSettings = Meteor.settings;
      if (!currentSettings.public) currentSettings.public = {};
      if (!currentSettings.public.webtorrent) currentSettings.public.webtorrent = {};
      
      currentSettings.public.webtorrent.tracker = httpTrackers;
      result.actions.push('Updated Meteor settings with HTTP trackers');
      
      // Note about limitations
      result.actions.push('⚠️ HTTP trackers have limitations:');
      result.actions.push('- Fewer peers discovered');
      result.actions.push('- No direct peer connections'); 
      result.actions.push('- Relies on WebRTC for connections');
      
      result.success = true;
      result.trackers = httpTrackers;
      
      console.log('HTTP tracker configuration completed');
      return result;
      
    } catch (error) {
      console.error('Error switching to HTTP trackers:', error);
      result.error = error.message;
      return result;
    }
  },

  /**
   * Get WebTorrent version and compatibility info
   */
  'debug.getWebTorrentCompatibility': function() {
    console.log('🔍 CHECKING WEBTORRENT COMPATIBILITY');
    
    const result = {
      timestamp: new Date(),
      versions: {},
      compatibility: {},
      recommendations: []
    };
    
    try {
      // Version information
      const WebTorrent = require('webtorrent');
      const packageJson = require('webtorrent/package.json');
      
      result.versions = {
        webtorrent: packageJson.version,
        node: process.version,
        platform: process.platform,
        arch: process.arch
      };
      
      // Compatibility matrix
      result.compatibility = {
        macOSARM64Node22: {
          compatible: false,
          reason: 'Known TCP pool creation issues',
          workaround: 'Use enhanced WebTorrent server with TCP fixes'
        },
        macOSARM64Node18: {
          compatible: true,
          reason: 'Generally works with older Node.js versions'
        },
        linuxNode22: {
          compatible: true,
          reason: 'Linux generally has fewer TCP issues'
        },
        windowsNode22: {
          compatible: true,
          reason: 'Windows TCP stack more stable'
        }
      };
      
      // Specific recommendations
      const isProblematicCombo = 
        process.platform === 'darwin' && 
        process.arch === 'arm64' && 
        process.version.startsWith('v22');
      
      if (isProblematicCombo) {
        result.recommendations.push('🚨 PROBLEMATIC COMBINATION DETECTED');
        result.recommendations.push('Consider downgrading to Node.js 18 LTS');
        result.recommendations.push('Or use the enhanced WebTorrent server implementation');
        result.recommendations.push('Alternative: Use Docker with Linux container');
      } else {
        result.recommendations.push('✅ Compatible platform combination');
      }
      
      // Check for alternative solutions
      result.alternatives = [
        'Use WebRTC-only mode (no TCP required)',
        'Implement HTTP-based peer discovery',
        'Use containerized Linux environment',
        'Switch to Node.js 18 LTS',
        'Use alternative P2P libraries (libp2p, hypercore)'
      ];
      
      console.log('WebTorrent compatibility check completed:', result);
      return result;
      
    } catch (error) {
      console.error('Error checking WebTorrent compatibility:', error);
      result.error = error.message;
      return result;
    }
  },

  /**
   * Force metadata exchange between peers with enhanced compatibility
   * This specifically fixes the "Peer does not support ut_metadata" issue
   */
  'torrents.forceMetadataExchangeV2': async function(infoHash) {
    check(infoHash, String);
    
    console.log(`🔧 FORCE METADATA EXCHANGE V2 for ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      actions: [],
      success: false,
      strategy: 'enhanced-compatibility'
    };
    
    try {
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        const torrentRecord = await TorrentsCollection.findOneAsync({ infoHash });
        if (!torrentRecord?.magnetURI) {
          throw new Error('Torrent not found');
        }
        
        result.actions.push('🔄 Reloading torrent');
        torrent = await WebTorrentServer.addTorrent(torrentRecord.magnetURI);

        Meteor.setTimeout(function() {
          if (torrent && typeof torrent.announce === 'function') {
            torrent.announce();
            console.log('Forced immediate announce for new torrent');
          }
        }, 1000);
      }
      
      result.actions.push(`📊 Initial: ready=${torrent.ready}, files=${torrent.files?.length || 0}, peers=${torrent.numPeers}`);
      
      // CRITICAL FIX: Force metadata request pattern that works with WebTorrent's quirks
      if (torrent.wires && torrent.wires.length > 0) {
        result.actions.push(`🔧 Processing ${torrent.wires.length} wire connections`);
        
        for (let i = 0; i < torrent.wires.length; i++) {
          const wire = torrent.wires[i];
          
          if (!wire || !wire.remoteAddress) {
            result.actions.push(`⏭️ Skipping wire ${i}: not ready`);
            continue;
          }
          
          result.actions.push(`🔌 Wire ${i}: ${wire.remoteAddress}:${wire.remotePort}`);
          
          try {
            // Step 1: Force interest signals
            if (!wire.amInterested) {
              wire.interested();
              result.actions.push(`   📢 Sent interested`);
            }
            
            if (wire.amChoking) {
              wire.unchoke();
              result.actions.push(`   🔓 Unchoked`);
            }
            
            // Step 2: Check if peer has extended protocol
            if (!wire.peerExtended) {
              result.actions.push(`   ⚠️ Peer doesn't support extended protocol`);
              
              // Try to trigger extended handshake
              if (wire.extended) {
                const handshake = {
                  m: { ut_metadata: 1 },
                  v: 'WebTorrent'
                };
                
                try {
                  wire.extended('handshake', Buffer.from(JSON.stringify(handshake)));
                  result.actions.push(`   📡 Sent extended handshake`);
                } catch (e) {
                  result.actions.push(`   ❌ Handshake error: ${e.message}`);
                }
              }
              continue;
            }
            
            // Step 3: Install ut_metadata if missing
            if (!wire.ut_metadata) {
              const ut_metadata = require('ut_metadata');
              
              if (torrent.metadata) {
                // Seeding torrent
                wire.use(ut_metadata(torrent.metadata));
                result.actions.push(`   ✅ Installed ut_metadata for seeding`);
              } else {
                // Downloading torrent
                wire.use(ut_metadata());
                result.actions.push(`   ✅ Installed ut_metadata for downloading`);
              }
            }
            
            // Step 4: Force metadata request (for downloading torrents)
            if (!torrent.ready && wire.ut_metadata) {
              // Multiple request strategies
              
              // Strategy A: Use fetch() if available
              if (typeof wire.ut_metadata.fetch === 'function') {
                for (let j = 0; j < 3; j++) {
                  wire.ut_metadata.fetch();
                  result.actions.push(`   📥 Called fetch() #${j + 1}`);
                }
              }
              
              // Strategy B: Manual metadata request
              for (let piece = 0; piece < 5; piece++) {
                const request = {
                  msg_type: 0, // request
                  piece: piece
                };
                
                try {
                  wire.extended('ut_metadata', Buffer.from(JSON.stringify(request)));
                  result.actions.push(`   📥 Sent manual request for piece ${piece}`);
                } catch (e) {
                  // Ignore errors
                }
              }
              
              // Strategy C: Try binary request format
              const binaryRequest = Buffer.from([0]); // msg_type = 0
              try {
                wire.extended('ut_metadata', binaryRequest);
                result.actions.push(`   📥 Sent binary metadata request`);
              } catch (e) {
                // Ignore
              }
            }
            
          } catch (wireErr) {
            result.actions.push(`   ❌ Wire error: ${wireErr.message}`);
          }
        }
      }
      
      // Enhanced announce to find better peers
      result.actions.push('📢 Enhanced announce for better peer discovery');
      
      try {
        if (typeof torrent.announce === 'function') {
          torrent.announce();
          result.actions.push('✅ Announced to trackers');
        }
      } catch (announceErr) {
        result.actions.push(`⚠️ Announce error: ${announceErr.message}`);
      }
      
      // Wait for metadata with monitoring
      result.actions.push('⏳ Waiting for metadata (60 seconds)');
      
      const maxWaitTime = 60000;
      const startTime = Date.now();
      
      return new Promise(function(resolve) {
        const checker = Meteor.setInterval(function() {
          const elapsed = Date.now() - startTime;
          const status = {
            ready: torrent.ready,
            files: torrent.files?.length || 0,
            peers: torrent.numPeers,
            progress: Math.round(torrent.progress * 100)
          };
          
          // Log every 5 seconds
          if (elapsed % 5000 < 1000) {
            result.actions.push(`📊 ${Math.round(elapsed/1000)}s: ready=${status.ready}, files=${status.files}, peers=${status.peers}, progress=${status.progress}%`);
          }
          
          // Success condition
          if (torrent.ready && torrent.files && torrent.files.length > 0) {
            Meteor.clearInterval(checker);
            result.success = true;
            result.finalStatus = status;
            result.actions.push(`🎉 SUCCESS after ${Math.round(elapsed/1000)} seconds!`);
            
            WebTorrentServer._updateTorrentRecord(torrent);
            resolve(result);
            return;
          }
          
          // Re-apply fixes every 10 seconds
          if (elapsed % 10000 < 1000 && torrent.wires && torrent.wires.length > 0) {
            result.actions.push(`🔄 Re-applying fixes at ${Math.round(elapsed/1000)}s`);
            
            torrent.wires.forEach(function(wire) {
              if (!wire || !wire.remoteAddress) return;
              
              // Re-send interest
              if (!wire.amInterested) {
                wire.interested();
              }
              
              // Re-attempt metadata request
              if (!torrent.ready && wire.ut_metadata && wire.ut_metadata.fetch) {
                wire.ut_metadata.fetch();
              }
            });
          }
          
          // Timeout
          if (elapsed >= maxWaitTime) {
            Meteor.clearInterval(checker);
            result.success = false;
            result.finalStatus = status;
            result.actions.push(`⏰ Timeout after ${Math.round(elapsed/1000)} seconds`);
            resolve(result);
          }
        }, 1000);
      });
      
    } catch (error) {
      console.error('Metadata exchange V2 error:', error);
      result.error = error.message;
      result.actions.push(`❌ Error: ${error.message}`);
      return result;
    }
  },

  /**
   * Fix seeding peer metadata advertisement
   * This ensures the seeding peer properly advertises ut_metadata support
   */
  'torrents.fixSeedingAdvertisement': function(infoHash) {
    check(infoHash, String);
    
    console.log(`🌱 FIXING SEEDING ADVERTISEMENT for ${infoHash}`);
    
    const result = {
      timestamp: new Date(),
      infoHash: infoHash,
      actions: [],
      success: false
    };
    
    try {
      const torrent = WebTorrentServer.getTorrent(infoHash);
      
      if (!torrent) {
        throw new Error('Torrent not found');
      }
      
      if (!torrent.metadata) {
        throw new Error('Torrent has no metadata - not a seeding torrent');
      }
      
      result.actions.push(`🌱 Fixing metadata advertisement for: ${torrent.name}`);
      result.actions.push(`📊 Metadata size: ${torrent.metadata.length} bytes`);
      
      // Fix all existing connections
      if (torrent.wires && torrent.wires.length > 0) {
        torrent.wires.forEach(function(wire, index) {
          if (!wire || !wire.remoteAddress) {
            result.actions.push(`⏭️ Skipping wire ${index}: not ready`);
            return;
          }
          
          result.actions.push(`🔌 Fixing wire ${index}: ${wire.remoteAddress}`);
          
          try {
            // Ensure ut_metadata is installed with metadata
            const ut_metadata = require('ut_metadata');
            
            // Remove existing if present
            if (wire.ut_metadata) {
              delete wire.ut_metadata;
              result.actions.push(`   🗑️ Removed existing ut_metadata`);
            }
            
            // Install with metadata
            wire.use(ut_metadata(torrent.metadata));
            result.actions.push(`   ✅ Installed ut_metadata with ${torrent.metadata.length} bytes`);
            
            // Send proper extended handshake
            const extHandshake = {
              m: {
                ut_metadata: 1
              },
              metadata_size: torrent.metadata.length,
              v: 'WebTorrent-Fixed'
            };
            
            wire.extended('handshake', Buffer.from(JSON.stringify(extHandshake)));
            result.actions.push(`   📡 Sent handshake with metadata_size=${torrent.metadata.length}`);
            
            // Set up metadata response handler
            wire.on('extended', function(ext, buf) {
              if (ext === 'ut_metadata') {
                console.log(`Metadata request from ${wire.remoteAddress}`);
                
                try {
                  // Parse request
                  let request;
                  try {
                    request = JSON.parse(buf.toString());
                  } catch (e) {
                    request = { msg_type: buf[0], piece: 0 };
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
                    result.actions.push(`   ✅ Sent metadata to ${wire.remoteAddress}`);
                  }
                } catch (e) {
                  console.error('Error responding to metadata request:', e);
                }
              }
            });
            
          } catch (wireErr) {
            result.actions.push(`   ❌ Error: ${wireErr.message}`);
          }
        });
      }
      
      // Set up handler for new connections
      const originalOnWire = torrent._onWire;
      torrent._onWire = function(wire) {
        console.log(`New connection to seeding torrent: ${wire.remoteAddress}`);
        
        if (originalOnWire) {
          originalOnWire.call(this, wire);
        }
        
        // Immediately set up metadata sharing
        Meteor.setTimeout(function() {
          if (!wire || !wire.remoteAddress || wire.destroyed) return;
          
          try {
            const ut_metadata = require('ut_metadata');
            wire.use(ut_metadata(torrent.metadata));
            
            const handshake = {
              m: { ut_metadata: 1 },
              metadata_size: torrent.metadata.length,
              v: 'WebTorrent-Auto'
            };
            
            wire.extended('handshake', Buffer.from(JSON.stringify(handshake)));
            console.log(`Auto-configured metadata sharing for ${wire.remoteAddress}`);
          } catch (e) {
            console.error('Error setting up new connection:', e);
          }
        }, 500);
      };
      
      result.success = true;
      result.actions.push('🎉 Seeding advertisement fix applied');
      
      return result;
      
    } catch (error) {
      console.error('Seeding advertisement fix error:', error);
      result.error = error.message;
      result.actions.push(`❌ Error: ${error.message}`);
      return result;
    }
  },

  /**
   * Quick diagnostic for metadata exchange issues
   */
  'torrents.quickMetadataDiagnosis': function(infoHash) {
    check(infoHash, String);
    
    const torrent = WebTorrentServer.getTorrent(infoHash);
    
    if (!torrent) {
      return { error: 'Torrent not found' };
    }
    
    const diagnosis = {
      torrent: {
        name: torrent.name,
        ready: torrent.ready,
        hasMetadata: !!torrent.metadata,
        metadataSize: torrent.metadata?.length || 0,
        files: torrent.files?.length || 0,
        peers: torrent.numPeers
      },
      wires: []
    };
    
    if (torrent.wires) {
      torrent.wires.forEach(function(wire, index) {
        if (!wire) return;
        
        diagnosis.wires.push({
          index: index,
          address: wire.remoteAddress || 'not connected',
          hasExtended: !!wire.extended,
          peerExtended: !!wire.peerExtended,
          supportsUtMetadata: !!(wire.peerExtensions && wire.peerExtensions.ut_metadata),
          hasUtMetadata: !!wire.ut_metadata,
          interested: wire.amInterested,
          peerInterested: wire.peerInterested
        });
      });
    }
    
    // Recommendations
    diagnosis.recommendations = [];
    
    if (!torrent.ready && torrent.peers > 0) {
      const supportingPeers = diagnosis.wires.filter(w => w.supportsUtMetadata).length;
      if (supportingPeers === 0) {
        diagnosis.recommendations.push('No peers support metadata - use forceMetadataExchangeV2');
      }
    }
    
    if (torrent.ready && torrent.metadata) {
      const advertisingWires = diagnosis.wires.filter(w => w.hasUtMetadata).length;
      if (advertisingWires < diagnosis.wires.length) {
        diagnosis.recommendations.push('Not all connections have metadata support - use fixSeedingAdvertisement');
      }
    }
    
    return diagnosis;
  }
});


