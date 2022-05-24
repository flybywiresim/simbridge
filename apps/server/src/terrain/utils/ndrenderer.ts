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
        // initialize the local map
        const elevationMap: Int16Array = new Int16Array(mapSize * mapSize);
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
        retval.MaximumElevation = maxElevation;
        retval.ElevationPercentile85th = NDRenderer.percentile(validElevations, 0.85);
        retval.ElevationPercentile95th = NDRenderer.percentile(validElevations, 0.95);
        retval.LowerDensityRangeThreshold = (retval.MaximumElevation - minElevation) * 0.5;
        retval.HigherDensityRangeThreshold = (retval.MaximumElevation - minElevation) * 0.65;
        retval.SolidDensityRangeThreshold = (retval.MaximumElevation - minElevation) * 0.95;

        return retval;
    }

    private static fillPixel(image:Uint8ClampedArray, x: number, y: number, mapSize: number, start: number, size: number, color: { r: number, g: number, b: number }) {
        for (let dy = start; dy < start + size; ++dy) {
            for (let dx = start; dx < start + size; ++dx) {
                image[((y + dy) * mapSize + x + dx) * 3 + 0] = color.r;
                image[((y + dy) * mapSize + x + dx) * 3 + 1] = color.g;
                image[((y + dy) * mapSize + x + dx) * 3 + 2] = color.b;
            }
        }
    }

    private getElevation(localMapData: LocalMap, heading: number, mapSize: number, imageX: number, imageY: number) {
        if (!this.ViewConfig.rotateAroundHeading || heading % 360 === 0) {
            return localMapData.ElevationMap[imageY * mapSize + imageX];
        }

        const radians = heading * (Math.PI / 180);
        const c1 = Math.cos(radians);
        const s1 = Math.sin(radians);
        const offset = mapSize / 2;

        const x = Math.max(0, Math.min(mapSize - 1, Math.round(c1 * (imageX - offset) - s1 * (imageY - offset) + offset)));
        const y = Math.max(0, Math.min(mapSize - 1, Math.round(s1 * (imageX - offset) + c1 * (imageY - offset) + offset)));

        const elevation = localMapData.ElevationMap[y * mapSize + x];
        return elevation;
    }

    private fillLowDensityLayer(image: Uint8ClampedArray, radiusPixels: number, mapSize: number, localMapData: LocalMap, referenceAltitude: number,
        lowRelativeAltitudeMode: boolean, heading: number): void {
        // define the low density pattern
        const lowDensityPattern = [
            { start: 0, pattern: [[9, 0, 3], [10, 1, 2], [8, 0, 3]] },
            { start: 3, pattern: [[6, 1, 2], [8, 0, 3], [8, 0, 3]] },
            { start: 5, pattern: [[5, 0, 3], [6, 0, 3], [8, 1, 2]] },
        ];

        let rowCounter = 0;
        for (let y = 0; y < mapSize; y += 6) {
            const rowPattern = lowDensityPattern[rowCounter++];

            let column = 0;
            for (let x = rowPattern.start; x < mapSize;) {
                const cell = rowPattern.pattern[column++];
                column %= 3;

                const distance = Math.sqrt((x - radiusPixels) ** 2 + (y - radiusPixels) ** 2);
                if (distance > radiusPixels) {
                    x += 1;
                    continue;
                }

                const elevation = this.getElevation(localMapData, heading, mapSize, x, y);
                if (lowRelativeAltitudeMode) {
                    const delta = elevation - referenceAltitude;
                    if (delta >= 2000) {
                        NDRenderer.fillPixel(image, x, y, mapSize, cell[1], cell[2], { r: 255, g: 0, b: 0 });
                    } else if ((delta >= 1000 && delta < 2000) || (delta >= (this.ViewConfig.gearDown ? -250 : -500) && delta < 1000)) {
                        NDRenderer.fillPixel(image, x, y, mapSize, cell[1], cell[2], { r: 255, g: 255, b: 0 });
                    } else if ((delta >= -1000 && delta < (this.ViewConfig.gearDown ? -250 : -500)) || (delta >= -2000 && delta < -1000)) {
                        NDRenderer.fillPixel(image, x, y, mapSize, cell[1], cell[2], { r: 0, g: 255, b: 0 });
                    }
                } else if (localMapData.LowerDensityRangeThreshold <= elevation || localMapData.ElevationPercentile85th <= elevation) {
                    NDRenderer.fillPixel(image, x, y, mapSize, cell[1], cell[2], { r: 0, g: 255, b: 0 });
                }

                x += cell[0];
            }

            rowCounter %= 3;
        }
    }

    private fillHighDensityLayer(image: Uint8ClampedArray, radiusPixels: number, mapSize: number, localMapData: LocalMap, referenceAltitude: number,
        lowRelativeAltitudeMode: boolean, heading: number): void {
        // define the high density pattern
        const highDensityPattern = [
            { start: 5, pattern: [[4, 0, 3], [5, 0, 3], [5, 0, 3]] },
            { start: 2, pattern: [[5, 0, 3], [7, 0, 3], [5, 0, 3]] },
            { start: 0, pattern: [[6, 0, 3], [7, 0, 3], [5, 0, 3]] },
        ];

        let rowCounter = 0;
        for (let y = 3; y < mapSize; y += 6) {
            const rowPattern = highDensityPattern[rowCounter++];

            let column = 0;
            for (let x = rowPattern.start; x < mapSize;) {
                const cell = rowPattern.pattern[column++];
                column %= 3;

                const distance = Math.sqrt((x - radiusPixels) ** 2 + (y - radiusPixels) ** 2);
                if (distance > radiusPixels) {
                    x += 1;
                    continue;
                }

                const elevation = this.getElevation(localMapData, heading, mapSize, x, y);
                if (!Number.isFinite(elevation)) {
                    NDRenderer.fillPixel(image, x, y, mapSize, cell[1], cell[2], { r: 255, g: 148, b: 255 });
                } else if (elevation === WaterElevation) {
                    NDRenderer.fillPixel(image, x, y, mapSize, cell[1], cell[2], { r: 0, g: 255, b: 255 });
                } else if (lowRelativeAltitudeMode) {
                    const delta = elevation - referenceAltitude;
                    if (delta >= 2000) {
                        NDRenderer.fillPixel(image, x, y, mapSize, cell[1], cell[2], { r: 255, g: 0, b: 0 });
                    } else if (delta >= 1000 && delta < 2000) {
                        NDRenderer.fillPixel(image, x, y, mapSize, cell[1], cell[2], { r: 255, g: 255, b: 0 });
                    } else if (delta >= -1000 && delta < (this.ViewConfig.gearDown ? -250 : -500)) {
                        NDRenderer.fillPixel(image, x, y, mapSize, cell[1], cell[2], { r: 0, g: 255, b: 0 });
                    }
                } else if (localMapData.HigherDensityRangeThreshold <= elevation || localMapData.ElevationPercentile95th <= elevation) {
                    NDRenderer.fillPixel(image, x, y, mapSize, cell[1], cell[2], { r: 0, g: 255, b: 0 });
                }

                x += cell[0];
            }

            rowCounter %= 3;
        }
    }

    private fillSolidLayer(image: Uint8ClampedArray, radiusPixels: number, mapSize: number, localMapData: LocalMap, referenceAltitude: number,
        lowRelativeAltitudeMode: boolean, heading: number): void {
        for (let y = 0; y < mapSize; y += 2) {
            for (let x = 0; x < mapSize; x += 2) {
                const distance = Math.sqrt((x - radiusPixels) ** 2 + (y - radiusPixels) ** 2);
                if (distance > radiusPixels) {
                    x += 1;
                    continue;
                }

                const elevation = this.getElevation(localMapData, heading, mapSize, x, y);
                if (!lowRelativeAltitudeMode && localMapData.SolidDensityRangeThreshold <= elevation) {
                    NDRenderer.fillPixel(image, x, y, mapSize, 0, 2, { r: 0, g: 255, b: 0 });
                }
            }
        }
    }

    private renderPeakMode(image: Uint8ClampedArray, radiusPixels: number, mapSize: number, localMapData: LocalMap, referenceAltitude: number, heading: number): void {
        const thresholdAltitude = referenceAltitude - (this.ViewConfig.gearDown ? 250 : 500);
        const lowRelativeAltitudeMode = localMapData.MaximumElevation >= thresholdAltitude;

        this.fillLowDensityLayer(image, radiusPixels, mapSize, localMapData, referenceAltitude, lowRelativeAltitudeMode, heading);
        this.fillHighDensityLayer(image, radiusPixels, mapSize, localMapData, referenceAltitude, lowRelativeAltitudeMode, heading);
        this.fillSolidLayer(image, radiusPixels, mapSize, localMapData, referenceAltitude, lowRelativeAltitudeMode, heading);
    }

    public async render(position: PositionDto): Promise<{ buffer: SharedArrayBuffer, rows: number, columns: number, minElevation: number, maxElevation: number }> {
        if (this.worldmap.Terraindata === undefined || position === undefined) {
            return { buffer: undefined, rows: 0, columns: 0, minElevation: Infinity, maxElevation: Infinity };
        }

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

        this.renderPeakMode(sourceBuffer, radiusPixels, mapSize, localMapData, referenceAltitude, position.heading);

        if (this.ViewConfig.semicircleRequired) {
            const result = await sharp(new Uint8ClampedArray(sourceBuffer), { raw: { width: mapSize, height: mapSize, channels: 3 } })
                .extract({ width: mapSize, height: radiusPixels, left: 0, top: 0 })
                .raw()
                .toBuffer({ resolveWithObject: true });

            const retval = new SharedArrayBuffer(result.info.width * result.info.height * 3);
            const dest = new Uint8ClampedArray(retval);
            dest.set(new Uint8ClampedArray(result.data.buffer), 0);

            return { buffer: retval, rows: result.info.height, columns: result.info.width, minElevation: localMapData.LowerDensityRangeThreshold, maxElevation: localMapData.MaximumElevation };
        }

        const retval = new SharedArrayBuffer(mapSize * mapSize * 3);
        const dest = new Uint8ClampedArray(retval);
        dest.set(sourceBuffer, 0);

        return { buffer: retval, rows: mapSize, columns: mapSize, minElevation: localMapData.LowerDensityRangeThreshold, maxElevation: localMapData.MaximumElevation };
    }
}
