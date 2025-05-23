import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import LinkIcon from '@mui/icons-material/Link';
import Snackbar from '@mui/material/Snackbar';

function CreateTorrent() {
  const [magnetUri, setMagnetUri] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Add torrent from magnet URI
  function handleAddMagnet() {
    if (!magnetUri) {
      setError('Please enter a magnet URI.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    Meteor.call('torrents.add', magnetUri, {}, function(err, result) {
      setLoading(false);
      
      if (err) {
        console.error('Error adding torrent:', err);
        setError('Error adding torrent: ' + err.message);
      } else {
        console.log('Torrent added successfully:', result);
        setSuccessMessage('Torrent added successfully: ' + (result.name || result.infoHash));
        setMagnetUri('');
      }
    });
  }
  
  // Close success message
  function handleCloseSuccess() {
    setSuccessMessage('');
  }
  
  return (
    <Paper sx={{ width: '100%', p: 2 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        Add Torrent from Magnet Link
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>
      )}
      
      <Box sx={{ mt: 2 }}>
        <TextField
          label="Magnet URI"
          fullWidth
          value={magnetUri}
          onChange={(e) => setMagnetUri(e.target.value)}
          required
          margin="normal"
          placeholder="magnet:?xt=urn:btih:..."
          helperText="Enter a magnet URI to add an existing torrent"
        />
        
        <Button
          variant="contained"
          color="primary"
          onClick={handleAddMagnet}
          disabled={loading || !magnetUri}
          startIcon={loading ? <CircularProgress size={24} /> : <LinkIcon />}
          sx={{ mt: 2 }}
        >
          Add Torrent
        </Button>
      </Box>
      
      <Snackbar
        open={!!successMessage}
        autoHideDuration={6000}
        onClose={handleCloseSuccess}
        message={successMessage}
      />
    </Paper>
  );
}

export default CreateTorrent;
