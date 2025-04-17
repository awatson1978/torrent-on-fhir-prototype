import React, { useState, useEffect } from 'react';
import { get } from 'lodash';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Button from '@mui/material/Button';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import TextField from '@mui/material/TextField';

import { WebTorrentClient } from '../../api/torrents/webtorrent-client';
import { FhirUtils } from '../../api/fhir/fhir-utils';

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index) {
  return {
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  };
}

function DataViewer({ selectedTorrent }) {
  const [fileContents, setFileContents] = useState({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [viewFormat, setViewFormat] = useState('original');
  
  // Fetch file contents when torrent is selected
  useEffect(function() {
    let mounted = true;
    
    async function fetchFileContents() {
      if (!selectedTorrent) {
        return;
      }
      
      setLoading(true);
      
      const torrent = WebTorrentClient.getTorrent(selectedTorrent.infoHash);
      if (!torrent) {
        setLoading(false);
        return;
      }
      
      try {
        // Read contents of all files
        const contents = {};
        
        // Wait for all files to be fetched
        const promises = torrent.files.map(function(file) {
          return new Promise(function(resolve) {
            file.getBuffer(function(err, buffer) {
              if (err) {
                console.error("Error reading file:", err);
                contents[file.name] = "Error reading file: " + err.message;
              } else {
                try {
                  // Try to decode as UTF-8 text
                  const text = new TextDecoder('utf-8').decode(buffer);
                  contents[file.name] = text;
                } catch (e) {
                  contents[file.name] = "Binary data (not displayable)";
                }
              }
              resolve();
            });
          });
        });
        
        await Promise.all(promises);
        
        if (mounted) {
          setFileContents(contents);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error fetching file contents:", err);
        if (mounted) {
          setLoading(false);
        }
      }
    }
    
    fetchFileContents();
    
    return function() {
      mounted = false;
    };
  }, [selectedTorrent]);
  
  // Handle tab change
  function handleTabChange(event, newValue) {
    setActiveTab(newValue);
  }
  
  // Handle format change
  function handleFormatChange(event, newFormat) {
    if (newFormat !== null) {
      setViewFormat(newFormat);
    }
  }
  
  // Convert content based on selected format
  function formatContent(content, filename) {
    if (!content) return '';
    
    if (viewFormat === 'original') {
      return content;
    }
    
    // Detect the format
    const format = FhirUtils.detectFormat(content);
    
    if (viewFormat === 'json' && format === 'ndjson') {
      // Convert NDJSON to JSON Bundle
      const bundle = FhirUtils.ndjsonToBundle(content);
      return JSON.stringify(bundle, null, 2);
    }
    
    if (viewFormat === 'ndjson' && format === 'bundle') {
      // Convert Bundle to NDJSON
      try {
        const jsonObj = JSON.parse(content);
        return FhirUtils.bundleToNdjson(jsonObj);
      } catch (e) {
        return content;
      }
    }
    
    return content;
  }
  
  // Download the current file
  function downloadFile() {
    if (!selectedTorrent) return;
    
    const filenames = Object.keys(fileContents);
    if (filenames.length === 0 || activeTab >= filenames.length) return;
    
    const filename = filenames[activeTab];
    const content = formatContent(fileContents[filename], filename);
    
    // Create download link
    const element = document.createElement('a');
    const file = new Blob([content], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
  
  // Detect language for syntax highlighting
  function detectLanguage(content) {
    try {
      JSON.parse(content);
      return 'json';
    } catch (e) {
      // Check if it's NDJSON
      const lines = content.trim().split('\n');
      if (lines.length > 0) {
        try {
          JSON.parse(lines[0]);
          return 'json';
        } catch (e) {
          // Not JSON or NDJSON
        }
      }
    }
    return 'plaintext';
  }
  
  // If no torrent is selected
  if (!selectedTorrent) {
    return (
      <Paper sx={{ width: '100%', p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Data Viewer
        </Typography>
        <Typography variant="body1">
          Select a torrent to view its contents.
        </Typography>
      </Paper>
    );
  }
  
  // File tabs
  const filenames = Object.keys(fileContents);
  
  return (
    <Paper sx={{ width: '100%', mb: 2 }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2 }}>
        <Typography variant="h6" component="h2">
          {selectedTorrent.name} Contents
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ToggleButtonGroup
            value={viewFormat}
            exclusive
            onChange={handleFormatChange}
            size="small"
          >
            <ToggleButton value="original">Original</ToggleButton>
            <ToggleButton value="json">JSON</ToggleButton>
            <ToggleButton value="ndjson">NDJSON</ToggleButton>
          </ToggleButtonGroup>
          
          <Button 
            startIcon={<CloudDownloadIcon />} 
            onClick={downloadFile}
            disabled={filenames.length === 0}
            size="small"
          >
            Download
          </Button>
        </Box>
      </Box>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : filenames.length === 0 ? (
        <Box sx={{ p: 2 }}>
          <Typography variant="body1">
            No files found in this torrent or still downloading.
          </Typography>
        </Box>
      ) : (
        <>
          <Tabs value={activeTab} onChange={handleTabChange} aria-label="file tabs">
            {filenames.map((filename, index) => (
              <Tab key={filename} label={filename} {...a11yProps(index)} />
            ))}
          </Tabs>
          
          {filenames.map((filename, index) => (
            <TabPanel key={filename} value={activeTab} index={index}>
              <Box sx={{ height: '60vh' }}>
                <TextField
                  multiline
                  fullWidth
                  variant="outlined"
                  value={formatContent(fileContents[filename], filename)}
                  InputProps={{
                    style: { 
                      fontFamily: 'monospace',
                      fontSize: '0.875rem',
                      whiteSpace: 'pre',
                      overflowX: 'auto'
                    }
                  }}
                  sx={{ 
                    '& .MuiOutlinedInput-root': {
                      height: '100%',
                      '& > textarea': {
                        height: '100% !important'
                      }
                    }
                  }}
                />
              </Box>
            </TabPanel>
          ))}
        </>
      )}
    </Paper>
  );
}

export default DataViewer;

