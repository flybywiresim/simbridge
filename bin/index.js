#!/usr/bin/env node
/* eslint-disable strict */

const [,, ...args] = process.argv;

const { build } = require('../lib/build');

build(args[0], args[1]);
