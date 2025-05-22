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
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';

// Icons
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DataObjectIcon from '@mui/icons-material/DataObject';
import TableViewIcon from '@mui/icons-material/TableView';

import { FhirUtils } from '../../api/fhir/fhir-utils';

const steps = ['Data Type', 'Add Data', 'Configure Share'];

function ShareWizardModal({ open, onClose }) {
  const [activeStep, setActiveStep] = useState(0);
  const [fhirType, setFhirType] = useState('bundle');
  const [shareData, setShareData] = useState({
    name: '',
    description: '',
    files: [],
    privacy: 'public'
  });
  const [fhirContent, setFhirContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [inputMethod, setInputMethod] = useState('paste'); // 'paste' or 'upload'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Handle close and reset
  function handleClose() {
    setActiveStep(0);
    setFhirType('bundle');
    setShareData({
      name: '',
      description: '',
      files: [],
      privacy: 'public'
    });
    setFhirContent('');
    setSelectedFiles([]);
    setInputMethod('paste');
    setError('');
    onClose();
  }
  
  // Handle next step
  function handleNext() {
    if (activeStep === 0) {
      // Validate data type selection
      setActiveStep(1);
    } else if (activeStep === 1) {
      // Validate data input
      if (inputMethod === 'paste' && !fhirContent.trim()) {
        setError('Please enter FHIR data.');
        return;
      }
      
      if (inputMethod === 'upload' && selectedFiles.length === 0) {
        setError('Please select at least one file.');
        return;
      }
      
      // Validate FHIR format
      if (inputMethod === 'paste') {
        const format = FhirUtils.detectFormat(fhirContent);
        if (format === 'unknown') {
          setError('The content doesn\'t appear to be valid FHIR data.');
          return;
        }
        
        if ((fhirType === 'bundle' && format !== 'bundle') || 
            (fhirType === 'ndjson' && format !== 'ndjson')) {
          setError(`The content format doesn't match the selected type (${fhirType}).`);
          return;
        }
      }
      
      // Auto-set name if not provided
      if (!shareData.name) {
        setShareData(prev => ({
          ...prev,
          name: inputMethod === 'paste' ? 
            `FHIR ${fhirType.toUpperCase()} Share` : 
            selectedFiles[0]?.name?.replace(/\.[^/.]+$/, "") || 'FHIR Data Share'
        }));
      }
      
      setError('');
      setActiveStep(2);
    }
  }
  
  // Handle back step
  function handleBack() {
    setError('');
    setActiveStep(activeStep - 1);
  }
  
  // Handle file selection
  function handleFileChange(event) {
    const files = Array.from(event.target.files);
    setSelectedFiles(files);
    setError('');
  }
  
  // Handle final create
  async function handleCreate() {
    setLoading(true);
    setError('');
    
    try {
      let fileData = [];
      
      if (inputMethod === 'paste') {
        // Create file from pasted content
        fileData = [{
          name: `${shareData.name}.${fhirType === 'bundle' ? 'json' : 'ndjson'}`,
          data: fhirContent
        }];
      } else {
        // Read uploaded files
        for (const file of selectedFiles) {
          const text = await readFileAsText(file);
          
          // Validate each file
          const format = FhirUtils.detectFormat(text);
          if (format === 'unknown') {
            throw new Error(`File ${file.name} doesn't appear to be valid FHIR content.`);
          }
          
          if ((fhirType === 'bundle' && format !== 'bundle') || 
              (fhirType === 'ndjson' && format !== 'ndjson')) {
            throw new Error(`File ${file.name} format doesn't match selected type.`);
          }
          
          fileData.push({
            name: file.name,
            data: text
          });
        }
      }
      
      // Create the torrent
      Meteor.call('torrents.create', shareData.name, fileData, {
        description: shareData.description,
        fhirType: fhirType
      }, function(err, result) {
        setLoading(false);
        
        if (err) {
          setError('Error creating share: ' + err.message);
        } else {
          console.log('Share created successfully:', result);
          handleClose();
        }
      });
      
    } catch (err) {
      setLoading(false);
      setError('Error creating share: ' + err.message);
    }
  }
  
  // Helper to read file as text
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
  
  // Render step content
  function renderStepContent() {
    switch (activeStep) {
      case 0:
        return (
          <Box sx={{ py: 2 }}>
            <Typography variant="body1" gutterBottom>
              What type of FHIR data are you sharing?
            </Typography>
            
            <FormControl component="fieldset" sx={{ mt: 2 }}>
              <RadioGroup 
                value={fhirType} 
                onChange={(e) => setFhirType(e.target.value)}
              >
                <FormControlLabel 
                  value="bundle" 
                  control={<Radio />} 
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <DataObjectIcon />
                      <Box>
                        <Typography variant="body1">FHIR Bundle</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Complete FHIR Bundle with multiple resources (.json)
                        </Typography>
                      </Box>
                    </Box>
                  }
                />
                <FormControlLabel 
                  value="ndjson" 
                  control={<Radio />} 
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TableViewIcon />
                      <Box>
                        <Typography variant="body1">NDJSON</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Newline-delimited JSON with individual resources (.ndjson)
                        </Typography>
                      </Box>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>
          </Box>
        );
        
      case 1:
        return (
          <Box sx={{ py: 2 }}>
            <Typography variant="body1" gutterBottom>
              How would you like to add your FHIR data?
            </Typography>
            
            <FormControl component="fieldset" sx={{ mt: 2, mb: 3 }}>
              <RadioGroup 
                value={inputMethod} 
                onChange={(e) => setInputMethod(e.target.value)}
                row
              >
                <FormControlLabel 
                  value="paste" 
                  control={<Radio />} 
                  label="Paste Data"
                />
                <FormControlLabel 
                  value="upload" 
                  control={<Radio />} 
                  label="Upload Files"
                />
              </RadioGroup>
            </FormControl>
            
            {inputMethod === 'paste' && (
              <TextField
                label="FHIR Data"
                multiline
                rows={12}
                fullWidth
                value={fhirContent}
                onChange={(e) => setFhirContent(e.target.value)}
                placeholder={
                  fhirType === 'bundle' 
                    ? '{"resourceType": "Bundle", "type": "collection", "entry": [...]}'
                    : '{"resourceType": "Patient", "id": "example"}\n{"resourceType": "Observation", "id": "example"}'
                }
                sx={{
                  '& .MuiInputBase-input': {
                    fontFamily: 'monospace',
                    fontSize: '0.875rem'
                  }
                }}
              />
            )}
            
            {inputMethod === 'upload' && (
              <Box>
                <Button
                  variant="outlined"
                  component="label"
                  startIcon={<CloudUploadIcon />}
                  fullWidth
                  sx={{ 
                    py: 2,
                    borderStyle: 'dashed',
                    borderWidth: 2
                  }}
                >
                  Select Files
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    hidden
                    accept=".json,.ndjson,.txt"
                  />
                </Button>
                
                {selectedFiles.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Selected {selectedFiles.length} file(s):
                    </Typography>
                    {selectedFiles.map((file, index) => (
                      <Typography key={index} variant="body2" sx={{ ml: 1 }}>
                        • {file.name} ({(file.size / 1024).toFixed(1)} KB)
                      </Typography>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </Box>
        );
        
      case 2:
        return (
          <Box sx={{ py: 2 }}>
            <Typography variant="body1" gutterBottom>
              Configure your share settings:
            </Typography>
            
            <TextField
              label="Share Name"
              fullWidth
              required
              value={shareData.name}
              onChange={(e) => setShareData(prev => ({ ...prev, name: e.target.value }))}
              margin="normal"
            />
            
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={shareData.description}
              onChange={(e) => setShareData(prev => ({ ...prev, description: e.target.value }))}
              margin="normal"
              helperText="Optional description of your FHIR data"
            />
            
            <FormControl component="fieldset" sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Privacy Setting
              </Typography>
              <RadioGroup 
                value={shareData.privacy} 
                onChange={(e) => setShareData(prev => ({ ...prev, privacy: e.target.value }))}
              >
                <FormControlLabel 
                  value="public" 
                  control={<Radio />} 
                  label="Public (discoverable by others)"
                />
                <FormControlLabel 
                  value="private" 
                  control={<Radio />} 
                  label="Private link only"
                />
              </RadioGroup>
            </FormControl>
          </Box>
        );
        
      default:
        return null;
    }
  }
  
  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '60vh' }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        pb: 1
      }}>
        <Typography variant="h6" component="h2">
          Share FHIR Data
        </Typography>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ px: 3 }}>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        {renderStepContent()}
      </DialogContent>
      
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button 
          onClick={handleClose} 
          disabled={loading}
        >
          Cancel
        </Button>
        
        {activeStep > 0 && (
          <Button 
            onClick={handleBack}
            disabled={loading}
          >
            Back
          </Button>
        )}
        
        {activeStep < steps.length - 1 ? (
          <Button 
            variant="contained" 
            onClick={handleNext}
            disabled={loading}
          >
            Continue
          </Button>
        ) : (
          <Button 
            variant="contained" 
            onClick={handleCreate}
            disabled={loading || !shareData.name}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {loading ? 'Creating...' : 'Create Share'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default ShareWizardModal;