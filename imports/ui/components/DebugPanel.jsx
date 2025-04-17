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
import { WebTorrentClient } from '../../api/torrents/webtorrent-client';

// Debug component to display application state and troubleshoot issues
function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [runtimeInfo, setRuntimeInfo] = useState({
    meteorStatus: 'Checking...',
    webTorrentStatus: 'Checking...',
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
    
    // Check WebTorrent status
    try {
      const client = WebTorrentClient.getClient();
      setRuntimeInfo(prev => ({
        ...prev,
        webTorrentStatus: client ? 
          `Initialized (PeerId: ${client.peerId || 'unknown'})` : 
          'Not initialized'
      }));
    } catch (error) {
      setRuntimeInfo(prev => ({
        ...prev,
        webTorrentStatus: `Error: ${error.message}`
      }));
    }
    
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
    Meteor.call('ping', function(error, result) {
      if (error) {
        alert(`Server connection error: ${error.message}`);
      } else {
        alert(`Server responded: ${result}`);
      }
    });
  }
  
  // Retry WebTorrent initialization
  function retryWebTorrent() {
    try {
      WebTorrentClient.initialize().then(function(client) {
        alert(`WebTorrent initialized successfully! PeerId: ${client ? client.peerId : 'unknown'}`);
        // Update status
        setRuntimeInfo(prev => ({
          ...prev,
          webTorrentStatus: client ? 
            `Initialized (PeerId: ${client.peerId || 'unknown'})` : 
            'Not initialized'
        }));
      }).catch(function(err) {
        alert(`WebTorrent initialization failed: ${err.message}`);
      });
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
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
            width: 400, 
            maxHeight: '80vh',
            overflow: 'auto',
            zIndex: 1000,
            p: 2
          }}
        >
          <Typography variant="h6">Debug Panel</Typography>
          
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" color="primary" onClick={testConnection} sx={{ mr: 1 }}>
              Test Server
            </Button>
            <Button variant="contained" color="primary" onClick={retryWebTorrent}>
              Retry WebTorrent
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