// imports/ui/components/MetadataDebugPanel.jsx - Debug panel for metadata issues

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
import { alpha } from '@mui/material/styles';

// Icons
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import BugReportIcon from '@mui/icons-material/BugReport';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import BuildIcon from '@mui/icons-material/Build';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

function MetadataDebugPanel({ torrentHash, torrentName }) {
  const [diagnosis, setDiagnosis] = useState(null);
  const [metadataWait, setMetadataWait] = useState(null);
  const [forceResult, setForceResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState('');
  
  // Run diagnosis
  function handleDiagnose() {
    setLoading(true);
    setLoadingType('diagnose');
    setDiagnosis(null);
    
    Meteor.call('debug.diagnoseTorrentMetadata', torrentHash, function(err, result) {
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
  
  // Force metadata request
  function handleForceMetadata() {
    setLoading(true);
    setLoadingType('force');
    setForceResult(null);
    
    Meteor.call('debug.forceMetadataRequest', torrentHash, function(err, result) {
      setLoading(false);
      setLoadingType('');
      
      if (err) {
        console.error('Force metadata error:', err);
        setForceResult({ error: err.message });
      } else {
        setForceResult(result);
      }
    });
  }
  
  // Wait for metadata
  function handleWaitForMetadata() {
    setLoading(true);
    setLoadingType('wait');
    setMetadataWait(null);
    
    Meteor.call('debug.waitForMetadata', torrentHash, 30000, function(err, result) {
      setLoading(false);
      setLoadingType('');
      
      if (err) {
        console.error('Wait metadata error:', err);
        setMetadataWait({ error: err.message });
      } else {
        setMetadataWait(result);
      }
    });
  }
  
  // Get status color based on condition
  function getStatusColor(condition) {
    if (condition === true) return 'success';
    if (condition === false) return 'error';
    return 'warning';
  }
  
  // Render diagnosis results
  function renderDiagnosis() {
    if (!diagnosis) return null;
    
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          Diagnosis Results
        </Typography>
        
        {diagnosis.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {diagnosis.error}
          </Alert>
        )}
        
        {/* Database Status */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography>Database Status</Typography>
              <Chip 
                label={diagnosis.database.exists ? 'Found' : 'Missing'} 
                color={getStatusColor(diagnosis.database.exists)}
                size="small"
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {diagnosis.database.data && (
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>{diagnosis.database.data.name}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Files Count</TableCell>
                    <TableCell>{diagnosis.database.data.filesCount}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Status</TableCell>
                    <TableCell>{diagnosis.database.data.status?.state || 'Unknown'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Created</TableCell>
                    <TableCell>{new Date(diagnosis.database.data.created).toLocaleString()}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </AccordionDetails>
        </Accordion>
        
        {/* Client Status */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography>WebTorrent Client Status</Typography>
              <Chip 
                label={diagnosis.client.exists ? 'Found' : 'Missing'} 
                color={getStatusColor(diagnosis.client.exists)}
                size="small"
              />
              {diagnosis.client.data && (
                <Chip 
                  label={diagnosis.client.data.ready ? 'Ready' : 'Not Ready'} 
                  color={getStatusColor(diagnosis.client.data.ready)}
                  size="small"
                />
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {diagnosis.client.data && (
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell>Ready</TableCell>
                    <TableCell>
                      <Chip 
                        label={diagnosis.client.data.ready ? 'Yes' : 'No'} 
                        color={getStatusColor(diagnosis.client.data.ready)}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Files Count</TableCell>
                    <TableCell>{diagnosis.client.data.filesCount}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Progress</TableCell>
                    <TableCell>{Math.round(diagnosis.client.data.progress * 100)}%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Peers</TableCell>
                    <TableCell>{diagnosis.client.data.numPeers}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Downloaded</TableCell>
                    <TableCell>{diagnosis.client.data.downloaded} bytes</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Paused</TableCell>
                    <TableCell>{diagnosis.client.data.paused ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Done</TableCell>
                    <TableCell>{diagnosis.client.data.done ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </AccordionDetails>
        </Accordion>
        
        {/* Network Status */}
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography>Network Status</Typography>
              {diagnosis.network.peers !== undefined && (
                <Chip 
                  label={`${diagnosis.network.peers} peers`} 
                  color={diagnosis.network.peers > 0 ? 'success' : 'warning'}
                  size="small"
                />
              )}
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            {diagnosis.network && (
              <Box>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell>Peers</TableCell>
                      <TableCell>{diagnosis.network.peers || 0}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Wires</TableCell>
                      <TableCell>{diagnosis.network.wires || 0}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Download Speed</TableCell>
                      <TableCell>{diagnosis.network.downloadSpeed || 0} B/s</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Upload Speed</TableCell>
                      <TableCell>{diagnosis.network.uploadSpeed || 0} B/s</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>DHT</TableCell>
                      <TableCell>{diagnosis.network.dht || 'Unknown'}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                
                {diagnosis.network.peerDetails && diagnosis.network.peerDetails.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>Peer Details:</Typography>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Address</TableCell>
                          <TableCell>Port</TableCell>
                          <TableCell>Type</TableCell>
                          <TableCell>Down Speed</TableCell>
                          <TableCell>Up Speed</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {diagnosis.network.peerDetails.map((peer, index) => (
                          <TableRow key={index}>
                            <TableCell sx={{ fontFamily: 'monospace' }}>{peer.remoteAddress}</TableCell>
                            <TableCell>{peer.remotePort}</TableCell>
                            <TableCell>{peer.type}</TableCell>
                            <TableCell>{peer.downloadSpeed} B/s</TableCell>
                            <TableCell>{peer.uploadSpeed} B/s</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                )}
              </Box>
            )}
          </AccordionDetails>
        </Accordion>
        
        {/* Recommendations */}
        {diagnosis.recommendations && diagnosis.recommendations.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Recommendations:
            </Typography>
            {diagnosis.recommendations.map((rec, index) => (
              <Alert key={index} severity="info" sx={{ mb: 1 }}>
                {rec}
              </Alert>
            ))}
          </Box>
        )}
      </Box>
    );
  }
  
  // Render force result
  function renderForceResult() {
    if (!forceResult) return null;
    
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          Force Metadata Result
        </Typography>
        
        {forceResult.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {forceResult.error}
          </Alert>
        )}
        
        {forceResult.success && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Force metadata request completed successfully
          </Alert>
        )}
        
        {forceResult.actions && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Actions Taken:</Typography>
            {forceResult.actions.map((action, index) => (
              <Typography key={index} variant="body2" sx={{ ml: 2, mb: 0.5 }}>
                {action}
              </Typography>
            ))}
          </Box>
        )}
        
        {forceResult.torrentStatus && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Final Status:</Typography>
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell>Ready</TableCell>
                  <TableCell>{forceResult.torrentStatus.ready ? 'Yes' : 'No'}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Files</TableCell>
                  <TableCell>{forceResult.torrentStatus.files}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Peers</TableCell>
                  <TableCell>{forceResult.torrentStatus.peers}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Progress</TableCell>
                  <TableCell>{Math.round(forceResult.torrentStatus.progress * 100)}%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Box>
        )}
      </Box>
    );
  }
  
  // Render metadata wait result
  function renderMetadataWait() {
    if (!metadataWait) return null;
    
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" gutterBottom>
          Metadata Wait Result
        </Typography>
        
        {metadataWait.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {metadataWait.error}
          </Alert>
        )}
        
        <Alert severity={metadataWait.success ? 'success' : 'warning'} sx={{ mb: 2 }}>
          {metadataWait.success ? 'Metadata received successfully!' : 'Metadata wait timed out'}
        </Alert>
        
        {metadataWait.checkpoints && metadataWait.checkpoints.length > 0 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Progress Checkpoints:</Typography>
            <TableContainer sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Check</TableCell>
                    <TableCell>Time (ms)</TableCell>
                    <TableCell>Ready</TableCell>
                    <TableCell>Files</TableCell>
                    <TableCell>Peers</TableCell>
                    <TableCell>Progress</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {metadataWait.checkpoints.map((checkpoint, index) => (
                    <TableRow key={index}>
                      <TableCell>{checkpoint.check || checkpoint.event || index + 1}</TableCell>
                      <TableCell>{checkpoint.elapsed}</TableCell>
                      <TableCell>{checkpoint.ready ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{checkpoint.files || 0}</TableCell>
                      <TableCell>{checkpoint.peers || 0}</TableCell>
                      <TableCell>{checkpoint.progress || 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </Box>
    );
  }
  
  return (
    <Paper sx={{ 
      p: 2, 
      mt: 2,
      backgroundColor: (theme) => alpha(theme.palette.warning.main, 0.05),
      border: (theme) => `1px solid ${alpha(theme.palette.warning.main, 0.2)}`
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <BugReportIcon color="warning" />
        <Typography variant="h6">
          Metadata Debug Panel
        </Typography>
      </Box>
      
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Debugging torrent: <strong>{torrentName}</strong>
        <br />
        Hash: <span style={{ fontFamily: 'monospace' }}>{torrentHash}</span>
      </Typography>
      
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Button
          variant="outlined"
          size="small"
          startIcon={loading && loadingType === 'diagnose' ? <CircularProgress size={16} /> : <BugReportIcon />}
          onClick={handleDiagnose}
          disabled={loading}
        >
          Run Diagnosis
        </Button>
        
        <Button
          variant="outlined"
          size="small"
          startIcon={loading && loadingType === 'force' ? <CircularProgress size={16} /> : <BuildIcon />}
          onClick={handleForceMetadata}
          disabled={loading}
        >
          Force Metadata
        </Button>
        
        <Button
          variant="outlined"
          size="small"
          startIcon={loading && loadingType === 'wait' ? <CircularProgress size={16} /> : <AccessTimeIcon />}
          onClick={handleWaitForMetadata}
          disabled={loading}
        >
          Wait for Metadata
        </Button>
      </Box>
      
      {renderDiagnosis()}
      {renderForceResult()}
      {renderMetadataWait()}
    </Paper>
  );
}

export default MetadataDebugPanel;