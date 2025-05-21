import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { get } from 'lodash';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Button from '@mui/material/Button';
import { Settings } from '../../api/settings/settings';

// Debug component to display application state and troubleshoot issues
function DebugPanel() {
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [runtimeInfo, setRuntimeInfo] = useState({
    meteorStatus: 'Checking...',
    webTorrentStatus: 'Disabled',
    subscriptions: 'Checking...',
    settings: 'Checking...',
  });
  const [expanded, setExpanded] = useState(false);
  
  useEffect(function() {
    // Only run debugging if panel is open
    if (!isOpen) return;
    
    // Check Meteor status
    try {
      setRuntimeInfo(prev => ({
        ...prev,
        meteorStatus: Meteor.status().connected ? 'Connected' : 'Disconnected'
      }));
    } catch (error) {
      setRuntimeInfo(prev => ({
        ...prev,
        meteorStatus: `Error: ${error.message}`
      }));
    }
    
    // Check WebTorrent status (it's disabled, so just show that)
    setRuntimeInfo(prev => ({
      ...prev,
      webTorrentStatus: 'Disabled in this version'
    }));
    
    // Check subscription status
    try {
      const torrentsReady = Meteor.subscribe('torrents.all').ready();
      setRuntimeInfo(prev => ({
        ...prev,
        subscriptions: torrentsReady ? 'Ready' : 'Loading'
      }));
    } catch (error) {
      setRuntimeInfo(prev => ({
        ...prev,
        subscriptions: `Error: ${error.message}`
      }));
    }
    
    // Check settings
    try {
      const webTorrentConfig = Settings.getWebTorrentConfig();
      const fhirConfig = Settings.getFhirConfig();
      const uiConfig = Settings.getUIConfig();
      
      setRuntimeInfo(prev => ({
        ...prev,
        settings: JSON.stringify({
          webTorrent: webTorrentConfig,
          fhir: fhirConfig,
          ui: uiConfig
        }, null, 2)
      }));
    } catch (error) {
      setRuntimeInfo(prev => ({
        ...prev,
        settings: `Error: ${error.message}`
      }));
    }
  }, [isOpen]);
  
  // Toggle debug panel
  function togglePanel() {
    setIsOpen(!isOpen);
  }
  
  // Handle accordion expansion
  function handleAccordionChange(panel) {
    return function(event, isExpanded) {
      setExpanded(isExpanded ? panel : false);
    };
  }
  
  // Test connection to server
  function testConnection() {
    Meteor.call('debug.testPeers', function(err, result) {
      if (err) {
        alert('Error: ' + err.message);
      } else {
        alert('Peer test result: ' + JSON.stringify(result));
      }
    });
  }
  
  function repairTorrents() {
    setLoading(true);
    Meteor.call('debug.repairTorrents', function(err, result) {
      setLoading(false);
      if (err) {
        console.error('Repair error:', err);
        alert('Error repairing torrents: ' + err.message);
      } else {
        console.log('Repair result:', result);
        alert(`Repair completed:\n- Added ${result.added.length} torrents to client\n- Saved ${result.saved.length} torrents to database`);
      }
    });
  }
  
  function testTrackerConnectivity(){
    Meteor.call('debug.checkTorrentConnection', selectedTorrentHash, function(err, result) {
      if (err) {
        console.error('Error checking tracker connectivity:', err);
        alert('Error checking tracker connectivity: ' + err.message);
      } else {
        console.log('Tracker connectivity:', result);
        alert('Tracker connectivity: ' + result);
      }
    });
  }
  
  function testTorrentFiles(){
    // First get a list of torrents
    Meteor.call('debug.getTorrentInfo', function(err, result) {
      if (err) {
        console.error('Error getting torrent info:', err);
        alert('Error checking torrents: ' + err.message);
        return;
      }
      
      const clientTorrents = result.clientTorrents || [];
      if (clientTorrents.length === 0) {
        alert('No torrents found in client. Add a torrent first.');
        return;
      }
      
      // Use the first torrent's infoHash from the result
      const firstTorrentHash = clientTorrents[0].infoHash;
      console.log('Testing torrent files for:', firstTorrentHash);
      
      // Now get full status for this torrent
      Meteor.call('debug.fullTorrentStatus', firstTorrentHash, function(statusErr, statusResult) {
        if (statusErr) {
          console.error('Error getting torrent status:', statusErr);
          alert('Error testing torrent: ' + statusErr.message);
        } else {
          console.log('Full torrent status:', statusResult);
          
          // Show detailed results
          let message = `Torrent Status for ${statusResult.database.name || firstTorrentHash}\n\n`;
          message += `Database Record: ${statusResult.database.exists ? 'Found' : 'Missing'}\n`;
          message += `Client Instance: ${statusResult.client.exists ? 'Found' : 'Missing'}\n`;
          message += `Progress: ${statusResult.client.progress ? (statusResult.client.progress * 100).toFixed(2) + '%' : 'Unknown'}\n`;
          message += `Peers: ${statusResult.client.numPeers || 0}\n`;
          message += `Storage Path: ${statusResult.storage.path}\n`;
          message += `Storage Exists: ${statusResult.storage.exists ? 'Yes' : 'No'}\n`;
          message += `Storage Writable: ${statusResult.storage.writable ? 'Yes' : 'No'}\n`;
          message += `Files Found On Disk: ${statusResult.files.exist ? 'Yes' : 'No'}\n\n`;
          
          if (statusResult.files.info.length > 0) {
            message += 'Files:\n';
            statusResult.files.info.forEach(file => {
              message += `- ${file.name}: ${file.exists ? 'Exists' : 'Missing'} (${file.size} bytes)\n`;
            });
          } else {
            message += 'No files found in torrent';
          }
          
          alert(message);
          
          // If no files were found, try to actively load the torrent and check again
          if (!statusResult.files.exist) {
            if (confirm('No files found for this torrent. Would you like to try force-loading it?')) {
              Meteor.call('debug.repairTorrents', function(repairErr, repairResult) {
                if (repairErr) {
                  alert('Error repairing: ' + repairErr.message);
                } else {
                  alert('Repair attempted. Check console for details.');
                  console.log('Repair result:', repairResult);
                }
              });
            }
          }
        }
      });
    });
  }
  
  function testFileRetrieval() {
    // First get a list of torrents
    Meteor.call('debug.getTorrentInfo', function(err, result) {
      if (err) {
        console.error('Error getting torrent info:', err);
        alert('Error checking torrents: ' + err.message);
        return;
      }
      
      const clientTorrents = result.clientTorrents || [];
      if (clientTorrents.length === 0) {
        alert('No torrents found in client. Add a torrent first.');
        return;
      }
      
      // Use the first torrent's infoHash from the result
      const firstTorrentHash = clientTorrents[0].infoHash;
      console.log('Testing file retrieval for torrent:', firstTorrentHash);
      
      // Test file retrieval
      Meteor.call('debug.testFileRetrieval', firstTorrentHash, function(testErr, testResult) {
        if (testErr) {
          console.error('Error testing file retrieval:', testErr);
          alert('Error testing file retrieval: ' + testErr.message);
        } else {
          console.log('File retrieval test result:', testResult);
          alert(`File retrieval test successful!\n\n` +
                `File: ${testResult.fileName}\n` +
                `Content length: ${testResult.contentLength}\n` +
                `Preview: ${testResult.contentPreview}`);
        }
      });
    });
  }
  
  function createSampleTorrent(){
    Meteor.call('debug.createSampleTorrent', function(err, result) {
      if (err) {
        console.error('Error creating sample torrent:', err);
        alert('Error creating sample torrent: ' + err.message);
      } else {
        console.log('Sample torrent created:', result);
        alert('Sample torrent created!\nInfo hash: ' + result.infoHash);
      }
    });
  }
  
  function checkTorrentsInDatabase(){
    Meteor.call('debug.getTorrentInfo', function(err, result) {
      if (err) {
        console.error('Error checking torrents:', err);
        alert('Error checking torrents: ' + err.message);
      } else {
        console.log('Database torrents:', result.dbTorrents);
        console.log('Client torrents:', result.clientTorrents);
        alert('Database torrents: ' + JSON.stringify(result.clientTorrents, null, 2) + '\n\nClient torrents:' + JSON.stringify(result.clientTorrents, null, 2));
      }
    });
  }
  
  function checkServerStatus() {
    setLoading(true);
    Meteor.call('debug.getServerStatus', function(err, result) {
      setLoading(false);
      if (err) {
        console.error('Debug error:', err);
        alert('Error getting server status: ' + err.message);
      } else {
        console.log('Server Status:', result);
        
        // Format the result for display
        const clientTorrents = result.client.torrents || [];
        const dbTorrents = result.database.torrents || [];
        
        const message = `WebTorrent Client:
          - Initialized: ${result.client.initialized ? 'Yes' : 'No'}
          - Active Torrents: ${clientTorrents.length}
          ${clientTorrents.map(t => `  - ${t.name || 'Unnamed'} (${t.infoHash.substring(0, 8)}...)`).join('\n')}
          
          Database:
          - Torrents: ${dbTorrents.length}
          ${dbTorrents.map(t => `  - ${t.name || 'Unnamed'} (${t.infoHash.substring(0, 8)}...)`).join('\n')}
          
          Subscriptions:
          - Status: ${result.subscription.ready ? 'Ready' : 'Loading'}
          - Count: ${result.subscription.count}
          
          WebTorrent Trackers:
          ${result.client.trackers.join('\n')}
        `;
        
        // Display in a pre-formatted alert or modal
        const debugWindow = window.open('', 'Debug Info', 'width=800,height=600');
        debugWindow.document.write(`<pre>${message}</pre>`);
      }
    });
  }
  
  function fixStoragePath() {
    setLoading(true);
    Meteor.call('debug.fixStoragePath', function(err, result) {
      setLoading(false);
      if (err) {
        console.error('Error fixing storage path:', err);
        alert('Error fixing storage path: ' + err.message);
      } else {
        console.log('Storage path result:', result);
        alert(`Storage path fixed:\n- Path: ${result.storagePath}\n- Path exists: ${result.pathExists}\n- Files created: ${result.filesCreated.join(', ')}\n- Files in directory: ${result.filesInDirectory.join(', ')}`);
      }
    });
  }
  
  function testAllStrategies() {
    // First get a list of torrents
    Meteor.call('debug.getTorrentInfo', function(err, result) {
      if (err) {
        console.error('Error getting torrent info:', err);
        alert('Error checking torrents: ' + err.message);
        return;
      }
      
      const clientTorrents = result.clientTorrents || [];
      if (clientTorrents.length === 0) {
        alert('No torrents found in client. Add a torrent first.');
        return;
      }
      
      const firstTorrentHash = clientTorrents[0].infoHash;
      console.log('Testing all file retrieval strategies for:', firstTorrentHash);
      
      setLoading(true);
      Meteor.call('debug.testFileRetrievalStrategies', firstTorrentHash, function(testErr, testResult) {
        setLoading(false);
        if (testErr) {
          console.error('Error testing strategies:', testErr);
          alert('Error testing strategies: ' + testErr.message);
        } else {
          console.log('Strategy test results:', testResult);
          
          let message = `File Retrieval Strategy Test Results:\n\n`;
          
          Object.keys(testResult.strategies).forEach(strategy => {
            const result = testResult.strategies[strategy];
            message += `${strategy}: ${result.status}\n`;
            if (result.status === 'success') {
              message += `  - Content length: ${result.contentLength}\n`;
              message += `  - Preview: ${result.preview}...\n`;
            } else if (result.status === 'failed') {
              message += `  - Reason: ${result.reason}\n`;
            }
            message += '\n';
          });
          
          alert(message);
        }
      });
    });
  }
  
  return (
    <>
      <Button 
        variant="outlined" 
        color="secondary" 
        onClick={togglePanel}
        sx={{ position: 'fixed', bottom: 10, right: 10, zIndex: 1000 }}
      >
        {isOpen ? 'Hide Debug' : 'Show Debug'}
      </Button>
      
      {isOpen && (
        <Paper 
          sx={{ 
            position: 'fixed', 
            bottom: 60, 
            right: 10, 
            width: 1300, 
            maxHeight: '80vh',
            overflow: 'auto',
            zIndex: 1000,
            p: 2
          }}
        >
          <Typography variant="h6">Debug Panel</Typography>
          
          <Box sx={{ mt: 2 }}>            
            <Button 
              variant="contained" 
              color="primary" 
              onClick={checkServerStatus}
              sx={{ mr: 1 }}
            >
              Server Stats
            </Button>
            <Button 
              variant="contained" 
              color="primary" 
              onClick={repairTorrents}
              disabled={loading}
              sx={{ mr: 1 }}
            >
              Repair
            </Button>
            <Button 
              variant="contained" 
              color="primary" 
              onClick={testTrackerConnectivity}
              disabled={loading}
              sx={{ mr: 1 }}
            >
              Trackers
            </Button>
            <Button 
              variant="contained" 
              color="primary" 
              onClick={checkTorrentsInDatabase}
              disabled={loading}
              sx={{ mr: 1 }}
            >
              DB Torrents
            </Button>
            <Button 
              variant="contained" 
              color="primary" 
              onClick={testTorrentFiles}
              disabled={loading}
              sx={{ mr: 1 }}
            >
              Test Torrents
            </Button> 
            <Button 
              variant="contained" 
              color="primary" 
              onClick={createSampleTorrent}
              disabled={loading}
              sx={{ mr: 1 }}
            >
              Create Sample
            </Button> 
            <Button 
              variant="contained" 
              color="primary" 
              onClick={testFileRetrieval}
              disabled={loading}
              sx={{ mr: 1 }}
            >
              Test Retrieval
            </Button>  
            <Button 
              variant="contained" 
              color="primary" 
              onClick={fixStoragePath}
              disabled={loading}
              sx={{ mr: 1 }}
            >
              Fix Storage
            </Button>
            <Button 
              variant="contained" 
              color="primary" 
              onClick={testAllStrategies}
              disabled={loading}
              sx={{ mr: 1 }}
            >
              Test All
            </Button>
          </Box>
          
          <Box sx={{ mt: 2 }}>
            <Accordion 
              expanded={expanded === 'status'} 
              onChange={handleAccordionChange('status')}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Application Status</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2">
                  <strong>Meteor Connection:</strong> {runtimeInfo.meteorStatus}<br />
                  <strong>WebTorrent Status:</strong> {runtimeInfo.webTorrentStatus}<br />
                  <strong>Subscriptions:</strong> {runtimeInfo.subscriptions}
                </Typography>
              </AccordionDetails>
            </Accordion>
            
            <Accordion 
              expanded={expanded === 'settings'} 
              onChange={handleAccordionChange('settings')}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Settings</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <pre style={{ overflowX: 'auto' }}>
                  {runtimeInfo.settings}
                </pre>
              </AccordionDetails>
            </Accordion>
            
            <Accordion 
              expanded={expanded === 'errors'} 
              onChange={handleAccordionChange('errors')}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Console Output</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2">
                  Check the browser console (F12) for detailed error messages.
                </Typography>
              </AccordionDetails>
            </Accordion>
          </Box>
        </Paper>
      )}
    </>
  );
}

export default DebugPanel;