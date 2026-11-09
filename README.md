![FlyByWire Simulations](https://raw.githubusercontent.com/flybywiresim/branding/1391fc003d8b5d439d01ad86e2778ae0bfc8b682/tails-with-text/FBW-Color-Light.svg#gh-dark-mode-only)
![FlyByWire Simulations](https://github.com/flybywiresim/branding/blob/master/tails-with-text/FBW-Color-Dark.svg#gh-light-mode-only)

[![Discord](https://img.shields.io/discord/738864299392630914.svg?label=&logo=discord&logoColor=ffffff&color=7389D8&labelColor=6A7EC2)](https://discord.gg/UjzuHMU)
[![Twitter](https://img.shields.io/badge/-@FlyByWireSim-e84393?label=&logo=twitter&logoColor=ffffff&color=6399AE&labelColor=00C2CB)](https://twitter.com/FlybywireSim)
[![YouTube](https://img.shields.io/badge/-FlyByWireSimulations-e84393?label=&logo=youtube&logoColor=ffffff&color=6399AE&labelColor=00C2CB)](https://www.youtube.com/c/FlyByWire-Simulations)
[![Facebook](https://img.shields.io/badge/-FlyByWireSimulations-e84393?label=&logo=facebook&logoColor=ffffff&color=6399AE&labelColor=00C2CB)](https://www.facebook.com/FlyByWireSimulations/)
[![Instagram](https://img.shields.io/badge/-@FlyByWireSim-e84393?label=&logo=instagram&logoColor=ffffff&color=6399AE&labelColor=00C2CB)](https://instagram.com/flybywiresim)

## FlyByWire SimBridge

This repo contains the source code to SimBridge

## Developing

Please make sure you have:

NodeJS 26 - [Homepage](https://nodejs.org/en/)

On Windows, installing native dependencies also requires Python and Visual Studio Build Tools with the Desktop development with C++ workload. After switching Node.js major versions, run `npm rebuild` to rebuild existing native modules for the new runtime.

```bash
# Install all dependencies
$ npm install

# Build all packages
$ npm run build

# Start server, to use interfaces you need to build them beforehand
$ npm run start

# Wipe build/ and dist/ folders, build all packages, package to exe and copy dependencies/resources to build folder
$ npm run build:exec

# Package to exe and copy dependencies/resources to build folder, without rebuilding
$ npm run install:exec

```

The Windows executable is packaged with `@yao-pkg/pkg` in Node SEA mode. The build embeds the Node 26 runtime and application dependencies, then applies the FlyByWire icon and the version from `package.json`.

Set `SIMBRIDGE_PORT` to override the configured server port for one process, for example when testing a packaged build alongside the development server.

Distribute the complete `build/` folder, including `node_modules/`, `resources/`, `terrain/`, and the versioned tray-helper directory, alongside `fbw-simbridge.exe`. PDF.js workers, decoder assets, the tray helper, and the terrain database are loaded from that folder. Node.js is not required on the destination machine.

## Documentation
Start the server and direct to `localhost:8380/api` for API documentation
