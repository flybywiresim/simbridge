/* eslint-disable @typescript-eslint/no-unused-vars */
const { readdir, readFile } = require('fs/promises');
const fetch = require('node-fetch');

const CDN_URL = 'https://flybywirecdn.com';
const CDN_PURGE_LINK = 'https://flybywirecdn.com/purgeCache?url=http://flybywirecdn.com';

const BUCKET_DESTINATION = process.argv[2];
const DIRECTORY = process.argv[3];
const CDN_DIR = BUCKET_DESTINATION ?? 'addons/simbridge/test';
const LOCAL_DIR = DIRECTORY ?? './build-modules/';

const PASSWORD = process.env.CLOUDFLARE_BUCKET_PASSWORD;
const TOKEN = process.env.CLOUDFLARE_BUCKET_PASSWORD;

let MAX_RETRY = 5;

const uploadFile = async (url, buffer) => {
  if (MAX_RETRY === 0) {
    return;
  }

  try {
    const putOptions = {
      method: 'PUT',
      headers: { 'X-FBW-Access-Key': PASSWORD },
      body: buffer,
    };

    const response = await fetch(url, putOptions);

    if (response.status !== 201) {
      console.log('Failed to upload file, trying again');
      MAX_RETRY--;
      await uploadFile(url, buffer);
    } else {
      MAX_RETRY = 5;
      console.log('File Uploaded');
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};

const upload = async (fileName, buffer) => {
  try {
    MAX_RETRY = 5;
    const url = `${CDN_URL}/${CDN_DIR}/${fileName}`;

    console.log(`Syncing file: ${LOCAL_DIR}/${fileName}`);
    console.log(`Destination: ${url}`);

    await uploadFile(url, buffer);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};

const purge = async (filename) => {
  try {
    console.log('Purging cache');

    const url = `${CDN_PURGE_LINK}/${CDN_DIR}/${filename}`;
    console.log(`Purging cache for file: ${filename}`);
    console.log(`Purge URL: ${url} \n`);

    const putOptions = {
      method: 'POST',
      headers: {
        'X-FBW-Access-Key': TOKEN,
        'Content-Length': 0,
      },
    };

    await fetch(url, putOptions);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};

const execute = async () => {
  try {
    const files = await readdir(LOCAL_DIR);

    for (const fileName of files) {
      const buffer = await readFile(`${LOCAL_DIR}/${fileName}`);
      await upload(fileName, buffer);
      await purge(fileName);
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};

execute();
