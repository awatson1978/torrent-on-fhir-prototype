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
import CardActions from '@mui/material/CardActions';
import LinearProgress from '@mui/material/LinearProgress';
import { alpha } from '@mui/material/styles';

// Icons
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BugReportIcon from '@mui/icons-material/BugReport';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import BuildIcon from '@mui/icons-material/Build';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import PeopleIcon from '@mui/icons-material/People';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';

function MetadataDebugPanel({ torrentHash, torrentName }) {
  const [diagnosis, setDiagnosis] = useState(null);
  const [metadataExchange, setMetadataExchange] = useState(null);
  const [enhancedReload, setEnhancedReload] = useState(null);
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
      }
    });
  }
  
  // Force enhanced metadata exchange
  function handleEnhancedMetadataExchange() {
    setLoading(true);
    setLoadingType('metadata');
    setMetadataExchange(null);
    
    Meteor.call('torrents.forceMetadataExchange', torrentHash, function(err, result) {
      setLoading(false);
      setLoadingType('');
      
      if (err) {
        console.error('Enhanced metadata exchange error:', err);
        setMetadataExchange({ error: err.message });
      } else {
        setMetadataExchange(result);
        
        // If successful, also refresh diagnosis
        if (result.success) {
          setTimeout(handleDiagnosis, 2000);
        }
      }
    });
  }
  
  // Enhanced reload
  function handleEnhancedReload() {
    setLoading(true);
    setLoadingType('reload');
    setEnhancedReload(null);
    
    Meteor.call('torrents.enhancedReload', torrentHash, function(err, result) {
      setLoading(false);
      setLoadingType('');
      
      if (err) {
        console.error('Enhanced reload error:', err);
        setEnhancedReload({ error: err.message });
      } else {
        setEnhancedReload(result);
        
        // If successful, refresh diagnosis
        if (result.success) {
          setTimeout(handleDiagnosis, 2000);
        }
      }
    });
  }
  
  // Get severity for diagnosis issues
  function getDiagnosticSeverity() {
    if (!diagnosis) return 'info';
    if (diagnosis.error) return 'error';
    if (diagnosis.issues && diagnosis.issues.length > 0) {
      // Check for critical issues
      const criticalIssues = diagnosis.issues.filter(issue => 
        issue.includes('not found') || 
        issue.includes('No peers') ||
        issue.includes('protocol issue')
      );
      return criticalIssues.length > 0 ? 'error' : 'warning';
    }
    return 'success';
  }
  
  // Render diagnosis results
  function renderDiagnosis() {
    if (!diagnosis) return null;
    
    const severity = getDiagnosticSeverity();
    
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
          
          {/* Issues */}
          {diagnosis.issues && diagnosis.issues.length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ErrorIcon color="error" />
                  <Typography>Issues Found ({diagnosis.issues.length})</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {diagnosis.issues.map((issue, index) => (
                  <Alert key={index} severity="warning" sx={{ mb: 1 }}>
                    {issue}
                  </Alert>
                ))}
              </AccordionDetails>
            </Accordion>
          )}
          
          {/* Peer Analysis */}
          {diagnosis.peerAnalysis && diagnosis.peerAnalysis.length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PeopleIcon color="primary" />
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
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {diagnosis.peerAnalysis.map((peer, index) => (
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
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </AccordionDetails>
            </Accordion>
          )}
          
          {/* Recommendations */}
          {diagnosis.recommendations && diagnosis.recommendations.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Recommendations:
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
  
  // Render metadata exchange result
  function renderMetadataExchange() {
    if (!metadataExchange) return null;
    
    return (
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <SwapHorizIcon color="primary" />
            <Typography variant="h6">Enhanced Metadata Exchange</Typography>
            <Chip 
              label={metadataExchange.success ? 'Success' : 'Failed'} 
              color={metadataExchange.success ? 'success' : 'error'}
              size="small"
            />
          </Box>
          
          {metadataExchange.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {metadataExchange.error}
            </Alert>
          )}
          
          {metadataExchange.success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              🎉 Metadata exchange completed successfully! The torrent should now have file information.
            </Alert>
          )}
          
          {metadataExchange.actions && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Exchange Actions ({metadataExchange.actions.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {metadataExchange.actions.map((action, index) => (
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
          
          {metadataExchange.finalStatus && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Final Status:</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip 
                  label={`Ready: ${metadataExchange.finalStatus.ready ? 'Yes' : 'No'}`} 
                  color={metadataExchange.finalStatus.ready ? 'success' : 'error'}
                  size="small"
                />
                <Chip 
                  label={`Files: ${metadataExchange.finalStatus.files}`} 
                  color={metadataExchange.finalStatus.files > 0 ? 'success' : 'warning'}
                  size="small"
                />
                <Chip 
                  label={`Peers: ${metadataExchange.finalStatus.peers}`} 
                  size="small"
                />
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    );
  }
  
  // Render enhanced reload result
  function renderEnhancedReload() {
    if (!enhancedReload) return null;
    
    return (
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <RefreshIcon color="primary" />
            <Typography variant="h6">Enhanced Torrent Reload</Typography>
            <Chip 
              label={enhancedReload.success ? 'Success' : 'Failed'} 
              color={enhancedReload.success ? 'success' : 'error'}
              size="small"
            />
          </Box>
          
          {enhancedReload.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {enhancedReload.error}
            </Alert>
          )}
          
          {enhancedReload.success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              🔄 Torrent reloaded successfully with enhanced metadata exchange settings!
            </Alert>
          )}
          
          {enhancedReload.actions && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Reload Actions ({enhancedReload.actions.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {enhancedReload.actions.map((action, index) => (
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
            {loadingType === 'diagnosis' && 'Running diagnosis...'}
            {loadingType === 'metadata' && 'Forcing enhanced metadata exchange...'}
            {loadingType === 'reload' && 'Performing enhanced reload...'}
          </Typography>
        </Box>
      )}
      
      {/* Action Steps */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Troubleshooting Steps</Typography>
          <Stepper activeStep={activeStep} orientation="vertical">
            <Step>
              <StepLabel>
                <Typography variant="subtitle1">1. Diagnose Issues</Typography>
              </StepLabel>
              <StepContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Analyze the current state of the torrent and identify potential metadata exchange issues.
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={loading && loadingType === 'diagnosis' ? <CircularProgress size={16} /> : <NetworkCheckIcon />}
                  onClick={handleDiagnosis}
                  disabled={loading}
                >
                  Run Diagnosis
                </Button>
              </StepContent>
            </Step>
            
            <Step>
              <StepLabel>
                <Typography variant="subtitle1">2. Force Metadata Exchange</Typography>
              </StepLabel>
              <StepContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Aggressively communicate with peers to request metadata using enhanced protocols.
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={loading && loadingType === 'metadata' ? <CircularProgress size={16} /> : <SwapHorizIcon />}
                  onClick={handleEnhancedMetadataExchange}
                  disabled={loading}
                >
                  Force Metadata Exchange
                </Button>
              </StepContent>
            </Step>
            
            <Step>
              <StepLabel>
                <Typography variant="subtitle1">3. Enhanced Reload (If Needed)</Typography>
              </StepLabel>
              <StepContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Reload the torrent with optimized settings for better metadata exchange.
                </Typography>
                <Button
                  variant="contained"
                  size="small"
                  color="warning"
                  startIcon={loading && loadingType === 'reload' ? <CircularProgress size={16} /> : <RefreshIcon />}
                  onClick={handleEnhancedReload}
                  disabled={loading}
                >
                  Enhanced Reload
                </Button>
              </StepContent>
            </Step>
          </Stepper>
        </CardContent>
      </Card>
      
      {renderDiagnosis()}
      {renderMetadataExchange()}
      {renderEnhancedReload()}
    </Paper>
  );
}

export default MetadataDebugPanel;