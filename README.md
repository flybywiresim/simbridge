# <img src="https://raw.githubusercontent.com/flybywiresim/fbw-branding/master/svg/FBW-Logo.svg" placeholder="FlyByWire" width="400"/>

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

# Wipe dist folder, build all packages, package to exe and copy dependencies/resources to build folder
$ npm run build:exec

# Package built dist to exe
$ npm run install:exec

```

## Documentation
Start the server and direct to `localhost:3838/api` for API documentation
