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
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';

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
  
  // Fetch file contents when torrent is selected
  useEffect(function() {
    if (!selectedTorrent) {
      setFileContents({});
      return;
    }
    
    setLoading(true);
    setError('');
    
    console.log(`Fetching file contents for torrent: ${selectedTorrent.infoHash}`);
    
    Meteor.call('torrents.getAllFileContents', selectedTorrent.infoHash, function(err, result) {
      setLoading(false);
      
      if (err) {
        console.error("Error fetching file contents:", err);
        // More detailed error message
        const errorDetails = err.details ? `\nDetails: ${err.details}` : '';
        const errorCode = err.error ? `\nCode: ${err.error}` : '';
        setError(`Error loading files: ${err.message || err.reason || 'Unknown error'}${errorCode}${errorDetails}`);
        
        // Try to get server status in case of error
        Meteor.call('debug.getServerStatus', function(statusErr, statusResult) {
          if (!statusErr && statusResult) {
            console.log('Server status:', statusResult);
          }
        });
      } else {
        if (result && Object.keys(result).length > 0) {
          console.log(`Received ${Object.keys(result).length} files from server`);
          setFileContents(result);
          setActiveTab(0); // Reset to first tab when new content loads
        } else {
          console.log(`Received empty result for torrent ${selectedTorrent.infoHash}`);
          setError('No files found or files are still downloading');
        }
      }
    });
  }, [selectedTorrent]);
  
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
  
  return (
    <Box sx={{ width: '100%' }}>
      {error && (
        <Alert severity="error" sx={{ m: 2 }}>
          {error}
        </Alert>
      )}
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
            Loading file contents...
          </Typography>
        </Box>
      ) : filenames.length === 0 ? (
        <Box sx={{ p: 2 }}>
          <Alert severity="info">
            No files found in this torrent or files are still downloading.
          </Alert>
        </Box>
      ) : (
        <Box>
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
                  label={filename} 
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
                  <Typography variant="h6" component="h3">
                    {filename}
                  </Typography>
                  <Button
                    startIcon={<CloudDownloadIcon />}
                    onClick={() => downloadFile(filename, content)}
                    variant="outlined"
                    size="small"
                  >
                    Download
                  </Button>
                </Box>

                {error && (
                  <>
                    <Alert severity="error" sx={{ m: 2 }}>
                      {error}
                    </Alert>
                    <MetadataDebugPanel 
                      torrentHash={selectedTorrent.infoHash} 
                      torrentName={selectedTorrent.name} 
                    />
                  </>
                )}
                
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
    </Box>
  );
}

export default DataViewer;