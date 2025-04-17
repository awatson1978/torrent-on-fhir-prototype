import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import Snackbar from '@mui/material/Snackbar';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import AddIcon from '@mui/icons-material/Add';
import FileUploadIcon from '@mui/icons-material/FileUpload';

import { FhirUtils } from '../../api/fhir/fhir-utils';

function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`fhir-tabpanel-${index}`}
      aria-labelledby={`fhir-tab-${index}`}
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

function a11yProps(index) {
  return {
    id: `fhir-tab-${index}`,
    'aria-controls': `fhir-tabpanel-${index}`,
  };
}

function FhirInput() {
  const [activeTab, setActiveTab] = useState(0);
  const [torrentName, setTorrentName] = useState('');
  const [torrentDescription, setTorrentDescription] = useState('');
  const [fhirType, setFhirType] = useState('bundle');
  const [fhirText, setFhirText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Handle tab change
  function handleTabChange(event, newValue) {
    setActiveTab(newValue);
  }
  
  // Handle file selection
  function handleFileChange(event) {
    const files = Array.from(event.target.files);
    setSelectedFiles(files);
    
    // If no name set, use first filename
    if (!torrentName && files.length > 0) {
      setTorrentName(files[0].name.replace(/\.[^/.]+$/, ""));
    }
  }
  
  // Read file as text
  function readFileAsText(file) {
    return new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onload = function(e) {
        resolve(e.target.result);
      };
      reader.onerror = function(e) {
        reject(e);
      };
      reader.readAsText(file);
    });
  }
  
  // Create torrent from pasted FHIR text
  async function handleCreateFromText() {
    if (!torrentName) {
      setError('Please provide a name for the torrent.');
      return;
    }
    
    if (!fhirText.trim()) {
      setError('Please enter FHIR data.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Validate FHIR format
      const format = FhirUtils.detectFormat(fhirText);
      
      if (format === 'unknown') {
        setError('The text doesn\'t appear to be valid FHIR content.');
        setLoading(false);
        return;
      }
      
      // Make sure format matches selected type
      if (fhirType === 'bundle' && format !== 'bundle') {
        setError('The text is not a FHIR Bundle but you selected Bundle type.');
        setLoading(false);
        return;
      }
      
      if (fhirType === 'ndjson' && format !== 'ndjson') {
        setError('The text is not NDJSON but you selected NDJSON type.');
        setLoading(false);
        return;
      }
      
      // Create a file object with the text content
      const fileData = [{
        name: `${torrentName}.${fhirType === 'bundle' ? 'json' : 'ndjson'}`,
        data: fhirText
      }];
      
      // Call server method to create torrent
      Meteor.call('torrents.create', torrentName, fileData, {
        description: torrentDescription,
        fhirType: fhirType
      }, function(err, result) {
        setLoading(false);
        
        if (err) {
          setError('Error creating torrent: ' + err.message);
        } else {
          setSuccessMessage('Torrent created successfully! Magnet URI: ' + result.magnetURI);
          // Reset form
          setTorrentName('');
          setTorrentDescription('');
          setFhirText('');
        }
      });
    } catch (err) {
      setLoading(false);
      setError('Error creating torrent: ' + err.message);
    }
  }
  
  // Create torrent from uploaded files
  async function handleCreateFromFiles() {
    if (!torrentName) {
      setError('Please provide a name for the torrent.');
      return;
    }
    
    if (selectedFiles.length === 0) {
      setError('Please select at least one file.');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Read files and prepare data for the server
      const fileData = [];
      
      for (const file of selectedFiles) {
        const text = await readFileAsText(file);
        
        // Validate FHIR format
        const format = FhirUtils.detectFormat(text);
        
        if (format === 'unknown') {
          setError(`File ${file.name} doesn't appear to be valid FHIR content.`);
          setLoading(false);
          return;
        }
        
        // Make sure format matches selected type
        if (fhirType === 'bundle' && format !== 'bundle') {
          setError(`File ${file.name} is not a FHIR Bundle but you selected Bundle type.`);
          setLoading(false);
          return;
        }
        
        if (fhirType === 'ndjson' && format !== 'ndjson') {
          setError(`File ${file.name} is not NDJSON but you selected NDJSON type.`);
          setLoading(false);
          return;
        }
        
        fileData.push({
          name: file.name,
          data: text
        });
      }
      
      // Call server method to create torrent
      Meteor.call('torrents.create', torrentName, fileData, {
        description: torrentDescription,
        fhirType: fhirType
      }, function(err, result) {
        setLoading(false);
        
        if (err) {
          setError('Error creating torrent: ' + err.message);
        } else {
          setSuccessMessage('Torrent created successfully! Magnet URI: ' + result.magnetURI);
          // Reset form
          setTorrentName('');
          setTorrentDescription('');
          setSelectedFiles([]);
        }
      });
    } catch (err) {
      setLoading(false);
      setError('Error creating torrent: ' + err.message);
    }
  }
  
  // Close success message
  function handleCloseSuccess() {
    setSuccessMessage('');
  }
  
  return (
    <Paper sx={{ width: '100%', p: 2 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        Create FHIR Torrent
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>
      )}
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={activeTab} onChange={handleTabChange} aria-label="fhir input tabs">
          <Tab label="Paste FHIR Data" {...a11yProps(0)} />
          <Tab label="Upload Files" {...a11yProps(1)} />
        </Tabs>
      </Box>
      
      <Box sx={{ mb: 2 }}>
        <TextField
          label="Torrent Name"
          fullWidth
          value={torrentName}
          onChange={(e) => setTorrentName(e.target.value)}
          required
          margin="normal"
        />
        
        <TextField
          label="Description"
          fullWidth
          multiline
          rows={2}
          value={torrentDescription}
          onChange={(e) => setTorrentDescription(e.target.value)}
          margin="normal"
        />
        
        <FormControl component="fieldset" margin="normal">
          <FormLabel component="legend">FHIR Format</FormLabel>
          <RadioGroup 
            row 
            value={fhirType} 
            onChange={(e) => setFhirType(e.target.value)}
          >
            <FormControlLabel value="bundle" control={<Radio />} label="Bundle" />
            <FormControlLabel value="ndjson" control={<Radio />} label="NDJSON" />
          </RadioGroup>
        </FormControl>
      </Box>
      
      <TabPanel value={activeTab} index={0}>
        <TextField
          label="FHIR Data"
          fullWidth
          multiline
          rows={10}
          value={fhirText}
          onChange={(e) => setFhirText(e.target.value)}
          placeholder={fhirType === 'bundle' ? '{"resourceType": "Bundle", "type": "collection", "entry": [...]}' : '{"resourceType": "Patient", "id": "example"}\n{"resourceType": "Observation", "id": "example"}'}
          sx={{ mb: 2 }}
          InputProps={{
            style: { 
              fontFamily: 'monospace',
              fontSize: '0.875rem'
            }
          }}
        />
        
        <Button
          variant="contained"
          color="primary"
          onClick={handleCreateFromText}
          disabled={loading || !fhirText.trim() || !torrentName}
          startIcon={loading ? <CircularProgress size={24} /> : <AddIcon />}
        >
          Create Torrent from Text
        </Button>
      </TabPanel>
      
      <TabPanel value={activeTab} index={1}>
        <Box sx={{ mb: 2 }}>
          <Button
            variant="contained"
            component="label"
            startIcon={<CloudUploadIcon />}
          >
            Select Files
            <input
              type="file"
              multiple
              onChange={handleFileChange}
              hidden
            />
          </Button>
          
          <Box sx={{ mt: 1 }}>
            {selectedFiles.length > 0 ? (
              <Typography variant="body2">
                Selected {selectedFiles.length} file(s): {selectedFiles.map(f => f.name).join(', ')}
              </Typography>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No files selected
              </Typography>
            )}
          </Box>
        </Box>
        
        <Button
          variant="contained"
          color="primary"
          onClick={handleCreateFromFiles}
          disabled={loading || selectedFiles.length === 0 || !torrentName}
          startIcon={loading ? <CircularProgress size={24} /> : <FileUploadIcon />}
        >
          Create Torrent from Files
        </Button>
      </TabPanel>
      
      <Snackbar
        open={!!successMessage}
        autoHideDuration={6000}
        onClose={handleCloseSuccess}
        message={successMessage}
      />
    </Paper>
  );
}

export default FhirInput;