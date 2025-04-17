import React, { useState, useEffect } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { get } from 'lodash';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';

import { Settings } from '../api/settings/settings';
import TorrentList from './components/TorrentList';
import PeerList from './components/PeerList';
import DataViewer from './components/DataViewer';
import CreateTorrent from './components/CreateTorrent';
import DebugPanel from './components/DebugPanel';
import FallbackMode from './components/FallbackMode';
import { WebTorrentClient } from '../api/torrents/webtorrent-client';

// Create a theme based on settings
function createAppTheme() {
  try {
    const uiConfig = Settings.getUIConfig();
    const isDark = get(uiConfig, 'theme', 'light') === 'dark';
    
    return createTheme({
      palette: {
        mode: isDark ? 'dark' : 'light',
        primary: {
          main: '#3f51b5',
        },
        secondary: {
          main: '#f50057',
        },
      },
      typography: {
        fontFamily: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
        ].join(','),
      },
      components: {
        MuiTableCell: {
          styleOverrides: {
            root: {
              padding: get(uiConfig, 'density') === 'compact' ? '4px 8px' : '8px 16px',
            },
          },
        },
      },
    });
  } catch (error) {
    console.error('Error creating theme:', error);
    // Return default theme if there's an error
    return createTheme();
  }
}

// Make sure to export the component correctly
// Note we're using a named function instead of an arrow function with const
export function App() {
  const [theme, setTheme] = useState(createAppTheme());
  const [selectedTorrent, setSelectedTorrent] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fallbackMode, setFallbackMode] = useState(false);
  
  // Effect to initialize app and handle errors
  useEffect(function() {
    try {
      console.log('App component mounted');
      
      // Show loading indicator initially
      setIsLoading(true);
      
      // Check if WebTorrent initialization failed
      // We'll look for an error message in session storage
      const webtorrentError = sessionStorage.getItem('webtorrent-error');
      if (webtorrentError) {
        console.warn('Found WebTorrent error:', webtorrentError);
        setError(`WebTorrent initialization error: ${webtorrentError}`);
        setFallbackMode(true);
        
        // Clear the error so we don't show it again on refresh
        sessionStorage.removeItem('webtorrent-error');
      } else {
        // Check if WebTorrent is actually initialized
        const client = WebTorrentClient.getClient();
        if (!client) {
          console.warn('WebTorrent client not found, enabling fallback mode');
          setFallbackMode(true);
        }
      }
      
      // Create a timeout to ensure the UI has time to initialize
      const timer = setTimeout(function() {
        setIsLoading(false);
        console.log('App loading complete');
      }, 1000);
      
      return function() {
        clearTimeout(timer);
      };
    } catch (err) {
      console.error('Error in App initialization:', err);
      setError(err.message || 'Unknown error occurred during application initialization');
      setIsLoading(false);
      setFallbackMode(true);
    }
  }, []);
  
  // Handle torrent selection
  function handleSelectTorrent(torrent) {
    setSelectedTorrent(torrent);
  }
  
  // Show loading state
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  
  // If fallback mode is enabled, show limited functionality UI
  if (fallbackMode) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ flexGrow: 1, m: 2 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            FHIR P2P Data Sharing
          </Typography>
          
          <FallbackMode error={error} />
          
          {/* Debug panel works in fallback mode too */}
          <DebugPanel />
        </Box>
      </ThemeProvider>
    );
  }
  
  // Show error if there is one
  if (error) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ m: 2 }}>
          <Alert severity="error">
            Error: {error}
          </Alert>
          <DebugPanel />
        </Box>
      </ThemeProvider>
    );
  }
  
  // Main application
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ flexGrow: 1, m: 2 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          FHIR P2P Data Sharing
        </Typography>
        
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TorrentList onSelectTorrent={handleSelectTorrent} />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <PeerList />
          </Grid>
          
          <Grid item xs={12}>
            <DataViewer selectedTorrent={selectedTorrent} />
          </Grid>
          
          <Grid item xs={12}>
            <CreateTorrent />
          </Grid>
        </Grid>
        
        {/* Add Debug Panel */}
        <DebugPanel />
      </Box>
    </ThemeProvider>
  );
}