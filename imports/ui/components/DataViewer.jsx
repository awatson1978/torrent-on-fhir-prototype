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
      <Paper sx={{ width: '100%', p: 2 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Data Viewer
        </Typography>
        <Alert severity="info">
          Select a torrent from the list above to view its contents.
        </Alert>
      </Paper>
    );
  }
  
  const filenames = Object.keys(fileContents);
  
  return (
    <Paper sx={{ width: '100%', mb: 2, p: 2 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        {selectedTorrent.name} Contents
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : filenames.length === 0 ? (
        <Alert severity="info">
          No files found in this torrent or files are still downloading.
        </Alert>
      ) : (
        <>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs 
              value={activeTab} 
              onChange={handleTabChange} 
              variant="scrollable"
              scrollButtons="auto"
            >
              {filenames.map((filename, index) => (
                <Tab key={filename} label={filename} id={`file-tab-${index}`} />
              ))}
            </Tabs>
          </Box>
          
          {filenames.map((filename, index) => {
            const content = fileContents[filename] || '';
            
            return (
              <Paper sx={{ width: '100%', mb: 2, p: 2 }}>
                <Typography variant="h6" component="h2" gutterBottom>
                  {selectedTorrent.name} Contents
                </Typography>
                
                {error && (
                  <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
                )}
                
                {loading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                  </Box>
                ) : filenames.length === 0 ? (
                  <Alert severity="info">
                    No files found in this torrent or files are still downloading.
                  </Alert>
                ) : (
                  // Rest of your file display code
                  <TabPanel key={filename} value={activeTab} index={index}>
                    <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
                      <Button
                        startIcon={<CloudDownloadIcon />}
                        onClick={() => downloadFile(filename, content)}
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
                          whiteSpace: 'pre',
                          maxHeight: '60vh',
                          overflowY: 'auto'
                        }
                      }}
                    />
                  </TabPanel>
                )}
              </Paper>
            );
          })}
        </>
      )}
    </Paper>
  );
}

export default DataViewer;
// import React, { useState, useEffect } from 'react';
// import { Meteor } from 'meteor/meteor';
// import { get } from 'lodash';
// import Paper from '@mui/material/Paper';
// import Typography from '@mui/material/Typography';
// import CircularProgress from '@mui/material/CircularProgress';
// import Box from '@mui/material/Box';
// import Tabs from '@mui/material/Tabs';
// import Tab from '@mui/material/Tab';
// import Button from '@mui/material/Button';
// import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
// import ToggleButton from '@mui/material/ToggleButton';
// import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
// import TextField from '@mui/material/TextField';
// import Alert from '@mui/material/Alert';

// import { FhirUtils } from '../../api/fhir/fhir-utils';

// function TabPanel(props) {
//   const { children, value, index, ...other } = props;

//   return (
//     <div
//       role="tabpanel"
//       hidden={value !== index}
//       id={`simple-tabpanel-${index}`}
//       aria-labelledby={`simple-tab-${index}`}
//       {...other}
//     >
//       {value === index && (
//         <Box sx={{ p: 3 }}>
//           {children}
//         </Box>
//       )}
//     </div>
//   );
// }

// function a11yProps(index) {
//   return {
//     id: `simple-tab-${index}`,
//     'aria-controls': `simple-tabpanel-${index}`,
//   };
// }

// function DataViewer({ selectedTorrent }) {
//   const [fileContents, setFileContents] = useState({});
//   const [loading, setLoading] = useState(false);
//   const [activeTab, setActiveTab] = useState(0);
//   const [viewFormat, setViewFormat] = useState('original');
//   const [error, setError] = useState('');
  
//   // Fetch file contents when torrent is selected
//   useEffect(function() {
//     let mounted = true;
    
//     async function fetchFileContents() {
//       if (!selectedTorrent) {
//         return;
//       }
      
//       setLoading(true);
//       setError('');
      
//       try {
//         // Get all file contents from server
//         Meteor.call('torrents.getAllFileContents', selectedTorrent.infoHash, function(err, result) {
//           if (!mounted) return;
          
//           setLoading(false);
          
//           if (err) {
//             console.error("Error fetching file contents:", err);
//             setError(`Error loading files: ${err.message}`);
//           } else {
//             setFileContents(result);
//           }
//         });
//       } catch (err) {
//         console.error("Error fetching file contents:", err);
//         if (mounted) {
//           setLoading(false);
//           setError(`Error: ${err.message}`);
//         }
//       }
//     }
    
//     fetchFileContents();
    
//     return function() {
//       mounted = false;
//     };
//   }, [selectedTorrent]);
  
//   // Handle tab change
//   function handleTabChange(event, newValue) {
//     setActiveTab(newValue);
//   }
  
//   // Handle format change
//   function handleFormatChange(event, newFormat) {
//     if (newFormat !== null) {
//       setViewFormat(newFormat);
//     }
//   }
  
//   // Convert content based on selected format
//   function formatContent(content, filename) {
//     if (!content) return '';
    
//     if (viewFormat === 'original') {
//       return content;
//     }
    
//     // Detect the format
//     const format = FhirUtils.detectFormat(content);
    
//     if (viewFormat === 'json' && format === 'ndjson') {
//       // Convert NDJSON to JSON Bundle
//       const bundle = FhirUtils.ndjsonToBundle(content);
//       return JSON.stringify(bundle, null, 2);
//     }
    
//     if (viewFormat === 'ndjson' && format === 'bundle') {
//       // Convert Bundle to NDJSON
//       try {
//         const jsonObj = JSON.parse(content);
//         return FhirUtils.bundleToNdjson(jsonObj);
//       } catch (e) {
//         return content;
//       }
//     }
    
//     return content;
//   }
  
//   // Download the current file
//   function downloadFile() {
//     if (!selectedTorrent) return;
    
//     const filenames = Object.keys(fileContents);
//     if (filenames.length === 0 || activeTab >= filenames.length) return;
    
//     const filename = filenames[activeTab];
//     const content = formatContent(fileContents[filename], filename);
    
//     // Create download link
//     const element = document.createElement('a');
//     const file = new Blob([content], {type: 'text/plain'});
//     element.href = URL.createObjectURL(file);
//     element.download = filename;
//     document.body.appendChild(element);
//     element.click();
//     document.body.removeChild(element);
//   }
  
//   // If no torrent is selected
//   if (!selectedTorrent) {
//     return (
//       <Paper sx={{ width: '100%', p: 2 }}>
//         <Typography variant="h6" component="h2" gutterBottom>
//           Data Viewer
//         </Typography>
//         <Typography variant="body1">
//           Select a torrent to view its contents.
//         </Typography>
//       </Paper>
//     );
//   }
  
//   // File tabs
//   const filenames = Object.keys(fileContents);
  
//   return (
//     <Paper sx={{ width: '100%', mb: 2 }}>
//       <Box sx={{ borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2 }}>
//         <Typography variant="h6" component="h2">
//           {selectedTorrent.name} Contents
//         </Typography>
        
//         <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
//           <ToggleButtonGroup
//             value={viewFormat}
//             exclusive
//             onChange={handleFormatChange}
//             size="small"
//           >
//             <ToggleButton value="original">Original</ToggleButton>
//             <ToggleButton value="json">JSON</ToggleButton>
//             <ToggleButton value="ndjson">NDJSON</ToggleButton>
//           </ToggleButtonGroup>
          
//           <Button 
//             startIcon={<CloudDownloadIcon />} 
//             onClick={downloadFile}
//             disabled={filenames.length === 0}
//             size="small"
//           >
//             Download
//           </Button>
//         </Box>
//       </Box>
      
//       {error && (
//         <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
//       )}
      
//       {loading ? (
//         <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
//           <CircularProgress />
//         </Box>
//       ) : filenames.length === 0 ? (
//         <Box sx={{ p: 2 }}>
//           <Typography variant="body1">
//             No files found in this torrent or still downloading.
//           </Typography>
//         </Box>
//       ) : (
//         <>
//           <Tabs value={activeTab} onChange={handleTabChange} aria-label="file tabs">
//             {filenames.map((filename, index) => (
//               <Tab key={filename} label={filename} {...a11yProps(index)} />
//             ))}
//           </Tabs>
          
//           {filenames.map((filename, index) => (
//             <TabPanel key={filename} value={activeTab} index={index}>
//               <Box sx={{ height: '60vh' }}>
//                 <TextField
//                   multiline
//                   fullWidth
//                   variant="outlined"
//                   value={formatContent(fileContents[filename], filename)}
//                   InputProps={{
//                     style: { 
//                       fontFamily: 'monospace',
//                       fontSize: '0.875rem',
//                       whiteSpace: 'pre',
//                       overflowX: 'auto'
//                     }
//                   }}
//                   sx={{ 
//                     '& .MuiOutlinedInput-root': {
//                       height: '100%',
//                       '& > textarea': {
//                         height: '100% !important'
//                       }
//                     }
//                   }}
//                 />
//               </Box>
//             </TabPanel>
//           ))}
//         </>
//       )}
//     </Paper>
//   );
// }

// export default DataViewer;