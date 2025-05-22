import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import { get } from 'lodash';

// Icons
import RefreshIcon from '@mui/icons-material/Refresh';
import PeopleIcon from '@mui/icons-material/People';
import ComputerIcon from '@mui/icons-material/Computer';
import PublicIcon from '@mui/icons-material/Public';

function PeerList({ compact = false }) {
  const [peers, setPeers] = useState([]);
  const [networkStats, setNetworkStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Fetch peers on component mount and set up interval
  useEffect(function() {
    fetchPeerData();
    
    // Set up periodic updates
    const updateInterval = Meteor.setInterval(fetchPeerData, 5000);
    
    return function() {
      Meteor.clearInterval(updateInterval);
    };
  }, []);
  
  // Fetch peer data from server
  function fetchPeerData() {
    if (!compact) {
      setLoading(true);
    }
    
    // Get all peers across all torrents
    Meteor.call('peers.getAll', function(err, result) {
      if (err) {
        console.error('Error fetching peer data:', err);
        setError(`Error fetching peer data: ${err.message}`);
        setLoading(false);
      } else {
        // Process the peers data from the server
        const peerMap = new Map();
        
        if (Array.isArray(result)) {
          // Group peers by torrent
          result.forEach(function(peer) {
            const torrentName = peer.torrentName || 'Unknown';
            const torrentHash = peer.torrentInfoHash || 'unknown';
            const uniqueId = `${torrentHash}-peers`;
            
            if (!peerMap.has(uniqueId)) {
              peerMap.set(uniqueId, {
                id: uniqueId,
                torrentName: torrentName,
                torrentHash: torrentHash,
                peerCount: 1,
                peers: [peer]
              });
            } else {
              const existing = peerMap.get(uniqueId);
              existing.peerCount += 1;
              existing.peers.push(peer);
            }
          });
        }
        
        // Convert to array for display
        setPeers(Array.from(peerMap.values()));
        setLoading(false);
      }
    });
    
    // Also get network stats
    Meteor.call('peers.getNetworkStats', function(err, result) {
      if (!err && result) {
        setNetworkStats(result);
      }
    });
  }
  
  // Format bytes to human-readable format
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  // Format speed (bytes/sec) to human-readable format
  function formatSpeed(bytesPerSec) {
    return formatBytes(bytesPerSec) + '/s';
  }
  
  // Compact view for collapsible section
  if (compact) {
    return (
      <Box sx={{ p: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        )}
        
        {peers.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <PeopleIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No peer connections found
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Peers will appear here when sharing data
            </Typography>
          </Box>
        ) : (
          <Box>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Active Connections
              </Typography>
              {get(networkStats, 'peers', 0) > 0 && (
                <Typography variant="body2" color="text.secondary">
                  Total: {get(networkStats, 'peers', 0)} peers • 
                  ↓ {formatSpeed(get(networkStats, 'downloadSpeed', 0))} • 
                  ↑ {formatSpeed(get(networkStats, 'uploadSpeed', 0))}
                </Typography>
              )}
            </Box>
            
            {peers.map((peerGroup) => (
              <Box 
                key={peerGroup.id} 
                sx={{ 
                  mb: 2, 
                  p: 2, 
                  border: 1, 
                  borderColor: 'divider',
                  borderRadius: 1,
                  backgroundColor: 'background.paper'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2" noWrap>
                    {peerGroup.torrentName}
                  </Typography>
                  <Chip
                    icon={<PeopleIcon />}
                    label={`${peerGroup.peerCount} peers`}
                    size="small"
                    variant="outlined"
                    color="primary"
                  />
                </Box>
                
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {peerGroup.torrentHash.substring(0, 16)}...
                </Typography>
                
                {peerGroup.peers.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Clients: {peerGroup.peers.slice(0, 3).map((peer, idx) => (
                        <span key={idx}>
                          {peer.client || 'Unknown'}
                          {idx < Math.min(peerGroup.peers.length, 3) - 1 ? ', ' : ''}
                        </span>
                      ))}
                      {peerGroup.peers.length > 3 && ` +${peerGroup.peers.length - 3} more`}
                    </Typography>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    );
  }
  
  // Full view (standalone component)
  return (
    <Box sx={{ width: '100%', mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, px: 2, pt: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PeopleIcon color="primary" />
          <Typography variant="h6" component="h2">
            Connected Peers
          </Typography>
        </Box>
        
        <Button
          startIcon={<RefreshIcon />}
          onClick={fetchPeerData}
          size="small"
          variant="outlined"
        >
          Refresh
        </Button>
      </Box>
      
      {get(networkStats, 'peers', 0) > 0 && (
        <Box sx={{ mb: 2, px: 2 }}>
          <Alert severity="info" variant="outlined">
            <Typography variant="body2">
              <strong>Network Overview:</strong> {get(networkStats, 'peers', 0)} peers connected • 
              Download: {formatSpeed(get(networkStats, 'downloadSpeed', 0))} • 
              Upload: {formatSpeed(get(networkStats, 'uploadSpeed', 0))} • 
              {get(networkStats, 'torrents', 0)} active shares
            </Typography>
          </Alert>
        </Box>
      )}
      
      {error && (
        <Alert severity="error" sx={{ mx: 2, mb: 2 }}>{error}</Alert>
      )}
      
      {loading ? (
        <Box sx={{ px: 2 }}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
            Loading peer connections...
          </Typography>
        </Box>
      ) : peers.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <PeopleIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No peer connections
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
            Peer connections will appear here when you're actively sharing or downloading FHIR data.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add a torrent to start connecting with peers.
          </Typography>
        </Box>
      ) : (
        <TableContainer sx={{ px: 2 }}>
          <Table size="small" aria-label="peers table">
            <TableHead>
              <TableRow>
                <TableCell>Share</TableCell>
                <TableCell>Torrent Hash</TableCell>
                <TableCell align="center">Peers</TableCell>
                <TableCell>Client Software</TableCell>
                <TableCell>Connection</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {peers.map((peerGroup) => (
                <TableRow key={peerGroup.id} hover>
                  <TableCell component="th" scope="row">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ComputerIcon color="primary" fontSize="small" />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {peerGroup.torrentName}
                      </Typography>
                    </Box>
                  </TableCell>
                  
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {peerGroup.torrentHash.substring(0, 8)}...
                    </Typography>
                  </TableCell>
                  
                  <TableCell align="center">
                    <Chip
                      icon={<PeopleIcon />}
                      label={peerGroup.peerCount}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  </TableCell>
                  
                  <TableCell>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {peerGroup.peers.slice(0, 3).map((peer, idx) => (
                        <Chip
                          key={idx}
                          label={peer.client || 'Unknown'}
                          size="small"
                          variant="outlined"
                          color="secondary"
                        />
                      ))}
                      {peerGroup.peers.length > 3 && (
                        <Chip
                          label={`+${peerGroup.peers.length - 3}`}
                          size="small"
                          variant="outlined"
                          color="default"
                        />
                      )}
                    </Box>
                  </TableCell>
                  
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PublicIcon fontSize="small" color="success" />
                      <Typography variant="body2" color="success.main">
                        Active
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

export default PeerList;