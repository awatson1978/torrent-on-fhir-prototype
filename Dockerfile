FROM node:18-alpine

# Create app directory
WORKDIR /app

# Build arguments
ARG APP_VERSION=0.1.0

# Environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    ROOT_URL=http://localhost:3000 \
    MONGO_URL=mongodb://mongo:27017/fhirp2p \
    WEBTORRENT_TRACKERS="wss://tracker.openwebtorrent.com,wss://tracker.btorrent.xyz,wss://tracker.fastcast.nz" \
    WEBTORRENT_DHT="true" \
    WEBTORRENT_WEBSEEDS="true" \
    FHIR_VALIDATION_LEVEL="warning" \
    FHIR_DEFAULT_FORMAT="json" \
    UI_THEME="light" \
    UI_DENSITY="comfortable" \
    STORAGE_TEMP_PATH="/data/fhir-torrents" \
    DEBUG="false"

# Install build dependencies
RUN apk --no-cache add \
    python3 \
    make \
    g++ \
    git

# Copy bundle from build stage
COPY ./bundle /app/bundle

# Install dependencies
WORKDIR /app/bundle/programs/server
RUN npm install --production

# Create data directory
RUN mkdir -p /data/fhir-torrents

# Go back to app root
WORKDIR /app/bundle

# Expose the application port
EXPOSE 3000

# Start the app
CMD ["node", "main.js"]