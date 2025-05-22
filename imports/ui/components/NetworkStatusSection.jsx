import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Collapse from '@mui/material/Collapse';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import LinearProgress from '@mui/material/LinearProgress';
import { alpha } from '@mui/material/styles';
import { get } from 'lodash';
import moment from 'moment';

// Icons
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import CloudIcon from '@mui/icons-material/Cloud';
import SpeedIcon from '@mui/icons-material/Speed';
import PeopleIcon from '@mui/icons-material/People';
import RouterIcon from '@mui/icons-material/Router';
import RefreshIcon from '@mui/icons-material/Refresh';
import AnnouncementIcon from '@mui/icons-material/Announcement';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';

function TabPanel(props) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && children}
    </div>
  );
}

function NetworkStatusSection({ expanded, onToggleExpanded }) {
  const [networkStatus, setNetworkStatus] = useState(null);
  const [trackerHealth, setTrackerHealth] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  
  // Fetch network status
  useEffect(function() {
    fetchNetworkStatus();
    
    // Update every 30 seconds
    const interval = Meteor.setInterval(fetchNetworkStatus, 30000);
    
    return function() {
      Meteor.clearInterval(interval);
    };
  }, []);
  
  function fetchNetworkStatus() {
    setLoading(true);
    
    // Get detailed network status
    Meteor.call('network.getDetailedStatus', function(err, result) {
      if (!err && result) {
        setNetworkStatus(result);
      }
    });
    
    // Get tracker health
    Meteor.call('network.getTrackerHealth', function(err, result) {
      setLoading(false);
      if (!err && result) {
        setTrackerHealth(result);
        setLastUpdate(new Date());
      }
    });
  }
  
  function handleForceAnnounce() {
    setLoading(true);
    Meteor.call('network.forceAnnounce', function(err, result) {
      setLoading(false);
      if (err) {
        console.error('Force announce error:', err);
      } else {
        console.log('Force announce result:', result);
        // Refresh status after announce
        setTimeout(fetchNetworkStatus, 2000);
      }
    });
  }
  
  function getTrackerStatusInfo(status) {
    switch (status) {
      case 'active':
        return { icon: <CheckCircleIcon />, color: 'success', text: 'Active' };
      case 'error':
        return { icon: <ErrorIcon />, color: 'error', text: 'Error' };
      default:
        return { icon: <WarningIcon />, color: 'warning', text: 'Unknown' };
    }
  }
  
  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Never';
    return moment(timestamp).fromNow();
  }
  
  // Get overall status
  function getOverallStatus() {
    if (!trackerHealth) return { color: 'info', text: 'Loading...', icon: <NetworkCheckIcon /> };
    
    const activeCount = trackerHealth.activeTrackers;
    const totalCount = trackerHealth.totalTrackers;
    
    if (activeCount === 0) {
      return { color: 'error', text: 'No Active Trackers', icon: <ErrorIcon /> };
    } else if (activeCount < totalCount) {
      return { color: 'warning', text: `${activeCount}/${totalCount} Trackers`, icon: <WarningIcon /> };
    } else {
      return { color: 'success', text: 'All Trackers Active', icon: <CheckCircleIcon /> };
    }
  }
  
  const overallStatus = getOverallStatus();
  const lastAnnounce = get(networkStatus, 'trackers.lastGlobalAnnounce');
  
  return (
    <Paper sx={{ mb: 2 }} elevation={1}>
      <Box
        sx={{
          p: 2,
          cursor: 'pointer',
          transition: 'background-color 0.2s',
          '&:hover': {
            backgroundColor: (theme) => alpha(theme.palette.action.hover, 0.5)
          }
        }}
        onClick={onToggleExpanded}
      >
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          
          {/* Left side - Status */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <NetworkCheckIcon color="primary" />
              <Typography variant="h6" component="h3" sx={{ fontWeight: 500 }}>
                Network Status
              </Typography>
            </Box>
            
            <Chip
              icon={overallStatus.icon}
              label={overallStatus.text}
              color={overallStatus.color}
              size="small"
              variant="outlined"
            />
          </Box>
          
          {/* Center - Key metrics */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 3,
            color: 'text.secondary'
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <RouterIcon fontSize="small" />
              <Typography variant="body2">
                {trackerHealth ? `${trackerHealth.activeTrackers}/${trackerHealth.totalTrackers}` : '0/0'} trackers
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AnnouncementIcon fontSize="small" />
              <Typography variant="body2">
                Last: {formatTimeAgo(lastAnnounce)}
              </Typography>
            </Box>
            
            {get(networkStatus, 'dht.enabled') && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <CloudIcon fontSize="small" />
                <Typography variant="body2">
                  DHT: {get(networkStatus, 'dht.status', 'inactive')}
                </Typography>
              </Box>
            )}
          </Box>
          
          {/* Right side - Expand button */}
          <IconButton size="small">
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
          
        </Box>
      </Box>
      
      {/* Expanded content */}
      <Collapse in={expanded} timeout={300}>
        <Box sx={{ 
          borderTop: 1, 
          borderColor: 'divider',
          backgroundColor: (theme) => alpha(theme.palette.background.paper, 0.5)
        }}>
          
          {/* Action buttons */}
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
                Network Diagnostics
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<RefreshIcon />}
                  onClick={fetchNetworkStatus}
                  disabled={loading}
                >
                  Refresh
                </Button>
                
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<AnnouncementIcon />}
                  onClick={handleForceAnnounce}
                  disabled={loading}
                >
                  Force Announce
                </Button>
              </Box>
            </Box>
            
            {lastUpdate && (
              <Typography variant="caption" color="text.secondary">
                Last updated: {formatTimeAgo(lastUpdate)}
              </Typography>
            )}
            
            {loading && <LinearProgress sx={{ mt: 1 }} />}
          </Box>
          
          {/* Tabs for different views */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
              <Tab label="Tracker Status" />
              <Tab label="Announce History" />
              <Tab label="DHT & WebSeeds" />
              <Tab label="Configuration" />
            </Tabs>
          </Box>
          
          {/* Tab content */}
          <TabPanel value={activeTab} index={0}>
            <TrackerStatusTab trackerHealth={trackerHealth} />
          </TabPanel>
          
          <TabPanel value={activeTab} index={1}>
            <AnnounceHistoryTab networkStatus={networkStatus} />
          </TabPanel>
          
          <TabPanel value={activeTab} index={2}>
            <DHTWebSeedsTab networkStatus={networkStatus} />
          </TabPanel>
          
          <TabPanel value={activeTab} index={3}>
            <ConfigurationTab networkStatus={networkStatus} />
          </TabPanel>
          
        </Box>
      </Collapse>
    </Paper>
  );
}

// Tracker Status Tab Component
function TrackerStatusTab({ trackerHealth }) {
  if (!trackerHealth) {
    return <Box sx={{ p: 2 }}>Loading tracker status...</Box>;
  }
  
  return (
    <Box sx={{ p: 2 }}>
      <Alert severity="info" sx={{ mb: 2 }}>
        Trackers help peers find each other. Active trackers respond to announce requests.
      </Alert>
      
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Tracker URL</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Success Rate</TableCell>
              <TableCell>Last Announce</TableCell>
              <TableCell>Last Response</TableCell>
              <TableCell>Avg Response</TableCell>
              <TableCell>Failures</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {trackerHealth.trackers.map((tracker, index) => {
              const statusInfo = getTrackerStatusInfo(tracker.status);
              
              return (
                <TableRow key={index}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {tracker.url}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      icon={statusInfo.icon}
                      label={statusInfo.text}
                      color={statusInfo.color}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {tracker.successRate}%
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {formatTimeAgo(tracker.lastAnnounce)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {formatTimeAgo(tracker.lastResponse)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {tracker.averageResponseTime}ms
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography 
                      variant="body2" 
                      color={tracker.consecutiveFailures > 0 ? 'error.main' : 'text.secondary'}
                    >
                      {tracker.consecutiveFailures}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

// Other tab components would follow similar patterns...
// AnnounceHistoryTab, DHTWebSeedsTab, ConfigurationTab

function getTrackerStatusInfo(status) {
  switch (status) {
    case 'active':
      return { icon: <CheckCircleIcon />, color: 'success', text: 'Active' };
    case 'error':
      return { icon: <ErrorIcon />, color: 'error', text: 'Error' };
    default:
      return { icon: <WarningIcon />, color: 'warning', text: 'Unknown' };
  }
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Never';
  return moment(timestamp).fromNow();
}

export default NetworkStatusSection;