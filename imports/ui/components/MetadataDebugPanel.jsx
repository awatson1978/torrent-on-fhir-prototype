import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import StepContent from '@mui/material/StepContent';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import { alpha } from '@mui/material/styles';

// Icons
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BugReportIcon from '@mui/icons-material/BugReport';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import BuildIcon from '@mui/icons-material/Build';
import RefreshIcon from '@mui/icons-material/Refresh';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import SeedingIcon from '@mui/icons-material/CloudUpload';

function MetadataDebugPanel({ torrentHash, torrentName }) {
  const [diagnosis, setDiagnosis] = useState(null);
  const [completeFixResult, setCompleteFixResult] = useState(null);
  const [seedingFixResult, setSeedingFixResult] = useState(null);
  const [seedingDiagnosis, setSeedingDiagnosis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState('');
  const [activeStep, setActiveStep] = useState(0);
  
  // Run diagnosis
  function handleDiagnosis() {
    setLoading(true);
    setLoadingType('diagnosis');
    setDiagnosis(null);
    
    Meteor.call('torrents.diagnoseMetadataIssues', torrentHash, function(err, result) {
      setLoading(false);
      setLoadingType('');
      
      if (err) {
        console.error('Diagnosis error:', err);
        setDiagnosis({ error: err.message });
      } else {
        setDiagnosis(result);
        console.log('Diagnosis result:', result);
      }
    });
  }
  
  // Complete metadata fix
  function handleCompleteMetadataFix() {
    setLoading(true);
    setLoadingType('complete-fix');
    setCompleteFixResult(null);
    
    Meteor.call('torrents.emergencyMetadataFix', torrentHash, function(err, result) {
      setLoading(false);
      setLoadingType('');
      
      if (err) {
        console.error('Emergency fix error:', err);
        setCompleteFixResult({ error: err.message });
      } else {
        setCompleteFixResult(result);
        console.log('Emergency fix result:', result);
        
        // Auto-refresh diagnosis after successful fix
        if (result.success) {
          setTimeout(handleDiagnosis, 3000);
        }
      }
    });
  }
  
  // Fix seeding metadata
  function handleSeedingFix() {
    setLoading(true);
    setLoadingType('seeding-fix');
    setSeedingFixResult(null);
    
    Meteor.call('torrents.fixSeedingMetadataCreation', torrentHash, function(err, result) {
      setLoading(false);
      setLoadingType('');
      
      if (err) {
        console.error('Seeding metadata creation fix error:', err);
        setSeedingFixResult({ error: err.message });
      } else {
        setSeedingFixResult(result);
        console.log('Seeding metadata creation fix result:', result);
        
        // Auto-refresh diagnosis
        setTimeout(handleDiagnosis, 2000);
        setTimeout(handleSeedingDiagnosis, 2500);
      }
    });
  }
  
  // Diagnose seeding metadata
  function handleSeedingDiagnosis() {
    setLoading(true);
    setLoadingType('seeding-diagnosis');
    setSeedingDiagnosis(null);
    
    Meteor.call('torrents.diagnoseSeedingMetadata', torrentHash, function(err, result) {
      setLoading(false);
      setLoadingType('');
      
      if (err) {
        console.error('Seeding diagnosis error:', err);
        setSeedingDiagnosis({ error: err.message });
      } else {
        setSeedingDiagnosis(result);
        console.log('Seeding diagnosis result:', result);
      }
    });
  }
  
  // Get severity for diagnosis issues
  function getDiagnosticSeverity() {
    if (!diagnosis) return 'info';
    if (diagnosis.error) return 'error';
    if (diagnosis.issues && diagnosis.issues.length > 0) {
      const criticalIssues = diagnosis.issues.filter(issue => 
        issue.includes('not found') || 
        issue.includes('No peers') ||
        issue.includes('protocol issue') ||
        issue.includes('does not support ut_metadata')
      );
      return criticalIssues.length > 0 ? 'error' : 'warning';
    }
    return 'success';
  }
  
  // Determine if this is likely a seeding torrent
  function isLikelySeeding() {
    return diagnosis?.basic?.files > 0 && diagnosis?.basic?.ready;
  }
  
  // Render diagnosis results
  function renderDiagnosis() {
    if (!diagnosis) return null;
    
    const severity = getDiagnosticSeverity();
    const likelySeeding = isLikelySeeding();
    
    return (
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <NetworkCheckIcon color="primary" />
            <Typography variant="h6">Metadata Exchange Diagnosis</Typography>
            <Chip 
              label={severity === 'success' ? 'Healthy' : severity === 'warning' ? 'Issues Found' : 'Critical Issues'} 
              color={severity}
              size="small"
            />
            {likelySeeding && (
              <Chip 
                icon={<SeedingIcon />}
                label="Seeding Mode" 
                color="info"
                size="small"
                variant="outlined"
              />
            )}
          </Box>
          
          {diagnosis.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {diagnosis.error}
            </Alert>
          )}
          
          {/* Basic Status */}
          {diagnosis.basic && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Current Status:</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip 
                  label={`Ready: ${diagnosis.basic.ready ? 'Yes' : 'No'}`} 
                  color={diagnosis.basic.ready ? 'success' : 'error'}
                  size="small"
                />
                <Chip 
                  label={`Files: ${diagnosis.basic.files}`} 
                  color={diagnosis.basic.files > 0 ? 'success' : 'warning'}
                  size="small"
                />
                <Chip 
                  label={`Peers: ${diagnosis.basic.peers}`} 
                  color={diagnosis.basic.peers > 0 ? 'success' : 'error'}
                  size="small"
                />
                <Chip 
                  label={`Connections: ${diagnosis.basic.wires}`} 
                  color={diagnosis.basic.wires > 0 ? 'success' : 'warning'}
                  size="small"
                />
                <Chip 
                  label={`Progress: ${Math.round(diagnosis.basic.progress * 100)}%`} 
                  color={diagnosis.basic.progress > 0 ? 'info' : 'default'}
                  size="small"
                />
              </Box>
            </Box>
          )}
          
          {/* Issues with specific guidance */}
          {diagnosis.issues && diagnosis.issues.length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ErrorIcon color="error" />
                  <Typography>Issues Found ({diagnosis.issues.length})</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {diagnosis.issues.map((issue, index) => {
                  let guidance = '';
                  let severity = 'warning';
                  
                  if (issue.includes('does not support ut_metadata')) {
                    guidance = '→ This indicates the seeding peer is not properly advertising metadata support. Use "Fix Seeding Metadata" on the seeding client.';
                    severity = 'error';
                  } else if (issue.includes('not interested')) {
                    guidance = '→ The peer connection handshake needs to be enhanced. Try "Complete Metadata Fix".';
                    severity = 'warning';
                  } else if (issue.includes('No connected peers support metadata')) {
                    guidance = '→ All connected peers lack metadata support. This is a critical protocol issue requiring complete fix.';
                    severity = 'error';
                  }
                  
                  return (
                    <Alert key={index} severity={severity} sx={{ mb: 1 }}>
                      <Typography variant="body2">{issue}</Typography>
                      {guidance && (
                        <Typography variant="caption" sx={{ mt: 1, display: 'block', fontStyle: 'italic' }}>
                          {guidance}
                        </Typography>
                      )}
                    </Alert>
                  );
                })}
              </AccordionDetails>
            </Accordion>
          )}
          
          {/* Peer Analysis */}
          {diagnosis.peerAnalysis && diagnosis.peerAnalysis.length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SwapHorizIcon color="primary" />
                  <Typography>Peer Analysis ({diagnosis.peerAnalysis.length} peers)</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Address</TableCell>
                        <TableCell>Metadata Support</TableCell>
                        <TableCell>Interested</TableCell>
                        <TableCell>Choking</TableCell>
                        <TableCell>Extensions</TableCell>
                        <TableCell>Action Needed</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {diagnosis.peerAnalysis.map((peer, index) => {
                        // Determine the specific issue and action needed
                        let actionNeeded = 'OK';
                        let actionColor = 'success';
                        
                        if (!peer.supportsMetadata) {
                          if (peer.extensions.includes('extended')) {
                            actionNeeded = 'Force ut_metadata';
                            actionColor = 'error';
                          } else {
                            actionNeeded = 'No extended protocol';
                            actionColor = 'error';
                          }
                        } else if (!peer.interested) {
                          actionNeeded = 'Force handshake';
                          actionColor = 'warning';
                        }
                        
                        return (
                          <TableRow key={index}>
                            <TableCell sx={{ fontFamily: 'monospace' }}>
                              {peer.address}:{peer.port}
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={peer.supportsMetadata ? 'Yes' : 'No'} 
                                color={peer.supportsMetadata ? 'success' : 'error'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={peer.interested ? 'Yes' : 'No'} 
                                color={peer.interested ? 'success' : 'warning'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Chip 
                                label={peer.choking ? 'Yes' : 'No'} 
                                color={peer.choking ? 'warning' : 'success'}
                                size="small"
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption">
                                {peer.extensions.join(', ') || 'None'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={actionNeeded}
                                color={actionColor}
                                size="small"
                                variant="outlined"
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionDetails>
            </Accordion>
          )}
          
          {/* Smart Recommendations */}
          {diagnosis.recommendations && diagnosis.recommendations.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Smart Recommendations:
              </Typography>
              {diagnosis.recommendations.map((rec, index) => (
                <Alert key={index} severity="info" sx={{ mb: 1 }}>
                  {rec}
                </Alert>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    );
  }
  
  // Render complete fix result
  function renderCompleteFixResult() {
    if (!completeFixResult) return null;
    
    return (
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <AutoFixHighIcon color="primary" />
            <Typography variant="h6">Emergency Metadata Fix</Typography>
            <Chip 
              label={completeFixResult.success ? 'Success' : 'Failed'} 
              color={completeFixResult.success ? 'success' : 'error'}
              size="small"
            />
          </Box>
          
          {completeFixResult.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {completeFixResult.error}
            </Alert>
          )}
          
          {completeFixResult.success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              🚨 Emergency metadata fix successful! Fixed metadata exchange without any DHT operations.
            </Alert>
          )}
          
          {completeFixResult.actions && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Fix Actions ({completeFixResult.actions.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                  {completeFixResult.actions.map((action, index) => (
                    <Typography 
                      key={index} 
                      variant="body2" 
                      sx={{ 
                        fontFamily: 'monospace', 
                        mb: 0.5,
                        fontSize: '0.8rem',
                        color: action.includes('❌') ? 'error.main' : 
                               action.includes('✅') ? 'success.main' :
                               action.includes('⚠️') ? 'warning.main' : 'text.primary'
                      }}
                    >
                      {action}
                    </Typography>
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}
          
          {completeFixResult.finalStatus && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Final Status:</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip 
                  label={`Ready: ${completeFixResult.finalStatus.ready ? 'Yes' : 'No'}`} 
                  color={completeFixResult.finalStatus.ready ? 'success' : 'error'}
                  size="small"
                />
                <Chip 
                  label={`Files: ${completeFixResult.finalStatus.files}`} 
                  color={completeFixResult.finalStatus.files > 0 ? 'success' : 'warning'}
                  size="small"
                />
                <Chip 
                  label={`Peers: ${completeFixResult.finalStatus.peers}`} 
                  size="small"
                />
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    );
  }
  
  // Render seeding diagnosis
  function renderSeedingDiagnosis() {
    if (!seedingDiagnosis) return null;
    
    return (
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <SeedingIcon color="info" />
            <Typography variant="h6">Seeding Metadata Diagnosis</Typography>
            <Chip 
              label={seedingDiagnosis.issues?.length > 0 ? `${seedingDiagnosis.issues.length} Issues` : 'Healthy'} 
              color={seedingDiagnosis.issues?.length > 0 ? 'error' : 'success'}
              size="small"
            />
          </Box>
          
          {seedingDiagnosis.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {seedingDiagnosis.error}
            </Alert>
          )}
          
          {/* Seeding Status */}
          {seedingDiagnosis.diagnosis && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Seeding Status:</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip 
                  label={`Files: ${seedingDiagnosis.diagnosis.files}`} 
                  color={seedingDiagnosis.diagnosis.files > 0 ? 'success' : 'error'}
                  size="small"
                />
                <Chip 
                  label={`Has Metadata: ${seedingDiagnosis.diagnosis.hasMetadata ? 'Yes' : 'No'}`} 
                  color={seedingDiagnosis.diagnosis.hasMetadata ? 'success' : 'error'}
                  size="small"
                />
                <Chip 
                  label={`Metadata Size: ${seedingDiagnosis.diagnosis.metadataSize} bytes`} 
                  color={seedingDiagnosis.diagnosis.metadataSize > 0 ? 'success' : 'error'}
                  size="small"
                />
                <Chip 
                  label={`Peers: ${seedingDiagnosis.diagnosis.peers}`} 
                  color={seedingDiagnosis.diagnosis.peers > 0 ? 'success' : 'warning'}
                  size="small"
                />
                <Chip 
                  label={`Wires with Metadata: ${seedingDiagnosis.diagnosis.wiresWithMetadata || 0}/${seedingDiagnosis.diagnosis.wires}`} 
                  color={(seedingDiagnosis.diagnosis.wiresWithMetadata || 0) > 0 ? 'success' : 'warning'}
                  size="small"
                />
              </Box>
            </Box>
          )}
          
          {/* Critical Issues */}
          {seedingDiagnosis.issues && seedingDiagnosis.issues.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom color="error">
                Critical Seeding Issues:
              </Typography>
              {seedingDiagnosis.issues.map((issue, index) => (
                <Alert key={index} severity="error" sx={{ mb: 1 }}>
                  {issue}
                </Alert>
              ))}
            </Box>
          )}
          
          {/* Recommendations */}
          {seedingDiagnosis.recommendations && seedingDiagnosis.recommendations.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Seeding Recommendations:
              </Typography>
              {seedingDiagnosis.recommendations.map((rec, index) => (
                <Alert key={index} severity="info" sx={{ mb: 1 }}>
                  {rec}
                </Alert>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    );
  }
  function renderSeedingFixResult() {
    if (!seedingFixResult) return null;
    
    return (
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <SeedingIcon color="primary" />
            <Typography variant="h6">Simple Seeding Fix</Typography>
            <Chip 
              label={seedingFixResult.success ? 'Success' : 'Failed'} 
              color={seedingFixResult.success ? 'success' : 'error'}
              size="small"
            />
          </Box>
          
          {seedingFixResult.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {seedingFixResult.error}
            </Alert>
          )}
          
          {seedingFixResult.success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              🌱 Seeding metadata creation fix applied! This torrent should now have proper metadata object and share it correctly.
            </Alert>
          )}
          
          {seedingFixResult.actions && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Seeding Fix Actions ({seedingFixResult.actions.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {seedingFixResult.actions.map((action, index) => (
                    <Typography 
                      key={index} 
                      variant="body2" 
                      sx={{ 
                        fontFamily: 'monospace', 
                        mb: 0.5,
                        fontSize: '0.8rem',
                        color: action.includes('❌') ? 'error.main' : 
                               action.includes('✅') ? 'success.main' :
                               action.includes('⚠️') ? 'warning.main' : 'text.primary'
                      }}
                    >
                      {action}
                    </Typography>
                  ))}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Paper sx={{ 
      p: 2, 
      mt: 2,
      backgroundColor: (theme) => alpha(theme.palette.info.main, 0.05),
      border: (theme) => `1px solid ${alpha(theme.palette.info.main, 0.2)}`
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <BugReportIcon color="info" />
        <Typography variant="h6">
          Enhanced Metadata Debug Panel
        </Typography>
      </Box>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Debugging metadata exchange for: <strong>{torrentName}</strong>
        <br />
        Hash: <span style={{ fontFamily: 'monospace' }}>{torrentHash}</span>
      </Typography>
      
      {loading && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {loadingType === 'diagnosis' && 'Running comprehensive diagnosis...'}
            {loadingType === 'complete-fix' && 'Applying complete metadata exchange fix...'}
            {loadingType === 'seeding-fix' && 'Fixing seeding metadata sharing...'}
          </Typography>
        </Box>
      )}
      
      {/* Enhanced Action Steps */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Enhanced Troubleshooting Actions</Typography>
          
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={loading && loadingType === 'diagnosis' ? <CircularProgress size={16} /> : <NetworkCheckIcon />}
              onClick={handleDiagnosis}
              disabled={loading}
            >
              1. Diagnose Issues
            </Button>
            
            <Button
              variant="contained"
              size="small"
              color="info"
              startIcon={loading && loadingType === 'seeding-diagnosis' ? <CircularProgress size={16} /> : <SeedingIcon />}
              onClick={handleSeedingDiagnosis}
              disabled={loading}
            >
              1b. Diagnose Seeding
            </Button>
            
            <Button
              variant="contained"
              size="small"
              color="warning"
              startIcon={loading && loadingType === 'complete-fix' ? <CircularProgress size={16} /> : <AutoFixHighIcon />}
              onClick={handleCompleteMetadataFix}
              disabled={loading}
            >
              2. Emergency Fix (Client 2)
            </Button>
            
            {/* <Button
              variant="contained"
              size="small"
              color="success"
              startIcon={loading && loadingType === 'seeding-fix' ? <CircularProgress size={16} /> : <SeedingIcon />}
              onClick={handleSeedingFix}
              disabled={loading}
            >
              3. Fix Seeding Metadata (Client 1)
            </Button> */}
          </Box>
          
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>NEW DISCOVERY - Recommended workflow:</strong>
              <br />
              1. Run "Diagnose Issues" and "Diagnose Seeding" to identify the specific problem
              <br />
              2. **CRITICAL**: If seeding (Client 1), run "Fix Seeding Metadata" FIRST - this is likely the root cause
              <br />
              3. If downloading (Client 2), then use "Emergency Fix" after Client 1 is fixed
            </Typography>
          </Alert>
        </CardContent>
      </Card>
      
      {renderDiagnosis()}
      {renderSeedingDiagnosis()}
      {renderCompleteFixResult()}
      {renderSeedingFixResult()}
    </Paper>
  );
}

export default MetadataDebugPanel;