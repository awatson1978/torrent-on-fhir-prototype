// imports/ui/components/MetadataDebugPanel.jsx - Updated with protocol fixes

import React, { useState } from 'react';
import { Meteor } from 'meteor/meteor';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
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
import SettingsEthernetIcon from '@mui/icons-material/SettingsEthernet';

function MetadataDebugPanel({ torrentHash, torrentName }) {
  const [diagnosis, setDiagnosis] = useState(null);
  const [protocolDebug, setProtocolDebug] = useState(null);
  const [protocolFixResult, setProtocolFixResult] = useState(null);
  const [alternativeFixResult, setAlternativeFixResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState('');
  
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
  
  // Debug extended protocol
  function handleProtocolDebug() {
    setLoading(true);
    setLoadingType('protocol-debug');
    setProtocolDebug(null);
    
    Meteor.call('torrents.debugExtendedProtocol', torrentHash, function(err, result) {
      setLoading(false);
      setLoadingType('');
      
      if (err) {
        console.error('Protocol debug error:', err);
        setProtocolDebug({ error: err.message });
      } else {
        setProtocolDebug(result);
        console.log('Protocol debug result:', result);
      }
    });
  }
  
  // Apply protocol fix
  function handleProtocolFix() {
    setLoading(true);
    setLoadingType('protocol-fix');
    setProtocolFixResult(null);
    
    Meteor.call('torrents.fixExtendedProtocol', torrentHash, function(err, result) {
      setLoading(false);
      setLoadingType('');
      
      if (err) {
        console.error('Protocol fix error:', err);
        setProtocolFixResult({ error: err.message });
      } else {
        setProtocolFixResult(result);
        console.log('Protocol fix result:', result);
        
        // Auto-refresh diagnosis after fix
        if (result.success) {
          setTimeout(handleDiagnosis, 2000);
          setTimeout(handleProtocolDebug, 2500);
        }
      }
    });
  }
  
  // Apply alternative fix
  function handleAlternativeFix() {
    setLoading(true);
    setLoadingType('alternative-fix');
    setAlternativeFixResult(null);
    
    Meteor.call('torrents.alternativeMetadataFix', torrentHash, function(err, result) {
      setLoading(false);
      setLoadingType('');
      
      if (err) {
        console.error('Alternative fix error:', err);
        setAlternativeFixResult({ error: err.message });
      } else {
        setAlternativeFixResult(result);
        console.log('Alternative fix result:', result);
        
        // Auto-refresh diagnosis
        if (result.success) {
          setTimeout(handleDiagnosis, 2000);
          setTimeout(handleProtocolDebug, 2500);
        }
      }
    });
  }
  
  // Check if this shows the "Unrecognized extension" error
  function hasExtensionError() {
    return protocolFixResult?.actions?.some(action => 
      action.includes('Unrecognized extension')
    ) || alternativeFixResult?.actions?.some(action =>
      action.includes('Unrecognized extension')
    );
  }
  
  // Render diagnosis results
  function renderDiagnosis() {
    if (!diagnosis) return null;
    
    const hasIssues = diagnosis.issues && diagnosis.issues.length > 0;
    
    return (
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <NetworkCheckIcon color="primary" />
            <Typography variant="h6">Metadata Exchange Diagnosis</Typography>
            <Chip 
              label={hasIssues ? `${diagnosis.issues.length} Issues` : 'Healthy'} 
              color={hasIssues ? 'error' : 'success'}
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
                    <Typography variant="body2">{issue}</Typography>
                  </Alert>
                ))}
              </AccordionDetails>
            </Accordion>
          )}
        </CardContent>
      </Card>
    );
  }
  
  // Render protocol debug results
  function renderProtocolDebug() {
    if (!protocolDebug) return null;
    
    return (
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <SettingsEthernetIcon color="primary" />
            <Typography variant="h6">Extended Protocol Debug</Typography>
          </Box>
          
          {protocolDebug.diagnosis?.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {protocolDebug.diagnosis.error}
            </Alert>
          )}
          
          {/* Protocol Status */}
          {protocolDebug.diagnosis && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Protocol Status:</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip 
                  label={`Has Metadata: ${protocolDebug.diagnosis.hasMetadata ? 'Yes' : 'No'}`} 
                  color={protocolDebug.diagnosis.hasMetadata ? 'success' : 'error'}
                  size="small"
                />
                <Chip 
                  label={`Metadata Size: ${protocolDebug.diagnosis.metadataSize} bytes`} 
                  color={protocolDebug.diagnosis.metadataSize > 0 ? 'success' : 'warning'}
                  size="small"
                />
                <Chip 
                  label={`Wires: ${protocolDebug.diagnosis.wires}`} 
                  color={protocolDebug.diagnosis.wires > 0 ? 'success' : 'warning'}
                  size="small"
                />
              </Box>
            </Box>
          )}
          
          {/* Wire Details */}
          {protocolDebug.wireDetails && protocolDebug.wireDetails.length > 0 && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <SwapHorizIcon color="primary" />
                  <Typography>Wire Connections ({protocolDebug.wireDetails.length})</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Address</TableCell>
                        <TableCell>Extended Protocol</TableCell>
                        <TableCell>ut_metadata</TableCell>
                        <TableCell>Interest/Choke</TableCell>
                        <TableCell>Extensions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {protocolDebug.wireDetails.map((wire, index) => (
                        <TableRow key={index}>
                          <TableCell sx={{ fontFamily: 'monospace' }}>
                            {wire.address}:{wire.port}
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={wire.supportsExtended ? 'Yes' : 'No'} 
                              color={wire.supportsExtended ? 'success' : 'error'}
                              size="small"
                            />
                          </TableCell>
                          <TableCell>
                            <Box>
                              <Chip 
                                label={wire.supportsUtMetadata ? 'Peer Supports' : 'No Support'} 
                                color={wire.supportsUtMetadata ? 'success' : 'error'}
                                size="small"
                                sx={{ mb: 0.5 }}
                              />
                              <br />
                              <Chip 
                                label={wire.hasUtMetadata ? 'Extension Active' : 'Not Active'} 
                                color={wire.hasUtMetadata ? 'success' : 'warning'}
                                size="small"
                              />
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">
                              Interest: {wire.amInterested ? '✓' : '✗'} / {wire.peerInterested ? '✓' : '✗'}
                              <br />
                              Choke: {wire.amChoking ? '✗' : '✓'} / {wire.peerChoking ? '✗' : '✓'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">
                              {wire.peerExtensions.join(', ') || 'None'}
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
        </CardContent>
      </Card>
    );
  }
  
  // Render fix results
  function renderFixResult(result, title, icon) {
    if (!result) return null;
    
    return (
      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            {icon}
            <Typography variant="h6">{title}</Typography>
            <Chip 
              label={result.success ? 'Success' : 'Failed'} 
              color={result.success ? 'success' : 'error'}
              size="small"
            />
          </Box>
          
          {result.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {result.error}
            </Alert>
          )}
          
          {result.success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Fix applied successfully! The torrent should now have proper metadata exchange.
            </Alert>
          )}
          
          {result.actions && (
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Fix Actions ({result.actions.length})</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                  {result.actions.map((action, index) => (
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
          
          {result.finalStatus && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Final Status:</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip 
                  label={`Ready: ${result.finalStatus.ready ? 'Yes' : 'No'}`} 
                  color={result.finalStatus.ready ? 'success' : 'error'}
                  size="small"
                />
                <Chip 
                  label={`Files: ${result.finalStatus.files}`} 
                  color={result.finalStatus.files > 0 ? 'success' : 'warning'}
                  size="small"
                />
                <Chip 
                  label={`Peers: ${result.finalStatus.peers}`} 
                  size="small"
                />
              </Box>
            </Box>
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
          Enhanced Protocol Debug Panel
        </Typography>
      </Box>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Debugging WebTorrent extended protocol for: <strong>{torrentName}</strong>
        <br />
        Hash: <span style={{ fontFamily: 'monospace' }}>{torrentHash}</span>
      </Typography>
      
      {loading && (
        <Box sx={{ mb: 2 }}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {loadingType === 'diagnosis' && 'Running metadata diagnosis...'}
            {loadingType === 'protocol-debug' && 'Debugging extended protocol...'}
            {loadingType === 'protocol-fix' && 'Applying protocol fix...'}
            {loadingType === 'alternative-fix' && 'Applying alternative fix...'}
          </Typography>
        </Box>
      )}
      
      {/* Action Buttons */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            🔧 Protocol Troubleshooting (New Approach)
          </Typography>
          
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
              startIcon={loading && loadingType === 'protocol-debug' ? <CircularProgress size={16} /> : <SettingsEthernetIcon />}
              onClick={handleProtocolDebug}
              disabled={loading}
            >
              2. Debug Protocol
            </Button>
            
            <Button
              variant="contained"
              size="small"
              color="warning"
              startIcon={loading && loadingType === 'protocol-fix' ? <CircularProgress size={16} /> : <BuildIcon />}
              onClick={handleProtocolFix}
              disabled={loading}
            >
              3. Fix Protocol
            </Button>
            
            <Button
              variant="contained"
              size="small"
              color="success"
              startIcon={loading && loadingType === 'alternative-fix' ? <CircularProgress size={16} /> : <AutoFixHighIcon />}
              onClick={handleAlternativeFix}
              disabled={loading}
            >
              4. Alternative Fix
            </Button>
          </Box>
          
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>NEW APPROACH:</strong> The "Unrecognized extension: handshake" error indicates a WebTorrent protocol issue.
              <br />
              1. First run "Diagnose Issues" and "Debug Protocol" to see the exact problem
              <br />
              2. Use "Fix Protocol" to address the extended handshake issue properly
              <br />
              3. If that fails, try "Alternative Fix" which uses WebTorrent's built-in protocol handling
            </Typography>
          </Alert>
          
          {hasExtensionError() && (
            <Alert severity="error" sx={{ mt: 1 }}>
              <Typography variant="body2">
                <strong>⚠️ DETECTED:</strong> "Unrecognized extension" errors in the logs. This confirms the WebTorrent extended protocol issue.
              </Typography>
            </Alert>
          )}
        </CardContent>
      </Card>
      
      {renderDiagnosis()}
      {renderProtocolDebug()}
      {renderFixResult(protocolFixResult, 'Protocol Fix Results', <BuildIcon color="primary" />)}
      {renderFixResult(alternativeFixResult, 'Alternative Fix Results', <AutoFixHighIcon color="primary" />)}
    </Paper>
  );
}

export default MetadataDebugPanel;