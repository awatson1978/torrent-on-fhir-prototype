import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { get } from 'lodash';
import Paper from '@mui/material/Paper';
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
import { TorrentsCollection } from '../../api/torrents/torrents';

function PeerList() {
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Get torrents data
  const { torrents, isLoading } = useTracker(function() {
    const sub = Meteor.subscribe('torrents.all');
    return {
      torrents: TorrentsCollection.find({}).fetch(),
      isLoading: !sub.ready()
    };
  });
  
  // Track connected peers
  useEffect(function() {
    let mounted = true;
    let peersInterval = null;
    
    // Function to update peers
    function updatePeers() {
      if (!mounted) return;
      
      // Get unique peers from all torrents
      if (isLoading) {
        setLoading(true);
        return;
      }
      
      try {
        // Extract peer information from torrent status
        const peerMap = new Map();
        
        torrents.forEach(function(torrent) {
          // Each torrent has peers count
          const peerCount = get(torrent, 'status.peers', 0);
          
          if (peerCount > 0) {
            // Since we can't get detailed peer information from the server directly,
            // we'll just show summary information per torrent
            const torrentInfoHash = torrent.infoHash.substring(0, 8) + '...';
            const uniqueId = `${torrent.infoHash}-peers`;
            
            peerMap.set(uniqueId, {
              id: uniqueId,
              torrentName: torrent.name,
              torrentHash: torrentInfoHash,
              peerCount: peerCount,
              downloadSpeed: get(torrent, 'status.downloadSpeed', 0),
              uploadSpeed: get(torrent, 'status.uploadSpeed', 0),
              progress: get(torrent, 'status.progress', 0) * 100
            });
          }
        });
        
        // Convert to array
        setPeers(Array.from(peerMap.values()));
        setLoading(false);
      } catch (err) {
        console.error('Error updating peers:', err);
        setError(`Error updating peers: ${err.message}`);
        setLoading(false);
      }
    }
    
    // Update immediately and then every 2 seconds
    updatePeers();
    peersInterval = setInterval(updatePeers, 2000);
    
    return function() {
      mounted = false;
      if (peersInterval) {
        clearInterval(peersInterval);
      }
    };
  }, [torrents, isLoading]);
  
  // Format speed (bytes/sec) to human-readable format
  function formatSpeed(bytesPerSec) {
    if (bytesPerSec === 0) return '0 B/s';
    
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  return (
    <Paper sx={{ width: '100%', mb: 2, p: 2 }}>
      <Typography variant="h6" component="h2" gutterBottom>
        Connected Peers
      </Typography>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}
      
      {loading ? (
        <LinearProgress />
      ) : peers.length === 0 ? (
        <Typography variant="body1">No peers connected.</Typography>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="peers table">
            <TableHead>
              <TableRow>
                <TableCell>Torrent</TableCell>
                <TableCell>Torrent Hash</TableCell>
                <TableCell>Peer Count</TableCell>
                <TableCell>Download</TableCell>
                <TableCell>Upload</TableCell>
                <TableCell>Progress</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {peers.map((peer) => (
                <TableRow key={peer.id}>
                  <TableCell>{peer.torrentName}</TableCell>
                  <TableCell>{peer.torrentHash}</TableCell>
                  <TableCell>{peer.peerCount}</TableCell>
                  <TableCell>{formatSpeed(peer.downloadSpeed)}</TableCell>
                  <TableCell>{formatSpeed(peer.uploadSpeed)}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Box sx={{ width: '100%', mr: 1 }}>
                        <LinearProgress 
                          variant="determinate" 
                          value={peer.progress} 
                        />
                      </Box>
                      <Box sx={{ minWidth: 35 }}>
                        <Typography variant="body2" color="text.secondary">
                          {Math.round(peer.progress)}%
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}

export default PeerList;