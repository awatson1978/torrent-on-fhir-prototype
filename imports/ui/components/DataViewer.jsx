// imports/ui/components/DataViewer.jsx - Updated with enhanced metadata debugging

import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import BugReportIcon from '@mui/icons-material/BugReport';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';

import MetadataDebugPanel from './MetadataDebugPanel';

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`file-tabpanel-${index}`}
      aria-labelledby={`file-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 2 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function DataViewer({ selectedTorrent }) {
  const [fileContents, setFileContents] = useState({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState('');
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [autoFixAttempted, setAutoFixAttempted] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  // Fetch file contents when torrent is selected
  useEffect(function() {
    if (!selectedTorrent) {
      setFileContents({});
      setError('');
      setAutoFixAttempted(false);
      setRetryCount(0);
      return;
    }
    
    // Reset state for new torrent
    setError('');
    setAutoFixAttempted(false);
    setRetryCount(0);
    
    fetchFileContents();
  }, [selectedTorrent]);
  
  function fetchFileContents() {
    if (!selectedTorrent) return;
    
    setLoading(true);
    setError('');
    
    console.log(`Fetching file contents for torrent: ${selectedTorrent.infoHash}`);
    
    Meteor.call('torrents.getAllFileContents', selectedTorrent.infoHash, function(err, result) {
      setLoading(false);
      
      if (err) {
        console.error("Error fetching file contents:", err);
        
        // Check if this is a metadata-related error
        const isMetadataError = err.message && (
          err.message.includes('metadata') ||
          err.message.includes('files not available') ||
          err.message.includes('still downloading') ||
          err.error === 'no-content'
        );
        
        if (isMetadataError && !autoFixAttempted) {
          setError(`⚠️ Metadata Issue Detected: ${err.message || err.reason || 'Unknown error'}`);
          setShowDebugPanel(true);
        } else {
          // Regular error or auto-fix already attempted
          const errorDetails = err.details ? `\nDetails: ${err.details}` : '';
          const errorCode = err.error ? `\nCode: ${err.error}` : '';
          setError(`Error loading files: ${err.message || err.reason || 'Unknown error'}${errorCode}${errorDetails}`);
        }
        
      } else {
        if (result && Object.keys(result).length > 0) {
          console.log(`Received ${Object.keys(result).length} files from server`);
          setFileContents(result);
          setActiveTab(0); // Reset to first tab when new content loads
          setError(''); // Clear any previous errors
          setShowDebugPanel(false); // Hide debug panel on success
        } else {
          console.log(`Received empty result for torrent ${selectedTorrent.infoHash}`);
          setError('No files found or files are still downloading - this may be a metadata exchange issue');
          setShowDebugPanel(true);
        }
      }
    });
  }
  
  // Handle tab change
  function handleTabChange(event, newValue) {
    setActiveTab(newValue);
  }
  
  // Download the current file
  function downloadFile(filename, content) {
    const element = document.createElement('a');
    const file = new Blob([content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
  
  // Retry fetching files
  function handleRetry() {
    setRetryCount(prev => prev + 1);
    fetchFileContents();
  }
  
  // If no torrent is selected
  if (!selectedTorrent) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">
          Select a torrent from the list above to view its contents.
        </Alert>
      </Box>
    );
  }
  
  const filenames = Object.keys(fileContents);
  const hasMetadataError = error && (
    error.includes('metadata') || 
    error.includes('not available') || 
    error.includes('still downloading')
  );
  
  return (
    <Box sx={{ width: '100%' }}>
      
      {/* Error Handling with Smart Auto-Fix */}
      {error && (
        <Alert 
          severity={hasMetadataError ? "warning" : "error"} 
          sx={{ m: 2 }}
          action={
            hasMetadataError && !autoFixAttempted ? (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button 
                  color="inherit" 
                  size="small" 
                  startIcon={<AutoFixHighIcon />}
                  onClick={handleAutoFix}
                  disabled={loading}
                >
                  Auto-Fix
                </Button>
                <IconButton
                  color="inherit"
                  size="small"
                  onClick={() => setShowDebugPanel(!showDebugPanel)}
                >
                  <BugReportIcon />
                </IconButton>
              </Box>
            ) : (
              <Button 
                color="inherit" 
                size="small" 
                onClick={handleRetry}
                disabled={loading}
              >
                Retry
              </Button>
            )
          }
        >
          {error}
          {hasMetadataError && !autoFixAttempted && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2">
                💡 This appears to be a metadata exchange issue. Try the Auto-Fix button or use the debug panel for detailed troubleshooting.
              </Typography>
            </Box>
          )}
        </Alert>
      )}
      

      
      {/* Loading State */}
      {loading && (
        <Card sx={{ m: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={24} />
              <Box>
                <Typography variant="body1">
                  {autoFixAttempted ? 'Applying metadata exchange fix...' : 'Loading file contents...'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {autoFixAttempted ? 'This may take up to 2 minutes for the first load' : 'Please wait while we retrieve the data'}
                  {retryCount > 0 && ` (Attempt ${retryCount + 1})`}
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}
      
      {/* Empty State */}
      {!loading && filenames.length === 0 && !error && (
        <Card sx={{ m: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              No Files Available
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              This torrent doesn't have any files available yet. This could be because:
            </Typography>
            <ul>
              <li>The torrent is still downloading metadata from peers</li>
              <li>No peers are available to provide the file information</li>
              <li>There's a network connectivity issue</li>
            </ul>
          </CardContent>
          <CardActions>
            <Button 
              startIcon={<BugReportIcon />}
              onClick={() => setShowDebugPanel(true)}
            >
              Debug This Issue
            </Button>
            <Button onClick={handleRetry}>
              Retry
            </Button>
          </CardActions>
        </Card>
      )}
      
      {/* File Content Display */}
      {!loading && filenames.length > 0 && (
        <Box>
          {/* Success indicator */}
          {autoFixAttempted && (
            <Alert severity="success" sx={{ m: 2 }}>
              🎉 Auto-fix successful! Metadata was retrieved and files are now available.
            </Alert>
          )}
          
          {/* File Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs 
              value={activeTab} 
              onChange={handleTabChange} 
              variant="scrollable"
              scrollButtons="auto"
            >
              {filenames.map((filename, index) => (
                <Tab 
                  key={filename} 
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {filename}
                      <Chip 
                        label={`${(fileContents[filename]?.length || 0)} chars`} 
                        size="small" 
                        variant="outlined"
                      />
                    </Box>
                  }
                  id={`file-tab-${index}`}
                  aria-controls={`file-tabpanel-${index}`}
                />
              ))}
            </Tabs>
          </Box>
          
          {/* File Content Panels */}
          {filenames.map((filename, index) => {
            const content = fileContents[filename] || '';
            
            return (
              <TabPanel key={filename} value={activeTab} index={index}>
                <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="h6" component="h3">
                      {filename}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {content.length.toLocaleString()} characters
                    </Typography>
                  </Box>
                  <Button
                    startIcon={<CloudDownloadIcon />}
                    onClick={() => downloadFile(filename, content)}
                    variant="outlined"
                    size="small"
                  >
                    Download
                  </Button>
                </Box>
                
                <TextField
                  multiline
                  fullWidth
                  variant="outlined"
                  value={content}
                  InputProps={{
                    readOnly: true,
                    style: { 
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      lineHeight: 1.4
                    }
                  }}
                  sx={{ 
                    '& .MuiOutlinedInput-root': {
                      height: '60vh',
                      alignItems: 'flex-start',
                      '& textarea': {
                        height: '100% !important',
                        overflow: 'auto !important',
                        resize: 'none'
                      }
                    }
                  }}
                />
              </TabPanel>
            );
          })}
        </Box>
      )}
      
      {/* Debug Panel Toggle (always available) */}
      {!showDebugPanel && selectedTorrent && (
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<BugReportIcon />}
            onClick={() => setShowDebugPanel(true)}
            sx={{ opacity: 0.7 }}
          >
            Show Debug Panel
          </Button>
        </Box>
      )}

      {/* Enhanced Debug Panel */}
      <Collapse in={showDebugPanel} timeout={300}>
        <MetadataDebugPanel 
          torrentHash={selectedTorrent.infoHash} 
          torrentName={selectedTorrent.name}
        />
      </Collapse>
    </Box>
  );
}

export default DataViewer;