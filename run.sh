
#!/bin/bash

# Run script for FHIR P2P application with environment variables
# This script demonstrates setting environment variables for configuration

# Set environment variables for WebTorrent configuration
export WEBTORRENT_TRACKERS="wss://tracker.openwebtorrent.com,wss://tracker.btorrent.xyz"
export WEBTORRENT_DHT="true"
export WEBTORRENT_WEBSEEDS="true"

# FHIR configuration
export FHIR_VALIDATION_LEVEL="warning"
export FHIR_DEFAULT_FORMAT="json"

# UI configuration
export UI_THEME="light"
export UI_DENSITY="comfortable"

# Storage configuration
export STORAGE_TEMP_PATH="/tmp/fhir-torrents"

# Debug mode (set to false in production)
export DEBUG="true"

# Run the application
echo "Starting FHIR P2P application..."
meteor run --settings config/settings.development.json