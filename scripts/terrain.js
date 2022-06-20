const fs = require('fs');
const axios = require('axios').default;

const TERRAIN_MAP_PATH = './build/terrain/terrain.map';
const TERRAIN_MAP_FOLDER = './build/terrain';
const TERRAIN_MAP_CDN = 'https://cdn.flybywiresim.com/addons/simbridge/terrain-db-binaries/terrain.map';

const execute = async () => {
    try {
        if (!fs.existsSync(TERRAIN_MAP_PATH)) {
            console.log('Downloading terrain map');
            if (!fs.existsSync(TERRAIN_MAP_FOLDER)) fs.mkdirSync(TERRAIN_MAP_FOLDER);

            const terrainResponse = await axios.get(
                TERRAIN_MAP_CDN,
                { responseType: 'stream' },
            );

            terrainResponse.data.pipe(fs.createWriteStream(TERRAIN_MAP_PATH));
        } else {
            console.log('Terrain map already exists, delete the file to update (DEVS ONLY)');
        }
    } catch (error) {
        console.log(error);
    }
};

execute();
