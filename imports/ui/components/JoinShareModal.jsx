import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import { alpha } from '@mui/material/styles';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import SearchIcon from '@mui/icons-material/Search';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';

function JoinShareModal({ open, onClose }) {
  const [magnetUri, setMagnetUri] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Handle close and reset
  function handleClose() {
    setMagnetUri('');
    setError('');
    setSuccess('');
    onClose();
  }
  
  // Handle paste from clipboard
  async function handlePasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('magnet:') || text.startsWith('http'))) {
        setMagnetUri(text);
        setError('');
      } else {
        setError('Clipboard doesn\'t contain a valid magnet link or URL.');
      }
    } catch (err) {
      setError('Unable to read from clipboard. Please paste manually.');
    }
  }
  
  // Handle join share
  function handleJoinShare() {
    if (!magnetUri.trim()) {
      setError('Please enter a magnet URI or share URL.');
      return;
    }
    
    // Basic validation
    if (!magnetUri.startsWith('magnet:') && !magnetUri.startsWith('http')) {
      setError('Please enter a valid magnet URI (starts with magnet:) or URL.');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    Meteor.call('torrents.add', magnetUri, {}, function(err, result) {
      setLoading(false);
      
      if (err) {
        console.error('Error joining share:', err);
        setError('Error joining share: ' + err.message);
      } else {
        console.log('Successfully joined share:', result);
        setSuccess(`Successfully joined share: ${result.name || result.infoHash}`);
        
        // Auto-close after success
        setTimeout(function() {
          handleClose();
        }, 2000);
      }
    });
  }
  
  // Handle input change
  function handleInputChange(event) {
    setMagnetUri(event.target.value);
    setError('');
    setSuccess('');
  }
  
  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        pb: 1
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LinkIcon color="primary" />
          <Typography variant="h6" component="h2">
            Join Existing Share
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ px: 3 }}>
        <Typography variant="body1" color="text.secondary" gutterBottom>
          Enter a magnet link or share URL to connect to an existing FHIR data share.
        </Typography>
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {success}
          </Alert>
        )}
        
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              label="Magnet URI or Share URL"
              fullWidth
              value={magnetUri}
              onChange={handleInputChange}
              placeholder="magnet:?xt=urn:btih:... or https://..."
              disabled={loading}
              multiline
              maxRows={3}
              sx={{
                '& .MuiInputBase-input': {
                  fontFamily: 'monospace',
                  fontSize: '0.875rem'
                }
              }}
            />
            <Button
              variant="outlined"
              onClick={handlePasteFromClipboard}
              disabled={loading}
              sx={{ minWidth: 'auto', px: 2 }}
              title="Paste from clipboard"
            >
              <ContentPasteIcon />
            </Button>
          </Box>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            💡 Tip: You can paste a magnet link or share URL from your clipboard using the paste button.
          </Typography>
        </Box>
        
        {/* Future: Browse public shares section */}
        <Paper 
          sx={{ 
            p: 3, 
            mt: 3,
            backgroundColor: (theme) => alpha(theme.palette.info.main, 0.05),
            border: (theme) => `1px solid ${alpha(theme.palette.info.main, 0.2)}`
          }}
          elevation={0}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <SearchIcon color="info" />
            <Typography variant="subtitle1" color="info.main">
              Browse Public Shares
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Discover publicly available FHIR data shares from the community.
          </Typography>
          <Button 
            variant="outlined" 
            color="info" 
            size="small"
            disabled
            sx={{ mt: 1 }}
          >
            Coming Soon
          </Button>
        </Paper>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button 
          onClick={handleClose} 
          disabled={loading}
        >
          Cancel
        </Button>
        
        <Button 
          variant="contained" 
          onClick={handleJoinShare}
          disabled={loading || !magnetUri.trim()}
          startIcon={loading ? <CircularProgress size={20} /> : <LinkIcon />}
        >
          {loading ? 'Joining...' : 'Join Share'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default JoinShareModal;