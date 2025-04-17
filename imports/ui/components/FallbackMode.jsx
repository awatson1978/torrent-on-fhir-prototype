// imports/ui/components/FallbackMode.jsx
import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import Grid from '@mui/material/Grid';
import { get } from 'lodash';

/**
 * Fallback Mode Component
 * 
 * Provides limited functionality when WebTorrent cannot be initialized in the browser.
 * Allows interaction with the server-side WebTorrent client.
 */
function FallbackMode({ error }) {
  const [magnetUri, setMagnetUri] = useState('');
  const [actionResult, setActionResult] = useState({ message: '', type: 'info' });
  const [loadingAction, setLoadingAction] = useState(false);
  
  // Handle adding a torrent via the server
  function handleAddTorrent() {
    if (!magnetUri) {
      setActionResult({
        message: 'Please enter a magnet URI',
        type: 'error'
      });
      return;
    }
    
    setLoadingAction(true);
    setActionResult({ message: '', type: 'info' });
    
    Meteor.call('torrents.add', magnetUri, {}, function(err, result) {
      setLoadingAction(false);
      
      if (err) {
        console.error('Error adding torrent:', err);
        setActionResult({
          message: `Error adding torrent: ${err.message}`,
          type: 'error'
        });
      } else {
        setActionResult({
          message: `Torrent added successfully! Info hash: ${result.infoHash}`,
          type: 'success'
        });
        setMagnetUri('');
      }
    });
  }
  
  // Test server connection
  function testServerConnection() {
    setLoadingAction(true);
    setActionResult({ message: 'Testing server connection...', type: 'info' });
    
    Meteor.call('ping', function(err, result) {
      setLoadingAction(false);
      
      if (err) {
        console.error('Server connection error:', err);
        setActionResult({
          message: `Server connection error: ${err.message}`,
          type: 'error'
        });
      } else {
        setActionResult({
          message: `Server connection successful: ${result}`,
          type: 'success'
        });
      }
    });
  }
  
  // Try to initialize WebTorrent again
  function retryWebTorrentInit() {
    window.location.reload();
  }
  
  return (
    <Paper sx={{ p: 3, maxWidth: 800, mx: 'auto', mt: 4 }}>
      <Typography variant="h5" component="h1" gutterBottom>
        Limited Functionality Mode
      </Typography>
      
      <Alert severity="warning" sx={{ mb: 3 }}>
        <Typography variant="body1">
          WebTorrent initialization failed in your browser. Some features will not be available.
        </Typography>
        {error && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            Error: {error}
          </Typography>
        )}
      </Alert>
      
      <Button 
        variant="contained" 
        color="primary" 
        onClick={retryWebTorrentInit}
        sx={{ mb: 3 }}
      >
        Retry WebTorrent Initialization
      </Button>
      
      <Divider sx={{ my: 3 }} />
      
      <Typography variant="h6" gutterBottom>
        Server-side Operations
      </Typography>
      
      <Typography variant="body2" color="text.secondary" paragraph>
        You can still use server-side WebTorrent functionality. The following operations 
        will be performed on the server rather than in your browser.
      </Typography>
      
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          <TextField
            label="Magnet URI"
            placeholder="magnet:?xt=urn:btih:..."
            value={magnetUri}
            onChange={(e) => setMagnetUri(e.target.value)}
            fullWidth
            variant="outlined"
          />
        </Grid>
        <Grid item>
          <Button 
            variant="contained" 
            onClick={handleAddTorrent}
            disabled={loadingAction || !magnetUri}
          >
            Add Torrent
          </Button>
        </Grid>
        <Grid item>
          <Button 
            variant="outlined" 
            onClick={testServerConnection}
            disabled={loadingAction}
          >
            Test Server Connection
          </Button>
        </Grid>
      </Grid>
      
      {actionResult.message && (
        <Alert severity={actionResult.type} sx={{ mt: 2 }}>
          {actionResult.message}
        </Alert>
      )}
      
      <Divider sx={{ my: 3 }} />
      
      <Box sx={{ mt: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Note: WebTorrent functionality requires certain browser features and permissions.
          Some browsers may restrict features that WebTorrent needs, especially in private browsing modes.
        </Typography>
      </Box>
    </Paper>
  );
}

export default FallbackMode;