const fs = require('fs');
const axios = require('axios').default;
const path = require('path');

const TERRAIN_MAP_CACHE_PATH = './cache/terrain.map';
const TERRAIN_MAP_CACHE_FOLDER = path.dirname(TERRAIN_MAP_CACHE_PATH);
const TERRAIN_MAP_PATH = './build/terrain/terrain.map';
const TERRAIN_MAP_FOLDER = path.dirname(TERRAIN_MAP_PATH);

const TERRAIN_MAP_CDN = 'https://cdn.flybywiresim.com/addons/simbridge/terrain-db-binaries/terrain.map';

const execute = async () => {
    try {
        // Create the folders if they don't exist
        if (!fs.existsSync(TERRAIN_MAP_CACHE_FOLDER)) fs.mkdirSync(TERRAIN_MAP_CACHE_FOLDER);
        if (!fs.existsSync(TERRAIN_MAP_FOLDER)) fs.mkdirSync(TERRAIN_MAP_FOLDER);

        // Make sure to unlink the old terrain map so we can update it if needed
        if (fs.existsSync(TERRAIN_MAP_PATH)) fs.unlinkSync(TERRAIN_MAP_PATH);

        if (!fs.existsSync(TERRAIN_MAP_CACHE_PATH)) {
            // Terrain map is not cached, download it
            console.log('Downloading and caching terrain map');

            const terrainResponse = await axios.get(
                TERRAIN_MAP_CDN,
                { responseType: 'stream' },
            );

            terrainResponse.data.pipe(fs.createWriteStream(TERRAIN_MAP_CACHE_PATH));
            terrainResponse.data.on('end', () => {
                fs.linkSync(TERRAIN_MAP_CACHE_PATH, TERRAIN_MAP_PATH);
            });
        } else {
            // Terrain map is cached, link it to the build folder
            console.log(`Terrain map already exists in the cache, copying it to the build folder. Delete ${TERRAIN_MAP_CACHE_PATH} to update (DEVS ONLY)`);

            fs.linkSync(TERRAIN_MAP_CACHE_PATH, TERRAIN_MAP_PATH);
        }
    } catch (error) {
        console.error(error);
    }
};

execute();
