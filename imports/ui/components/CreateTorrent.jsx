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

// import React, { useState } from 'react';
// import { Meteor } from 'meteor/meteor';
// import { get } from 'lodash';
// import Paper from '@mui/material/Paper';
// import Typography from '@mui/material/Typography';
// import Box from '@mui/material/Box';
// import TextField from '@mui/material/TextField';
// import Button from '@mui/material/Button';
// import Grid from '@mui/material/Grid';
// import FormControl from '@mui/material/FormControl';
// import FormLabel from '@mui/material/FormLabel';
// import RadioGroup from '@mui/material/RadioGroup';
// import FormControlLabel from '@mui/material/FormControlLabel';
// import Radio from '@mui/material/Radio';
// import Alert from '@mui/material/Alert';
// import CircularProgress from '@mui/material/CircularProgress';
// import AddIcon from '@mui/icons-material/Add';
// import CloudUploadIcon from '@mui/icons-material/CloudUpload';
// import LinkIcon from '@mui/icons-material/Link';
// import Tabs from '@mui/material/Tabs';
// import Tab from '@mui/material/Tab';
// import Snackbar from '@mui/material/Snackbar';

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

// function CreateTorrent() {
//   const [activeTab, setActiveTab] = useState(0);
//   const [torrentName, setTorrentName] = useState('');
//   const [torrentDescription, setTorrentDescription] = useState('');
//   const [fhirType, setFhirType] = useState('bundle');
//   const [selectedFiles, setSelectedFiles] = useState([]);
//   const [magnetUri, setMagnetUri] = useState('');
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState('');
//   const [successMessage, setSuccessMessage] = useState('');
  
//   // Handle tab change
//   function handleTabChange(event, newValue) {
//     setActiveTab(newValue);
//   }
  
//   // Handle file selection
//   function handleFileChange(event) {
//     const files = Array.from(event.target.files);
//     setSelectedFiles(files);
    
//     // If no name set, use first filename
//     if (!torrentName && files.length > 0) {
//       setTorrentName(files[0].name.replace(/\.[^/.]+$/, ""));
//     }
//   }
  
//   // Create torrent from files
//   async function handleCreateTorrent() {
//     if (!torrentName) {
//       setError('Please provide a name for the torrent.');
//       return;
//     }
    
//     if (selectedFiles.length === 0) {
//       setError('Please select at least one file.');
//       return;
//     }
    
//     setLoading(true);
//     setError('');
    
//     try {
//       // Read files and prepare data for the server
//       const fileData = [];
      
//       for (const file of selectedFiles) {
//         const text = await readFileAsText(file);
        
//         // Validate FHIR files
//         const format = FhirUtils.detectFormat(text);
        
//         if (format === 'unknown') {
//           setError(`File ${file.name} doesn't appear to be valid FHIR content.`);
//           setLoading(false);
//           return;
//         }
        
//         // Make sure format matches selected type
//         if (fhirType === 'bundle' && format !== 'bundle') {
//           setError(`File ${file.name} is not a FHIR Bundle but you selected Bundle type.`);
//           setLoading(false);
//           return;
//         }
        
//         if (fhirType === 'ndjson' && format !== 'ndjson') {
//           setError(`File ${file.name} is not NDJSON but you selected NDJSON type.`);
//           setLoading(false);
//           return;
//         }
        
//         fileData.push({
//           name: file.name,
//           data: text
//         });
//       }
      
//       // Call server method to create torrent
//       Meteor.call('torrents.create', torrentName, fileData, {
//         description: torrentDescription,
//         fhirType: fhirType
//       }, function(err, result) {
//         setLoading(false);
        
//         if (err) {
//           setError('Error creating torrent: ' + err.message);
//         } else {
//           setSuccessMessage('Torrent created successfully! Magnet URI: ' + result.magnetURI);
//           // Reset form
//           setTorrentName('');
//           setTorrentDescription('');
//           setSelectedFiles([]);
//         }
//       });
//     } catch (err) {
//       setLoading(false);
//       setError('Error creating torrent: ' + err.message);
//     }
//   }
  
//   // Add torrent from magnet URI
//   function handleAddMagnet() {
//     if (!magnetUri) {
//       setError('Please enter a magnet URI.');
//       return;
//     }
    
//     setLoading(true);
//     setError('');
    
//     Meteor.call('torrents.add', magnetUri, {}, function(err, result) {
//       setLoading(false);
      
//       if (err) {
//         setError('Error adding torrent: ' + err.message);
//       } else {
//         setSuccessMessage('Torrent added successfully!');
//         setMagnetUri('');
//       }
//     });
//   }
  
//   // Helper to read file as text
//   function readFileAsText(file) {
//     return new Promise(function(resolve, reject) {
//       const reader = new FileReader();
//       reader.onload = function(e) {
//         resolve(e.target.result);
//       };
//       reader.onerror = function(e) {
//         reject(e);
//       };
//       reader.readAsText(file);
//     });
//   }
  
//   // Close success message
//   function handleCloseSuccess() {
//     setSuccessMessage('');
//   }
  
//   return (
//     <Paper sx={{ width: '100%', p: 2 }}>
//       <Typography variant="h6" component="h2" gutterBottom>
//         Create/Add Torrent
//       </Typography>
      
//       <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
//         <Tabs value={activeTab} onChange={handleTabChange} aria-label="create torrent tabs">
//           <Tab icon={<AddIcon />} label="Create" {...a11yProps(0)} />
//           <Tab icon={<LinkIcon />} label="Add from Magnet" {...a11yProps(1)} />
//         </Tabs>
//       </Box>
      
//       {error && (
//         <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
//       )}
      
//       <TabPanel value={activeTab} index={0}>
//         <Grid container spacing={2}>
//           <Grid item xs={12} md={6}>
//             <TextField
//               label="Torrent Name"
//               fullWidth
//               value={torrentName}
//               onChange={(e) => setTorrentName(e.target.value)}
//               required
//               margin="normal"
//             />
//           </Grid>
          
//           <Grid item xs={12} md={6}>
//             <FormControl component="fieldset" margin="normal">
//               <FormLabel component="legend">FHIR Format</FormLabel>
//               <RadioGroup 
//                 row 
//                 value={fhirType} 
//                 onChange={(e) => setFhirType(e.target.value)}
//               >
//                 <FormControlLabel value="bundle" control={<Radio />} label="Bundle" />
//                 <FormControlLabel value="ndjson" control={<Radio />} label="NDJSON" />
//               </RadioGroup>
//             </FormControl>
//           </Grid>
          
//           <Grid item xs={12}>
//             <TextField
//               label="Description"
//               fullWidth
//               multiline
//               rows={2}
//               value={torrentDescription}
//               onChange={(e) => setTorrentDescription(e.target.value)}
//               margin="normal"
//             />
//           </Grid>
          
//           <Grid item xs={12}>
//             <Button
//               variant="contained"
//               component="label"
//               startIcon={<CloudUploadIcon />}
//               sx={{ mt: 1 }}
//             >
//               Select Files
//               <input
//                 type="file"
//                 multiple
//                 onChange={handleFileChange}
//                 hidden
//               />
//             </Button>
//             <Box sx={{ mt: 1 }}>
//               {selectedFiles.length > 0 ? (
//                 <Typography variant="body2">
//                   Selected {selectedFiles.length} file(s): {selectedFiles.map(f => f.name).join(', ')}
//                 </Typography>
//               ) : (
//                 <Typography variant="body2" color="text.secondary">
//                   No files selected
//                 </Typography>
//               )}
//             </Box>
//           </Grid>
          
//           <Grid item xs={12}>
//             <Button
//               variant="contained"
//               color="primary"
//               onClick={handleCreateTorrent}
//               disabled={loading || selectedFiles.length === 0}
//               startIcon={loading ? <CircularProgress size={24} /> : <AddIcon />}
//             >
//               Create Torrent
//             </Button>
//           </Grid>
//         </Grid>
//       </TabPanel>
      
//       <TabPanel value={activeTab} index={1}>
//         <Grid container spacing={2}>
//           <Grid item xs={12}>
//             <TextField
//               label="Magnet URI"
//               fullWidth
//               value={magnetUri}
//               onChange={(e) => setMagnetUri(e.target.value)}
//               required
//               margin="normal"
//               placeholder="magnet:?xt=urn:btih:..."
//             />
//           </Grid>
          
//           <Grid item xs={12}>
//             <Button
//               variant="contained"
//               color="primary"
//               onClick={handleAddMagnet}
//               disabled={loading || !magnetUri}
//               startIcon={loading ? <CircularProgress size={24} /> : <LinkIcon />}
//             >
//               Add Torrent
//             </Button>
//           </Grid>
//         </Grid>
//       </TabPanel>
      
//       <Snackbar
//         open={!!successMessage}
//         autoHideDuration={6000}
//         onClose={handleCloseSuccess}
//         message={successMessage}
//       />
//     </Paper>
//   );
// }

// export default CreateTorrent;