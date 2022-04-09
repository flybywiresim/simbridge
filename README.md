![FlyByWire Simulations](https://raw.githubusercontent.com/flybywiresim/branding/1391fc003d8b5d439d01ad86e2778ae0bfc8b682/tails-with-text/FBW-Color-Light.svg)

## FlyByWire Simulations API

This repo contains the source code to our Local-API

## Developing

Please make sure you have:

NodeJS 14 - [Homepage](https://nodejs.org/en/)

```bash
# install all dependencies
$ npm install

# Build all packages
npm run build

# Start Server, to use interfaces you need to build them beforehand
$ npm run start

# Wipe dist folder, build all packages and package to exe
$ npm run build:exec

# Package built dist to exe
$ npm run install:exec

# Copy default properties file to resources
$ npm run install:prop
```

## Documentation
Start the server and direct to `localhost:3838/api` for API documentation
