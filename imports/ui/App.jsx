import React from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { get } from 'lodash';

import { Settings } from '../api/settings/settings';
import TorrentList from './components/TorrentList';
import PeerList from './components/PeerList';
import DataViewer from './components/DataViewer';
import CreateTorrent from './components/CreateTorrent';

// Create a theme based on settings
function createAppTheme() {
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
            padding: uiConfig.density === 'compact' ? '4px 8px' : '8px 16px',
          },
        },
      },
    },
  });
}

export const App = function() {
  const [theme, setTheme] = React.useState(createAppTheme());
  const [selectedTorrent, setSelectedTorrent] = React.useState(null);
  
  // Handle torrent selection
  function handleSelectTorrent(torrent) {
    setSelectedTorrent(torrent);
  }
  
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
      </Box>
    </ThemeProvider>
  );
};