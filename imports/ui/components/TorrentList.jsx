import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { get } from 'lodash';
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
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import moment from 'moment';

// Icons
import DeleteIcon from '@mui/icons-material/Delete';
import PauseIcon from '@mui/icons-material/Pause';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import RefreshIcon from '@mui/icons-material/Refresh';
import FolderIcon from '@mui/icons-material/Folder';
import CloudIcon from '@mui/icons-material/Cloud';
import DataObjectIcon from '@mui/icons-material/DataObject';
import TableViewIcon from '@mui/icons-material/TableView';
import PeopleIcon from '@mui/icons-material/People';

import { TorrentsCollection } from '../../api/torrents/torrents';

// Format bytes to human-readable format
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Format speed (bytes/sec) to human-readable format
function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec === 0) return '0 B/s';
  return formatBytes(bytesPerSec) + '/s';
}

// Get status color and info
function getStatusInfo(torrent) {
  const state = get(torrent, 'status.state', 'unknown');
  const progress = get(torrent, 'status.progress', 0);
  
  if (state === 'seeding' || progress >= 1) {
    return {
      color: 'success',
      label: 'Seeding',
      icon: <CloudIcon fontSize="small" />
    };
  } else if (state === 'downloading') {
    return {
      color: 'info',
      label: 'Downloading',
      icon: <CloudIcon fontSize="small" />
    };
  } else if (state === 'paused') {
    return {
      color: 'warning',
      label: 'Paused',
      icon: <PauseIcon fontSize="small" />
    };
  } else {
    return {
      color: 'default',
      label: 'Unknown',
      icon: <CloudIcon fontSize="small" />
    };
  }
}

function TorrentList({ onSelectTorrent, onTorrentsUpdate, selectedTorrent }) {
  const [successMessage, setSuccessMessage] = useState('');
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuTorrent, setMenuTorrent] = useState(null);

  // Subscribe to torrents and get data
  const { torrents, isLoading, isReady } = useTracker(function() {
    console.log('TorrentList: Rerunning tracker function');
    const sub = Meteor.subscribe('torrents.all');
    
    const results = TorrentsCollection.find({}, { sort: { created: -1 } }).fetch();
    console.log(`TorrentList: Subscription ${sub.ready() ? 'ready' : 'not ready'}, found ${results.length} torrents`);
    
    return {
      torrents: results,
      isLoading: !sub.ready(),
      isReady: sub.ready()
    };
  }, []);
  
  // Update parent component with torrents
  useEffect(function() {
    if (onTorrentsUpdate) {
      onTorrentsUpdate(torrents);
    }
  }, [torrents, onTorrentsUpdate]);
  
  // Handle context menu
  function handleMenuClick(event, torrent) {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setMenuTorrent(torrent);
  }
  
  function handleMenuClose() {
    setAnchorEl(null);
    setMenuTorrent(null);
  }
  
  // Handle torrent removal
  function handleRemoveTorrent(infoHash) {
    handleMenuClose();
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
    handleMenuClose();
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
    if (onSelectTorrent) {
      onSelectTorrent(torrent);
    }
  }
  
  // Copy magnet URI
  function copyMagnetUri(magnetUri) {
    handleMenuClose();
    navigator.clipboard.writeText(magnetUri);
    setSuccessMessage('Magnet URI copied to clipboard!');
    setTimeout(() => setSuccessMessage(''), 3000);
  }
  
  // Direct action handlers (for icon buttons)
  function handleDirectPause(event, infoHash, currentState) {
    event.stopPropagation();
    handleTogglePause(infoHash, currentState);
  }
  
  function handleDirectCopy(event, magnetUri) {
    event.stopPropagation();
    copyMagnetUri(magnetUri);
  }
  
  function handleDirectRemove(event, infoHash) {
    event.stopPropagation();
    handleRemoveTorrent(infoHash);
  }
  
  // Force refresh
  function handleRefresh() {
    Meteor.call('debug.checkTorrentConnection', function(err, result) {
      if (err) {
        console.error('Error checking connection:', err);
      } else {
        console.log('Connection status:', result);
      }
    });
    
    Meteor.subscribe('torrents.all', {
      onReady: function() {
        console.log('Torrents subscription refreshed');
      },
      onError: function(error) {
        console.error('Error refreshing torrents:', error);
      }
    });
  }
  
  // Empty state
  if (!isLoading && torrents.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <FolderIcon 
          sx={{ 
            fontSize: 64, 
            color: 'text.disabled',
            mb: 2
          }} 
        />
        <Typography variant="h6" color="text.secondary" gutterBottom>
          No shares yet
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
          Get started by sharing your FHIR data or joining an existing share from the community.
        </Typography>
      </Box>
    );
  }
  
  return (
    <Box>
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
        <Box sx={{ p: 3 }}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
            Loading shares...
          </Typography>
        </Box>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="torrents table">
            <TableHead>
              <TableRow>
                <TableCell>Share</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Progress</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Network</TableCell>
                <TableCell align="right">
                  <Tooltip title="Refresh">
                    <IconButton size="small" onClick={handleRefresh}>
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {torrents.map((torrent) => {
                const statusInfo = getStatusInfo(torrent);
                const isSelected = selectedTorrent?.infoHash === torrent.infoHash;
                
                // Fix progress calculation - handle both 0-1 and 0-100 ranges
                let progressValue = get(torrent, 'status.progress', 0);
                if (progressValue > 1) {
                  progressValue = progressValue / 100; // Convert from 0-100 to 0-1 if needed
                }
                progressValue = Math.min(Math.max(progressValue, 0), 1); // Clamp between 0 and 1
                
                // Fix size - use the torrent size or calculate from files
                let displaySize = get(torrent, 'size', 0);
                if (!displaySize || displaySize === 0) {
                  // Try to calculate from files
                  const files = get(torrent, 'files', []);
                  if (files.length > 0) {
                    displaySize = files.reduce((total, file) => total + (file.size || 0), 0);
                  }
                }
                
                return (
                  <TableRow
                    key={torrent.infoHash}
                    hover
                    onClick={() => handleSelectTorrent(torrent)}
                    sx={{ 
                      cursor: 'pointer',
                      backgroundColor: isSelected ? 
                        (theme) => alpha(theme.palette.primary.main, 0.08) : 
                        'transparent',
                      '&:hover': {
                        backgroundColor: isSelected ? 
                          (theme) => alpha(theme.palette.primary.main, 0.12) : 
                          'action.hover'
                      }
                    }}
                  >
                    <TableCell component="th" scope="row">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {torrent.fhirType === 'bundle' ? (
                          <DataObjectIcon color="primary" fontSize="small" />
                        ) : (
                          <TableViewIcon color="secondary" fontSize="small" />
                        )}
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {torrent.name || 'Unnamed Share'}
                          </Typography>
                          {torrent.description && (
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {torrent.description}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    
                    <TableCell>
                      <Typography variant="body2">
                        {formatBytes(displaySize)}
                      </Typography>
                    </TableCell>
                    
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 120 }}>
                        <Box sx={{ width: '100%' }}>
                          <LinearProgress 
                            variant="determinate" 
                            value={progressValue * 100} 
                            sx={{ height: 6, borderRadius: 3 }}
                          />
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 35 }}>
                          {Math.round(progressValue * 100)}%
                        </Typography>
                      </Box>
                    </TableCell>
                    
                    <TableCell>
                      <Chip
                        icon={statusInfo.icon}
                        label={statusInfo.label}
                        color={statusInfo.color}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {torrent.created ? moment(torrent.created).fromNow() : 'Unknown'}
                      </Typography>
                    </TableCell>
                    
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PeopleIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {get(torrent, 'status.peers', 0)}
                        </Typography>
                        {get(torrent, 'status.downloadSpeed', 0) > 0 && (
                          <Typography variant="caption" color="success.main">
                            ↓{formatSpeed(get(torrent, 'status.downloadSpeed', 0))}
                          </Typography>
                        )}
                        {get(torrent, 'status.uploadSpeed', 0) > 0 && (
                          <Typography variant="caption" color="info.main">
                            ↑{formatSpeed(get(torrent, 'status.uploadSpeed', 0))}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {/* Direct action buttons */}
                        <Tooltip title={get(torrent, 'status.state') === 'paused' ? 'Resume' : 'Pause'}>
                          <IconButton 
                            size="small" 
                            onClick={(e) => handleDirectPause(e, torrent.infoHash, get(torrent, 'status.state'))}
                            sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
                          >
                            {get(torrent, 'status.state') === 'paused' ? (
                              <PlayArrowIcon fontSize="small" />
                            ) : (
                              <PauseIcon fontSize="small" />
                            )}
                          </IconButton>
                        </Tooltip>
                        
                        <Tooltip title="Copy Magnet Link">
                          <IconButton 
                            size="small" 
                            onClick={(e) => handleDirectCopy(e, torrent.magnetURI)}
                            disabled={!torrent.magnetURI}
                            sx={{ opacity: 0.7, '&:hover': { opacity: 1 } }}
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        
                        <Tooltip title="Remove">
                          <IconButton 
                            size="small" 
                            onClick={(e) => handleDirectRemove(e, torrent.infoHash)}
                            sx={{ opacity: 0.7, '&:hover': { opacity: 1 }, color: 'error.main' }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      
      {/* Context Menu (for additional options) */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: { minWidth: 180 }
        }}
      >
        <MenuItem onClick={handleMenuClose} disabled>
          <Typography variant="body2" color="text.secondary">
            Additional Options
          </Typography>
        </MenuItem>
        
        <MenuItem onClick={() => {
          if (menuTorrent) {
            console.log('Torrent details:', menuTorrent);
          }
          handleMenuClose();
        }}>
          View Details
        </MenuItem>
        
        <MenuItem onClick={() => {
          if (menuTorrent && menuTorrent.magnetURI) {
            console.log('Magnet URI:', menuTorrent.magnetURI);
          }
          handleMenuClose();
        }}>
          Show Magnet URI
        </MenuItem>
      </Menu>
    </Box>
  );
}

export default TorrentList;