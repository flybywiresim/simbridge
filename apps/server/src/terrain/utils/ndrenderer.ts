import { NDViewDto } from '../dto/ndview.dto';
import { Worldmap } from '../manager/worldmap';
import { PositionDto } from '../dto/position.dto';
import { WGS84 } from './wgs84';

const sharp = require('sharp');

export class NDRenderer {
    private worldmap: Worldmap | undefined = undefined;

    public ViewConfig: NDViewDto | undefined = undefined;

    constructor(map: Worldmap) {
        this.worldmap = map;
    }

    public configureView(config: NDViewDto): void {
        this.ViewConfig = config;
    }

    private createLocalElevationMap(mapSize: number, reference: { latitude: number, longitude: number }, southwest: { latitude: number, longitude: number },
        northeast: { latitude: number, longitude: number }, step: { latitude: number, longitude: number }, radiusPixels: number):
        { elevationMap: Int16Array, referenceElevation: number, maxElevation: number } {
        // estimate the reference elevation
        let referenceElevation = 0;
        const worldIdx = this.worldmap.worldMapIndices(reference.latitude, reference.longitude);
        const tile = this.worldmap.Grid[worldIdx.row][worldIdx.column];
        if (tile.tileIndex !== -1 && tile.elevationmap !== undefined) {
            const mapIdx = tile.elevationmap.worldToGridIndices({ latitude: reference.latitude, longitude: reference.longitude });
            referenceElevation = tile.elevationmap.ElevationMap[mapIdx.row * tile.elevationmap.Columns + mapIdx.column];
        }

        // initialize the local map
        const elevationMap = new Int16Array(mapSize * mapSize);
        elevationMap.fill(0, 0);

        // create the local map and find the highest obstacle
        let maxElevation = -10000;
        let { latitude } = northeast;
        for (let y = 0; y < mapSize; ++y) {
            let { longitude } = southwest;

            for (let x = 0; x < mapSize; ++x) {
                const distance = Math.sqrt((x - radiusPixels) ** 2 + (y - radiusPixels) ** 2);
                if (distance > radiusPixels) {
                    longitude += step.longitude;
                    continue;
                }

                const worldIdx = this.worldmap.worldMapIndices(latitude, longitude);
                const tile = this.worldmap.Grid[worldIdx.row][worldIdx.column];
                let elevation = 0;

                if (tile.tileIndex === -1) {
                    elevation = -1;
                } else if (tile.elevationmap !== undefined) {
                    const mapIdx = tile.elevationmap.worldToGridIndices({ latitude, longitude });
                    elevation = tile.elevationmap.ElevationMap[mapIdx.row * tile.elevationmap.Columns + mapIdx.column];
                }

                maxElevation = Math.max(elevation, maxElevation);
                elevationMap[y * mapSize + x] = elevation;

                longitude += step.longitude;
            }

            latitude -= step.latitude;
        }

        return {
            elevationMap,
            referenceElevation,
            maxElevation,
        };
    }

    private static colorize(elevation: number, altitude: number): { r: number, g: number, b: number } {
        const delta = elevation - altitude;
        let r = 0;
        let g = 0;
        let b = 0;

        if (elevation === -1) {
            r = 0; g = 0; b = 200;
        } else if (elevation === 0 || delta < -2000) {
            r = 0; g = 0; b = 0;
        } else if (delta < -1000) {
            r = 119; g = 221; b = 119;
        } else if (delta < 500) {
            r = 0; g = 77; b = 0;
        } else if (delta < 1000) {
            r = 255; g = 255; b = 223;
        } else if (delta < 2000) {
            r = 255; g = 228; b = 80;
        } else {
            r = 254; g = 57; b = 57;
        }

        return { r, g, b };
    }

    public async render(position: PositionDto): Promise<{ buffer: SharedArrayBuffer, rows: number, columns: number }> {
        if (this.worldmap.Terraindata === undefined || position === undefined) {
            return { buffer: undefined, rows: 0, columns: 0 };
        }

        const start = new Date().getTime();

        // calculate the source dimensions to create the initial map
        const radiusPixels = Math.round((this.ViewConfig.viewRadius * 1852) / this.ViewConfig.meterPerPixel + 0.5);
        const mapSize = radiusPixels * 2;

        // create the source buffer
        const sourceBuffer = new Uint8ClampedArray(mapSize * mapSize * 3);
        sourceBuffer.fill(0, 0, mapSize * mapSize * 3);

        let viewSouthwest = null;
        let viewNortheast = null;
        let latitudeStep = 1;
        let longitudeStep = 1;

        viewSouthwest = WGS84.project(position.latitude, position.longitude, this.ViewConfig.viewRadius * 1852, 225);
        viewNortheast = WGS84.project(position.latitude, position.longitude, this.ViewConfig.viewRadius * 1852, 45);
        latitudeStep = (viewNortheast.latitude - viewSouthwest.latitude) / mapSize;
        longitudeStep = (viewNortheast.longitude - viewSouthwest.longitude) / mapSize;

        // correct the offset due to inaccurate projection
        const offsetLat = position.latitude - (viewSouthwest.latitude + (viewNortheast.latitude - viewSouthwest.latitude) / 2);
        const offsetLon = position.longitude - (viewSouthwest.longitude + (viewNortheast.longitude - viewSouthwest.longitude) / 2);

        viewSouthwest.latitude += offsetLat;
        viewSouthwest.longitude += offsetLon;
        viewNortheast.latitude += offsetLat;
        viewNortheast.longitude += offsetLon;

        const localMapData = this.createLocalElevationMap(mapSize, { latitude: position.latitude, longitude: position.longitude }, viewSouthwest, viewNortheast,
            { latitude: latitudeStep, longitude: longitudeStep }, radiusPixels);

        // predict the reference altitude
        let referenceAltitude = position.altitude;
        if (position.verticalSpeed <= -1000) {
            // predict 30 seconds -> half of the vertical speed (feet per minute)
            referenceAltitude += position.verticalSpeed / 2;
        }

        // get the correct visualization mode
        let peakMode = true;
        if (this.ViewConfig.gearDown) {
            peakMode = localMapData.maxElevation + 250 < referenceAltitude;
        } else {
            peakMode = localMapData.maxElevation + 500 < referenceAltitude;
        }

        const even = true;
        for (let y = 0; y < mapSize; y += 2) {
            for (let x = even ? 1 : 0; x < mapSize; x += 2) {
                const distance = Math.sqrt((x - radiusPixels) ** 2 + (y - radiusPixels) ** 2);
                if (distance > radiusPixels) {
                    continue;
                }

                const color = NDRenderer.colorize(localMapData.elevationMap[y * mapSize + x], referenceAltitude);
                sourceBuffer[(y * mapSize + x) * 3 + 0] = color.r;
                sourceBuffer[(y * mapSize + x) * 3 + 1] = color.g;
                sourceBuffer[(y * mapSize + x) * 3 + 2] = color.b;
            }
        }

        if (this.ViewConfig.rotateAroundHeading) {
            const { data, info } = await sharp(new Uint8ClampedArray(sourceBuffer), { raw: { width: mapSize, height: mapSize, channels: 3 } })
                .rotate(-1 * position.heading)
                .raw()
                .toBuffer({ resolveWithObject: true });

            const topOffset = Math.round((info.height - mapSize) / 2 + 0.5);
            let leftOffset = Math.round((info.width - mapSize) / 2 + 0.5);

            let result = null;
            if (this.ViewConfig.semicircleRequired) {
                if (this.ViewConfig.maxWidth < mapSize) {
                    leftOffset += (mapSize - this.ViewConfig.maxWidth) / 2;
                }

                result = await sharp(new Uint8ClampedArray(data.buffer), { raw: { width: info.width, height: info.height, channels: 3 } })
                    .extract({ width: Math.min(this.ViewConfig.maxWidth, mapSize), height: radiusPixels, left: leftOffset, top: topOffset })
                    .raw()
                    .toBuffer({ resolveWithObject: true });
            } else {
                result = await sharp(new Uint8ClampedArray(data.buffer), { raw: { width: info.width, height: info.height, channels: 3 } })
                    .extract({ width: mapSize, height: mapSize, left: leftOffset, top: topOffset })
                    .raw()
                    .toBuffer({ resolveWithObject: true });
            }

            const retval = new SharedArrayBuffer(result.info.width * result.info.height * 3);
            const dest = new Uint8ClampedArray(retval);
            dest.set(new Uint8ClampedArray(result.data.buffer), 0);

            const delta = new Date().getTime() - start;
            console.log(`Created ND map in ${delta / 1000} seconds`);

            return { buffer: retval, rows: result.info.height, columns: result.info.width };
        }

        const retval = new SharedArrayBuffer(mapSize * mapSize * 3);
        const dest = new Uint8ClampedArray(retval);
        dest.set(sourceBuffer, 0);

        const delta = new Date().getTime() - start;
        console.log(`Created ND map in ${delta / 1000} seconds`);

        return { buffer: retval, rows: mapSize, columns: mapSize };
    }
}
