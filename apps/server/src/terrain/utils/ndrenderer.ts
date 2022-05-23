import { NDViewDto } from '../dto/ndview.dto';
import { Worldmap } from '../manager/worldmap';
import { PositionDto } from '../dto/position.dto';
import { WGS84 } from './wgs84';
import { LocalMap } from './localmap';

const sharp = require('sharp');

const WaterElevation = -1;

export class NDRenderer {
    private worldmap: Worldmap | undefined = undefined;

    public ViewConfig: NDViewDto | undefined = undefined;

    constructor(map: Worldmap) {
        this.worldmap = map;
    }

    public configureView(config: NDViewDto): void {
        this.ViewConfig = config;
    }

    private static percentile(values: number[], border: number): number {
        if (values.length === 0) {
            return 0;
        }

        let index = values.length * border;
        if (Number.isInteger(index)) {
            if (index + 1 >= values.length) {
                return values[index];
            }
            return 0.5 * (values[index] + values[index + 1]);
        }
        index = Math.ceil(index);
        if (index >= values.length) {
            return values[index - 1];
        }
        return values[index];
    }

    private createLocalElevationMap(mapSize: number, position: PositionDto, reference: { latitude: number, longitude: number }, southwest: { latitude: number, longitude: number },
        northeast: { latitude: number, longitude: number }, step: { latitude: number, longitude: number }, radiusPixels: number): LocalMap {
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
        const validElevations: number[] = [];
        elevationMap.fill(0, 0);

        // prepare for the semicircle mode
        const offset = mapSize / 2;
        let headingVectorX = 0;
        let headingVectorY = 1;
        if (this.ViewConfig.semicircleRequired) {
            // 2D rotation matrix multiplication with (0, 1) of a right-side rotation
            let angle = 0;
            if (position.heading > 180) {
                angle = (position.heading - 360) * (Math.PI / 180);
            } else {
                angle = position.heading * (Math.PI / 180);
            }
            headingVectorX = Math.sin(angle);
            headingVectorY = Math.cos(angle);
        }

        // create the local map and find the highest obstacle
        let minElevation = 10000;
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

                // filter based on visible angle
                if (this.ViewConfig.semicircleRequired) {
                    const length = Math.sqrt((x - offset) ** 2 + (y - offset) ** 2);
                    const normalizedX = (x - offset) / length;
                    const normalizedY = (-1 * (y - offset)) / length;

                    const angle = Math.acos((headingVectorX * normalizedX + headingVectorY * normalizedY));
                    if (angle < -1.5708 || angle > 1.5708) {
                        longitude += step.longitude;
                        elevationMap[y * mapSize + x] = null;
                        continue;
                    }
                }

                const worldIdx = this.worldmap.worldMapIndices(latitude, longitude);
                const tile = this.worldmap.Grid[worldIdx.row][worldIdx.column];
                let elevation = 0;

                if (tile.tileIndex === -1) {
                    elevation = WaterElevation;
                } else if (tile.elevationmap !== undefined && tile.elevationmap.MapLoaded) {
                    const mapIdx = tile.elevationmap.worldToGridIndices({ latitude, longitude });
                    elevation = tile.elevationmap.ElevationMap[mapIdx.row * tile.elevationmap.Columns + mapIdx.column];
                    validElevations.push(elevation);
                } else {
                    elevation = Infinity;
                }

                if (Number.isFinite(elevation)) {
                    maxElevation = Math.max(elevation, maxElevation);
                    minElevation = Math.min(elevation, minElevation);
                }
                elevationMap[y * mapSize + x] = elevation;

                longitude += step.longitude;
            }

            latitude -= step.latitude;
        }

        // calculate the peak-mode percentils
        validElevations.sort((a, b) => a - b);

        const retval = new LocalMap();
        retval.ElevationMap = elevationMap;
        retval.ReferenceElevation = referenceElevation;
        retval.MinimumElevation = minElevation;
        retval.MaximumElevation = maxElevation;
        retval.ElevationPercentile85th = NDRenderer.percentile(validElevations, 0.85);
        retval.ElevationPercentile95th = NDRenderer.percentile(validElevations, 0.95);
        retval.ElevationPercentile50th = NDRenderer.percentile(validElevations, 0.5);
        retval.ElevationPercentile65th = NDRenderer.percentile(validElevations, 0.65);
        retval.LowerDensityRangeThreshold = (retval.MaximumElevation - retval.MinimumElevation) * 0.5 - 2000;
        retval.HigherDensityRangeThreshold = (retval.MaximumElevation - retval.MinimumElevation) * 0.65 - 1000;
        retval.SolidDensityRangeThreshold = (retval.MaximumElevation - retval.MinimumElevation) * 0.95;

        console.log(`Min elev: ${retval.MinimumElevation}`);
        console.log(`Max elev: ${retval.MaximumElevation}`);
        console.log(`Ref elev: ${retval.ReferenceElevation}`);
        console.log(`50th perc: ${retval.ElevationPercentile50th}`);
        console.log(`65th perc: ${retval.ElevationPercentile65th}`);
        console.log(`85th perc: ${retval.ElevationPercentile85th}`);
        console.log(`95th perc: ${retval.ElevationPercentile95th}`);
        console.log(`Lower thr: ${retval.LowerDensityRangeThreshold}`);
        console.log(`Higher thr: ${retval.HigherDensityRangeThreshold}`);
        console.log(`Solid thr: ${retval.SolidDensityRangeThreshold}`);

        return retval;
    }

    private static estimatePeakVisualization(localMap: LocalMap, elevation: number, altitude: number, gearDown: boolean):
    { density: number, color: { r: number, g: number, b: number }} {
        // check if the entry is out of range
        if (!elevation) {
            return {
                density: 2,
                color: { r: 0, g: 0, b: 0 },
            };
        }

        // check if the map is unavailble
        if (!Number.isFinite(elevation)) {
            return {
                density: 2,
                color: { r: 255, g: 148, b: 255 },
            };
        }

        if (elevation === WaterElevation) {
            return {
                density: 2,
                color: { r: 0, g: 255, b: 255 },
            };
        }

        const thresholdAltitude = altitude - (gearDown ? 250 : 500);
        if (localMap.MaximumElevation >= thresholdAltitude) {
            if (localMap.SolidDensityRangeThreshold <= elevation) {
                return {
                    density: 1,
                    color: { r: 0, g: 255, b: 0 },
                };
            }
        } else {
            const delta = elevation - altitude;
            if (delta >= 2000) {
                return {
                    density: 2,
                    color: { r: 255, g: 0, b: 0 },
                };
            }
            if (delta >= 1000) {
                return {
                    density: 2,
                    color: { r: 255, g: 255, b: 0 },
                };
            }
            if ((gearDown && delta >= -250) || (!gearDown && delta >= -500)) {
                return {
                    density: 3,
                    color: { r: 255, g: 255, b: 0 },
                };
            }
        }

        if (localMap.HigherDensityRangeThreshold <= elevation || localMap.ElevationPercentile95th <= elevation) {
            return {
                density: 2,
                color: { r: 0, g: 255, b: 0 },
            };
        }
        if (localMap.LowerDensityRangeThreshold <= elevation || localMap.ElevationPercentile85th <= elevation) {
            return {
                density: 3,
                color: { r: 0, g: 255, b: 0 },
            };
        }

        return {
            density: Infinity,
            color: { r: 0, g: 0, b: 0 },
        };
    }

    private static fillPixel(image:Uint8ClampedArray, x: number, y: number, mapSize: number, color: { r: number, g: number, b: number }) {
        image[(y * mapSize + x) * 3 + 0] = color.r;
        image[(y * mapSize + x) * 3 + 1] = color.g;
        image[(y * mapSize + x) * 3 + 2] = color.b;

        // image[(y * mapSize + x + 1) * 3 + 0] = color.r;
        // image[(y * mapSize + x + 1) * 3 + 1] = color.g;
        // image[(y * mapSize + x + 1) * 3 + 2] = color.b;

        // image[((y + 1) * mapSize + x) * 3 + 0] = color.r;
        // image[((y + 1) * mapSize + x) * 3 + 1] = color.g;
        // image[((y + 1) * mapSize + x) * 3 + 2] = color.b;

        // image[((y + 1) * mapSize + x + 1) * 3 + 0] = color.r;
        // image[((y + 1) * mapSize + x + 1) * 3 + 1] = color.g;
        // image[((y + 1) * mapSize + x + 1) * 3 + 2] = color.b;
    }

    private renderPeakMode(image: Uint8ClampedArray, radiusPixels: number, mapSize: number, localMapData: LocalMap, referenceAltitude: number): void {
        for (let y = 0; y < mapSize; y++) {
            for (let x = 0; x < mapSize;) {
                const distance = Math.sqrt((x - radiusPixels) ** 2 + (y - radiusPixels) ** 2);
                if (distance > radiusPixels) {
                    x += 1;
                    continue;
                }

                const type = NDRenderer.estimatePeakVisualization(localMapData, localMapData.ElevationMap[y * mapSize + x], referenceAltitude, this.ViewConfig.gearDown);
                if (Number.isFinite(type.density)) {
                    NDRenderer.fillPixel(image, x, y, mapSize, type.color);
                    x += type.density;
                } else {
                    x += 1;
                }
            }
        }
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

        const localMapData = this.createLocalElevationMap(mapSize, position, { latitude: position.latitude, longitude: position.longitude }, viewSouthwest, viewNortheast,
            { latitude: latitudeStep, longitude: longitudeStep }, radiusPixels);

        // predict the reference altitude
        let referenceAltitude = position.altitude;
        if (position.verticalSpeed <= -1000) {
            // predict 30 seconds -> half of the vertical speed (feet per minute)
            referenceAltitude += position.verticalSpeed / 2;
        }

        this.renderPeakMode(sourceBuffer, radiusPixels, mapSize, localMapData, referenceAltitude);

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
                //    .extract({ width: Math.min(this.ViewConfig.maxWidth, mapSize), height: radiusPixels, left: leftOffset, top: topOffset })
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
