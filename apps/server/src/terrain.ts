import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

import { getSimbridgeDir } from 'apps/server/src/utilities/pathUtil';

const SIMBRIDGE_FOLDER = getSimbridgeDir();
const TERRAIN_MAP_FOLDER = path.join(SIMBRIDGE_FOLDER, 'terrain');
const TERRAIN_MAP_PATH = path.join(TERRAIN_MAP_FOLDER, 'terrain.map');

const TERRAIN_MAP_CDN = 'https://cdn.flybywiresim.com/addons/simbridge/terrain-db-binaries/terrain.map';

const execute = async () => {
  try {
    // Create the folders if they don't exist
    if (!fs.existsSync(TERRAIN_MAP_FOLDER)) fs.mkdirSync(TERRAIN_MAP_FOLDER);

    if (!fs.existsSync(TERRAIN_MAP_PATH)) {
      console.log('Downloading terrain map');

      const terrainResponse = await axios.get(TERRAIN_MAP_CDN, { responseType: 'stream' });

      return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(TERRAIN_MAP_PATH);
        terrainResponse.data.pipe(writer);
        let error: Error = null;

        writer.on('error', (err) => {
          error = err;
          writer.close();
          reject(err);
        });

        writer.on('close', () => {
          if (!error) resolve(0);
        });
      });
    }
  } catch (error) {
    console.error(error);
  }
};

export default execute;
