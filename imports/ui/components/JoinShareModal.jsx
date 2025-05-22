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
import LinearProgress from '@mui/material/LinearProgress';
import { alpha } from '@mui/material/styles';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import LinkIcon from '@mui/icons-material/Link';
import SearchIcon from '@mui/icons-material/Search';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

function JoinShareModal({ open, onClose }) {
  const [magnetUri, setMagnetUri] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [joinStep, setJoinStep] = useState('input'); // 'input', 'joining', 'success'
  
  // Handle close and reset
  function handleClose() {
    setMagnetUri('');
    setError('');
    setSuccess('');
    setJoinStep('input');
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
    setJoinStep('joining');
    
    Meteor.call('torrents.add', magnetUri, {}, function(err, result) {
      setLoading(false);
      
      if (err) {
        console.error('Error joining share:', err);
        setError('Error joining share: ' + err.message);
        setJoinStep('input');
      } else {
        console.log('Successfully joined share:', result);
        setSuccess(`Successfully joined share: ${result.name || result.infoHash}`);
        setJoinStep('success');
        
        // Auto-close after success
        setTimeout(function() {
          handleClose();
        }, 3000);
      }
    });
  }
  
  // Handle input change
  function handleInputChange(event) {
    setMagnetUri(event.target.value);
    setError('');
    setSuccess('');
  }
  
  // Render content based on current step
  function renderContent() {
    switch (joinStep) {
      case 'joining':
        return (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={48} sx={{ mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Joining Share...
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Adding torrent to your client and connecting to peers
            </Typography>
            <LinearProgress sx={{ mt: 2 }} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              This may take a moment while we connect to the network
            </Typography>
          </Box>
        );
        
      case 'success':
        return (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircleIcon color="success" sx={{ fontSize: 48, mb: 2 }} />
            <Typography variant="h6" gutterBottom color="success.main">
              Successfully Joined!
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {success}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              The share will appear in your "My Shares" list. 
              It may take a moment to download the content from peers.
            </Typography>
          </Box>
        );
        
      default: // 'input'
        return (
          <>
            <Typography variant="body1" color="text.secondary" gutterBottom>
              Enter a magnet link or share URL to connect to an existing FHIR data share.
            </Typography>
            
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
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
                💡 Tip: The share will be added immediately, but content may take time to download from peers.
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
          </>
        );
    }
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
        {renderContent()}
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 3 }}>
        {joinStep === 'input' && (
          <>
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
          </>
        )}
        
        {joinStep === 'joining' && (
          <Button 
            onClick={handleClose} 
            color="error"
          >
            Cancel
          </Button>
        )}
        
        {joinStep === 'success' && (
          <Button 
            variant="contained"
            onClick={handleClose}
          >
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default JoinShareModal;