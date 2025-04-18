import React, { useState } from 'react';
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
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import PauseIcon from '@mui/icons-material/Pause';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import RefreshIcon from '@mui/icons-material/Refresh';
import moment from 'moment';

import { TorrentsCollection } from '../../api/torrents/torrents';

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

function TorrentList(props) {

  const [successMessage, setSuccessMessage] = useState('');
  

  // Subscribe to torrents and get data
  const { torrents, isLoading, isReady } = useTracker(function() {
    console.log('TorrentList: Rerunning tracker function');
    const sub = Meteor.subscribe('torrents.all');
    
    // Check if we have any torrents
    const results = TorrentsCollection.find({}, { sort: { created: -1 } }).fetch();
    console.log(`TorrentList: Subscription ${sub.ready() ? 'ready' : 'not ready'}, found ${results.length} torrents`);
    
    return {
      torrents: results,
      isLoading: !sub.ready(),
      isReady: sub.ready()
    };
  }, []);
  
  // Handle torrent removal
  function handleRemoveTorrent(infoHash) {
    if (confirm('Are you sure you want to remove this torrent?')) {
      Meteor.call('torrents.remove', infoHash, false, function(err) {
        if (err) {
          console.error('Error removing torrent:', err);
          alert('Error removing torrent: ' + err.message);
        }
      });
    }
  }
  
  // Handle torrent pause/resume
  function handleTogglePause(infoHash, currentState) {
    if (currentState === 'paused') {
      Meteor.call('torrents.resume', infoHash, function(err) {
        if (err) {
          console.error('Error resuming torrent:', err);
          alert('Error resuming torrent: ' + err.message);
        }
      });
    } else {
      Meteor.call('torrents.pause', infoHash, function(err) {
        if (err) {
          console.error('Error pausing torrent:', err);
          alert('Error pausing torrent: ' + err.message);
        }
      });
    }
  }
  
  // Handle torrent selection
  function handleSelectTorrent(torrent) {
    if (props.onSelectTorrent) {
      props.onSelectTorrent(torrent);
    }
  }
  
  // Force refresh subscriptions
  function handleRefresh() {
    setLoading(true);
    
    // Force new subscription
    Meteor.subscribe('torrents.all', {
      onReady: function() {
        setLoading(false);
      },
      onError: function(error) {
        console.error('Error refreshing torrents:', error);
        setLoading(false);
        setError('Error refreshing: ' + error.message);
      }
    });
  }
  function copyMagnetUri(magnetUri) {
    navigator.clipboard.writeText(magnetUri);
    setSuccessMessage('Magnet URI copied to clipboard!');
  }
  
  return (
    <Paper sx={{ width: '100%', mb: 2, p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" component="h2">
          Available Torrents
        </Typography>
        
        <Button
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          size="small"
        >
          Refresh
        </Button>
      </Box>
      {successMessage && (
        <Alert 
          severity="success" 
          sx={{ mb: 2 }}
          onClose={() => setSuccessMessage('')}
        >
          {successMessage}
        </Alert>
      )}
      
      {isLoading ? (
        <LinearProgress />
      ) : torrents.length === 0 ? (
        <Alert severity="info">
          No torrents available. Add a torrent using a magnet link to get started.
        </Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="torrents table">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Progress</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Speed</TableCell>
                <TableCell>Peers</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {torrents.map((torrent) => (
                <TableRow
                  key={torrent.infoHash}
                  hover
                  onClick={() => handleSelectTorrent(torrent)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell component="th" scope="row">
                    {torrent.name || 'Unnamed Torrent'}
                  </TableCell>
                  <TableCell>{formatBytes(torrent.size || 0)}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Box sx={{ width: '100%', mr: 1 }}>
                        <LinearProgress 
                          variant="determinate" 
                          value={get(torrent, 'status.progress', 0) * 100} 
                        />
                      </Box>
                      <Box sx={{ minWidth: 35 }}>
                        <Typography variant="body2" color="text.secondary">
                          {Math.round(get(torrent, 'status.progress', 0) * 100)}%
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>{torrent.fhirType || 'unknown'}</TableCell>
                  <TableCell>
                    {torrent.created ? moment(torrent.created).fromNow() : 'Unknown'}
                  </TableCell>
                  <TableCell>
                    {formatSpeed(get(torrent, 'status.downloadSpeed', 0))}
                  </TableCell>
                  <TableCell>{get(torrent, 'status.peers', 0)}</TableCell>
                  <TableCell>
                    <IconButton 
                      size="small" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePause(torrent.infoHash, get(torrent, 'status.state'));
                      }}
                    >
                      {get(torrent, 'status.state') === 'paused' ? 
                        <PlayArrowIcon /> : <PauseIcon />}
                    </IconButton>
                    <IconButton 
                      size="small" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTorrent(torrent.infoHash);
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      onClick={(e) => {
                        e.stopPropagation();
                        copyMagnetUri(torrent.magnetURI);
                      }}
                    >
                      <ContentCopyIcon />
                    </IconButton>
                    
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

export default TorrentList;

// import React from 'react';
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
// import Button from '@mui/material/Button';
// import IconButton from '@mui/material/IconButton';
// import DeleteIcon from '@mui/icons-material/Delete';
// import PauseIcon from '@mui/icons-material/Pause';
// import PlayArrowIcon from '@mui/icons-material/PlayArrow';
// import Box from '@mui/material/Box';
// import moment from 'moment';

// import { TorrentsCollection } from '../../api/torrents/torrents';

// // Format bytes to human-readable format
// function formatBytes(bytes, decimals = 2) {
//   if (bytes === 0) return '0 Bytes';
  
//   const k = 1024;
//   const dm = decimals < 0 ? 0 : decimals;
//   const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
//   const i = Math.floor(Math.log(bytes) / Math.log(k));
  
//   return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
// }

// // Format speed (bytes/sec) to human-readable format
// function formatSpeed(bytesPerSec) {
//   return formatBytes(bytesPerSec) + '/s';
// }

// function TorrentList(props) {
//   // Subscribe to torrents and get data
//   const { torrents, isLoading } = useTracker(function() {
//     const sub = Meteor.subscribe('torrents.all');
//     return {
//       torrents: TorrentsCollection.find({}, { sort: { created: -1 } }).fetch(),
//       isLoading: !sub.ready()
//     };
//   });
  
//   // Handle torrent removal
//   function handleRemoveTorrent(infoHash) {
//     if (confirm('Are you sure you want to remove this torrent?')) {
//       Meteor.call('torrents.remove', infoHash, false, function(err) {
//         if (err) {
//           console.error('Error removing torrent:', err);
//           alert('Error removing torrent: ' + err.message);
//         }
//       });
//     }
//   }
  
//   // Handle torrent pause/resume
//   function handleTogglePause(infoHash, currentState) {
//     if (currentState === 'paused') {
//       Meteor.call('torrents.resume', infoHash, function(err) {
//         if (err) {
//           console.error('Error resuming torrent:', err);
//           alert('Error resuming torrent: ' + err.message);
//         }
//       });
//     } else {
//       Meteor.call('torrents.pause', infoHash, function(err) {
//         if (err) {
//           console.error('Error pausing torrent:', err);
//           alert('Error pausing torrent: ' + err.message);
//         }
//       });
//     }
//   }
  
//   // Handle torrent selection
//   function handleSelectTorrent(torrent) {
//     if (props.onSelectTorrent) {
//       props.onSelectTorrent(torrent);
//     }
//   }
  
//   return (
//     <Paper sx={{ width: '100%', mb: 2, p: 2 }}>
//       <Typography variant="h6" component="h2" gutterBottom>
//         Available Torrents
//       </Typography>
      
//       {isLoading ? (
//         <LinearProgress />
//       ) : torrents.length === 0 ? (
//         <Typography variant="body1">No torrents available. Create a new one to get started.</Typography>
//       ) : (
//         <TableContainer>
//           <Table size="small" aria-label="torrents table">
//             <TableHead>
//               <TableRow>
//                 <TableCell>Name</TableCell>
//                 <TableCell>Size</TableCell>
//                 <TableCell>Progress</TableCell>
//                 <TableCell>Type</TableCell>
//                 <TableCell>Created</TableCell>
//                 <TableCell>Speed</TableCell>
//                 <TableCell>Peers</TableCell>
//                 <TableCell>Actions</TableCell>
//               </TableRow>
//             </TableHead>
//             <TableBody>
//               {torrents.map((torrent) => (
//                 <TableRow
//                   key={torrent.infoHash}
//                   hover
//                   onClick={() => handleSelectTorrent(torrent)}
//                   sx={{ cursor: 'pointer' }}
//                 >
//                   <TableCell component="th" scope="row">
//                     {torrent.name}
//                   </TableCell>
//                   <TableCell>{formatBytes(torrent.size)}</TableCell>
//                   <TableCell>
//                     <Box sx={{ display: 'flex', alignItems: 'center' }}>
//                       <Box sx={{ width: '100%', mr: 1 }}>
//                         <LinearProgress 
//                           variant="determinate" 
//                           value={get(torrent, 'status.progress', 0) * 100} 
//                         />
//                       </Box>
//                       <Box sx={{ minWidth: 35 }}>
//                         <Typography variant="body2" color="text.secondary">
//                           {Math.round(get(torrent, 'status.progress', 0) * 100)}%
//                         </Typography>
//                       </Box>
//                     </Box>
//                   </TableCell>
//                   <TableCell>{torrent.fhirType}</TableCell>
//                   <TableCell>{moment(torrent.created).fromNow()}</TableCell>
//                   <TableCell>
//                     {formatSpeed(get(torrent, 'status.downloadSpeed', 0))}
//                   </TableCell>
//                   <TableCell>{get(torrent, 'status.peers', 0)}</TableCell>
//                   <TableCell>
//                     <IconButton 
//                       size="small" 
//                       onClick={(e) => {
//                         e.stopPropagation();
//                         handleTogglePause(torrent.infoHash, get(torrent, 'status.state'));
//                       }}
//                     >
//                       {get(torrent, 'status.state') === 'paused' ? 
//                         <PlayArrowIcon /> : <PauseIcon />}
//                     </IconButton>
//                     <IconButton 
//                       size="small" 
//                       onClick={(e) => {
//                         e.stopPropagation();
//                         handleRemoveTorrent(torrent.infoHash);
//                       }}
//                     >
//                       <DeleteIcon />
//                     </IconButton>
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

// export default TorrentList;