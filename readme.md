# FHIR P2P - Decentralized FHIR Data Sharing

A peer-to-peer application for sharing FHIR healthcare data using WebTorrent technology.

## Features

- Create and seed torrents containing FHIR data
- Connect to existing torrents on the network
- View and parse FHIR data (both Bundle and NDJSON formats)
- Track peer connections and network statistics
- Convert between FHIR Bundle and NDJSON formats

## Technology Stack

- Meteor 3.x (server and client framework)
- React (UI library)
- Material UI (component library)
- WebTorrent (P2P functionality)
- FHIR Kit Client (FHIR data handling)
- Monaco Editor (code viewing/editing)
- Lodash (utility functions)
- Moment (date handling)

## Prerequisites

- Node.js (v14+)
- Meteor (v3.x)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/fhir-p2p.git
   cd fhir-p2p
   ```

2. Install dependencies:
   ```
   meteor npm install
   ```

3. Create a `settings.json` file or use environment variables for configuration.

## Running the Application

### Development Mode

```
meteor run --settings config/settings.development.json
```

### Production Mode

```
meteor run --production --settings config/settings.production.json
```

## Configuration

You can configure the application using environment variables:

- `WEBTORRENT_TRACKERS`: Comma-separated list of WebTorrent trackers
- `WEBTORRENT_DHT`: Enable DHT (true/false)
- `WEBTORRENT_WEBSEEDS`: Enable WebSeeds (true/false)
- `FHIR_VALIDATION_LEVEL`: FHIR validation level (none/warning/error)
- `FHIR_DEFAULT_FORMAT`: Default FHIR format (json/ndjson)
- `UI_THEME`: UI theme (light/dark)
- `UI_DENSITY`: UI density (comfortable/compact)
- `STORAGE_TEMP_PATH`: Path for temporary storage
- `DEBUG`: Enable debug logging (true/false)

## Usage

1. **Create a Torrent**: Upload FHIR Bundle or NDJSON files to create a new torrent
2. **Add a Torrent**: Use a magnet URI to connect to an existing torrent
3. **Browse Torrents**: View details and content of available torrents
4. **Monitor Peers**: See who is connected to your node

## Architecture

This application follows the 12-factor app methodology:

1. **Codebase**: One codebase tracked in revision control
2. **Dependencies**: Explicitly declare and isolate dependencies
3. **Config**: Store config in the environment
4. **Backing services**: Treat backing services as attached resources
5. **Build, release, run**: Strictly separate build and run stages
6. **Processes**: Execute the app as one or more stateless processes
7. **Port binding**: Export services via port binding
8. **Concurrency**: Scale out via the process model
9. **Disposability**: Maximize robustness with fast startup and graceful shutdown
10. **Dev/prod parity**: Keep development, staging, and production as similar as possible
11. **Logs**: Treat logs as event streams
12. **Admin processes**: Run admin/management tasks as one-off processes

## Directory Structure

```
/imports
  /api
    /torrents        # Collections and methods for managing torrents
    /fhir            # FHIR data handling utilities
    /settings        # App configuration
  /ui
    /components      # Reusable UI components
    /layouts         # Page layouts
    /pages           # Main page components (for future routing)
/server
  /main.js          # Server entry point
  /methods.js       # Meteor methods
/client
  /main.jsx         # Client entry point
/public             # Static assets
/config             # Configuration files
```

## Future Enhancements

- Add user authentication
- Implement FHIR resource validation
- Add support for encrypted torrents
- Create a page router for multi-page navigation
- Add visualization of FHIR resources
- Support for FHIR profiles and validation

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [WebTorrent](https://webtorrent.io/) for the P2P technology
- [FHIR](https://www.hl7.org/fhir/) for the healthcare data standard
- [Meteor](https://www.meteor.com/) for the full-stack JavaScript platform