import * as fs from 'fs';

import axios from 'axios';

import * as path from 'path';
import * as os from 'os';


const SIMBRIDGE_FOLDER = path.join(os.homedir() + '/flybywire-externaltools-simbridge');
const TERRAIN_MAP_FOLDER = path.join(SIMBRIDGE_FOLDER, '/terrain');
const TERRAIN_MAP_PATH = path.join(TERRAIN_MAP_FOLDER, '/terrain.map');


const TERRAIN_MAP_CDN = 'https://cdn.flybywiresim.com/addons/simbridge/terrain-db-binaries/terrain.map';

const execute = async () => {
  try {
    // Create the folders if they don't exist
    if (!fs.existsSync(TERRAIN_MAP_FOLDER)) fs.mkdirSync(TERRAIN_MAP_FOLDER);

    // Make sure to unlink the old terrain map so we can update it if needed
   // if (fs.existsSync(TERRAIN_MAP_PATH)) fs.unlinkSync(TERRAIN_MAP_PATH);

    if (!fs.existsSync(TERRAIN_MAP_PATH)) {
      // Terrain map is not cached, download it
      console.log('Downloading and caching terrain map');

      const terrainResponse = await axios.get(TERRAIN_MAP_CDN, { responseType: 'stream' });

      return new Promise((resolve, reject) => {
        const writer = fs.createWriteStream(TERRAIN_MAP_PATH);
        terrainResponse.data.pipe(writer);

       /*  writer.on('error', err => {
          writer.close();
          reject(err);
        }); */

        writer.on('close', resolve);
      });


    }
  } catch (error) {
    console.error(error);
  }
};

export default execute;
