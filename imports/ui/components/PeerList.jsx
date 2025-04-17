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
import RefreshIcon from '@mui/icons-material/Refresh';
import Button from '@mui/material/Button';
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
    if (isLoading) {
      setLoading(true);
      return;
    }
    
    fetchPeerData();
    
    // Set up periodic updates
    const updateInterval = setInterval(fetchPeerData, 5000);
    
    return function() {
      clearInterval(updateInterval);
    };
  }, [torrents, isLoading]);
  
  // Fetch peer data from server
  function fetchPeerData() {
    setLoading(true);
    
    Meteor.call('peers.getAll', function(err, result) {
      setLoading(false);
      
      if (err) {
        console.error('Error fetching peer data:', err);
        setError(`Error fetching peer data: ${err.message}`);
      } else {
        // Process the peers data from the server
        const peerMap = new Map();
        
        // Group peers by torrent
        if (Array.isArray(result)) {
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
      }
    });
  }
  
  // Format speed (bytes/sec) to human-readable format
  function formatSpeed(bytesPerSec) {
    if (bytesPerSec === 0) return '0 B/s';
    
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  function handleRefresh() {
    fetchPeerData();
  }
  
  return (
    <Paper sx={{ width: '100%', mb: 2, p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" component="h2">
          Connected Peers
        </Typography>
        
        <Button
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          size="small"
        >
          Refresh Peers
        </Button>
      </Box>
      
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}
      
      {loading ? (
        <LinearProgress />
      ) : peers.length === 0 ? (
        <Alert severity="info">
          No peers connected. Add torrents to start connecting with peers.
        </Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="peers table">
            <TableHead>
              <TableRow>
                <TableCell>Torrent</TableCell>
                <TableCell>Torrent Hash</TableCell>
                <TableCell>Peer Count</TableCell>
                <TableCell>Clients</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {peers.map((peerGroup) => (
                <TableRow key={peerGroup.id}>
                  <TableCell>{peerGroup.torrentName}</TableCell>
                  <TableCell>{peerGroup.torrentHash.substring(0, 8)}...</TableCell>
                  <TableCell>{peerGroup.peerCount}</TableCell>
                  <TableCell>
                    {peerGroup.peers.slice(0, 3).map((peer, idx) => (
                      <span key={idx}>{peer.client || 'Unknown'}{idx < Math.min(peerGroup.peers.length, 3) - 1 ? ', ' : ''}</span>
                    ))}
                    {peerGroup.peers.length > 3 && ` +${peerGroup.peers.length - 3} more`}
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

// import React, { useState, useEffect } from 'react';
// import { Meteor } from 'meteor/meteor';
// import { useTracker } from 'meteor/react-meteor-data';
// import { get } from 'lodash';
// import Paper from '@mui/material/Paper';
// import Table from '@mui/material/Table';
// import TableBody from '@mui/material/TableBody';
// import TableCell from '@mui/material/TableCell';
// import TableContainer from '@mui/material/TableContainer';
// import TableHead from '@mui/material/TableHead';
// import TableRow from '@mui/material/TableRow';
// import Typography from '@mui/material/Typography';
// import LinearProgress from '@mui/material/LinearProgress';
// import Box from '@mui/material/Box';
// import Alert from '@mui/material/Alert';
// import { TorrentsCollection } from '../../api/torrents/torrents';

// function PeerList() {
//   const [peers, setPeers] = useState([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState('');
  
//   // Get torrents data
//   const { torrents, isLoading } = useTracker(function() {
//     const sub = Meteor.subscribe('torrents.all');
//     return {
//       torrents: TorrentsCollection.find({}).fetch(),
//       isLoading: !sub.ready()
//     };
//   });
  
//   useEffect(function() {
//     let mounted = true;
//     let peersInterval = null;
    
//     // Function to update peers
//     function updatePeers() {
//       if (!mounted) return;
      
//       // Get unique peers from all torrents
//       if (isLoading) {
//         setLoading(true);
//         return;
//       }
      
//       try {
//         // Extract peer information from torrent status
//         const peerMap = new Map();
        
//         torrents.forEach(function(torrent) {
//           // Each torrent has peers count
//           const peerCount = get(torrent, 'status.peers', 0);
          
//           if (peerCount > 0) {
//             // Since we can't get detailed peer information from the server directly,
//             // we'll just show summary information per torrent
//             const torrentInfoHash = torrent.infoHash.substring(0, 8) + '...';
//             const uniqueId = `${torrent.infoHash}-peers`;
            
//             peerMap.set(uniqueId, {
//               id: uniqueId,
//               torrentName: torrent.name,
//               torrentHash: torrentInfoHash,
//               peerCount: peerCount,
//               downloadSpeed: get(torrent, 'status.downloadSpeed', 0),
//               uploadSpeed: get(torrent, 'status.uploadSpeed', 0),
//               progress: get(torrent, 'status.progress', 0) * 100
//             });
//           }
//         });
        
//         // Convert to array and only update if there's a change
//         const newPeers = Array.from(peerMap.values());
//         const peersChanged = 
//           newPeers.length !== peers.length || 
//           JSON.stringify(newPeers) !== JSON.stringify(peers);
          
//         if (peersChanged) {
//           setPeers(newPeers);
//         }
        
//         setLoading(false);
//       } catch (err) {
//         console.error('Error updating peers:', err);
//         setError(`Error updating peers: ${err.message}`);
//         setLoading(false);
//       }
//     }
    
//     // Only set up the interval if not already loading
//     if (!isLoading) {
//       // Update immediately 
//       updatePeers();
      
//       // Then every 2 seconds
//       peersInterval = Meteor.setInterval(updatePeers, 2000);
//     }
    
//     return function() {
//       mounted = false;
//       if (peersInterval) {
//         Meteor.clearInterval(peersInterval);
//       }
//     };
//   }, [torrents, isLoading]);
  
//   // Format speed (bytes/sec) to human-readable format
//   function formatSpeed(bytesPerSec) {
//     if (bytesPerSec === 0) return '0 B/s';
    
//     const k = 1024;
//     const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    
//     const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    
//     return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
//   }
  
//   return (
//     <Paper sx={{ width: '100%', mb: 2, p: 2 }}>
//       <Typography variant="h6" component="h2" gutterBottom>
//         Connected Peers
//       </Typography>
      
//       {error && (
//         <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
//       )}
      
//       {loading ? (
//         <LinearProgress />
//       ) : peers.length === 0 ? (
//         <Typography variant="body1">No peers connected.</Typography>
//       ) : (
//         <TableContainer>
//           <Table size="small" aria-label="peers table">
//             <TableHead>
//               <TableRow>
//                 <TableCell>Torrent</TableCell>
//                 <TableCell>Torrent Hash</TableCell>
//                 <TableCell>Peer Count</TableCell>
//                 <TableCell>Download</TableCell>
//                 <TableCell>Upload</TableCell>
//                 <TableCell>Progress</TableCell>
//               </TableRow>
//             </TableHead>
//             <TableBody>
//               {peers.map((peer) => (
//                 <TableRow key={peer.id}>
//                   <TableCell>{peer.torrentName}</TableCell>
//                   <TableCell>{peer.torrentHash}</TableCell>
//                   <TableCell>{peer.peerCount}</TableCell>
//                   <TableCell>{formatSpeed(peer.downloadSpeed)}</TableCell>
//                   <TableCell>{formatSpeed(peer.uploadSpeed)}</TableCell>
//                   <TableCell>
//                     <Box sx={{ display: 'flex', alignItems: 'center' }}>
//                       <Box sx={{ width: '100%', mr: 1 }}>
//                         <LinearProgress 
//                           variant="determinate" 
//                           value={peer.progress} 
//                         />
//                       </Box>
//                       <Box sx={{ minWidth: 35 }}>
//                         <Typography variant="body2" color="text.secondary">
//                           {Math.round(peer.progress)}%
//                         </Typography>
//                       </Box>
//                     </Box>
//                   </TableCell>
//                 </TableRow>
//               ))}
//             </TableBody>
//           </Table>
//         </TableContainer>
//       )}
//     </Paper>
//   );
// }

// export default PeerList;