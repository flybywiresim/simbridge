import { NDViewDto } from '../dto/ndview.dto';
import { Worldmap } from '../manager/worldmap';
import { PositionDto } from '../dto/position.dto';
import { WGS84 } from './wgs84';
import { LocalMap } from './localmap';

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

    private createLocalElevationMap(position: PositionDto): LocalMap {
        // initialize the local map
        const elevationMap: Int16Array = new Int16Array(this.ViewConfig.mapWidth * this.ViewConfig.mapHeight);
        const validElevations: number[] = [];
        let maxElevation = -10000;
        let minElevation = 10000;
        elevationMap.fill(0, 0);

        const offsetX = this.ViewConfig.mapWidth / 2;

        // calculate the three corners of the ROI rectangle
        const topLeftWgs84 = WGS84.project(position.latitude, position.longitude, Math.sqrt(offsetX ** 2 + this.ViewConfig.mapHeight ** 2) * this.ViewConfig.meterPerPixel,
            position.heading - 45);
        const bottomLeftWgs84 = WGS84.project(topLeftWgs84.latitude, topLeftWgs84.longitude, this.ViewConfig.mapHeight * this.ViewConfig.meterPerPixel, position.heading - 180);
        const topRightWgs84 = WGS84.project(topLeftWgs84.latitude, topLeftWgs84.longitude, this.ViewConfig.mapWidth * this.ViewConfig.meterPerPixel, position.heading + 90);

        // calculate the angular movements for elevation map movements in X- and Y-direction
        const angularDeltaX = {
            latitude: (topRightWgs84.latitude - topLeftWgs84.latitude) / this.ViewConfig.mapWidth,
            longitude: (topRightWgs84.longitude - topLeftWgs84.longitude) / this.ViewConfig.mapWidth,
        };
        const angularDeltaY = {
            latitude: (bottomLeftWgs84.latitude - topLeftWgs84.latitude) / this.ViewConfig.mapHeight,
            longitude: (bottomLeftWgs84.longitude - topLeftWgs84.longitude) / this.ViewConfig.mapHeight,
        };

        // create the local map and find the highest obstacle
        for (let y = 0; y < this.ViewConfig.mapHeight; ++y) {
            for (let x = 0; x < this.ViewConfig.mapWidth; ++x) {
                if (this.ViewConfig.arcMode) {
                    const distance = Math.sqrt((x - offsetX) ** 2 + (y - this.ViewConfig.mapHeight) ** 2);
                    if (distance > this.ViewConfig.mapHeight) {
                        elevationMap[y * this.ViewConfig.mapWidth + x] = null;
                        continue;
                    }
                }

                // Calculate the resulting world coordinate based on the angular offsets per step
                const projected = {
                    latitude: topLeftWgs84.latitude + x * angularDeltaX.latitude + y * angularDeltaY.latitude,
                    longitude: topLeftWgs84.longitude + x * angularDeltaX.longitude + y * angularDeltaY.longitude,
                };

                const worldIdx = this.worldmap.worldMapIndices(projected.latitude, projected.longitude);
                const tile = this.worldmap.Grid[worldIdx.row][worldIdx.column];
                let elevation = 0;

                if (tile.tileIndex === -1) {
                    elevation = WaterElevation;
                } else if (tile.elevationmap !== undefined && tile.elevationmap.MapLoaded) {
                    const mapIdx = tile.elevationmap.worldToGridIndices({ latitude: projected.latitude, longitude: projected.longitude });
                    elevation = tile.elevationmap.ElevationMap[mapIdx.row * tile.elevationmap.Columns + mapIdx.column];
                    validElevations.push(elevation);
                } else {
                    elevation = Infinity;
                }

                if (Number.isFinite(elevation)) {
                    maxElevation = Math.max(elevation, maxElevation);
                    minElevation = Math.min(elevation, minElevation);
                }

                elevationMap[y * this.ViewConfig.mapWidth + x] = elevation;
            }
        }

        // calculate the peak-mode percentils
        validElevations.sort((a, b) => a - b);

        const retval = new LocalMap();
        retval.ElevationMap = elevationMap;
        retval.MinimumElevation = minElevation;
        retval.MaximumElevation = maxElevation;
        retval.ElevationPercentile85th = NDRenderer.percentile(validElevations, 0.85);
        retval.ElevationPercentile95th = NDRenderer.percentile(validElevations, 0.95);
        retval.LowerDensityRangeThreshold = (retval.MaximumElevation - minElevation) * 0.5;
        retval.HigherDensityRangeThreshold = (retval.MaximumElevation - minElevation) * 0.65;
        retval.SolidDensityRangeThreshold = (retval.MaximumElevation - minElevation) * 0.95;

        return retval;
    }

    private static fillPixel(image:Uint8ClampedArray, x: number, y: number, width: number, start: number, size: number, color: { r: number, g: number, b: number }) {
        for (let dy = start; dy < start + size; ++dy) {
            for (let dx = start; dx < start + size; ++dx) {
                image[((y + dy) * width + x + dx) * 3 + 0] = color.r;
                image[((y + dy) * width + x + dx) * 3 + 1] = color.g;
                image[((y + dy) * width + x + dx) * 3 + 2] = color.b;
            }
        }
    }

    private fillLowDensityLayer(image: Uint8ClampedArray, localMapData: LocalMap, referenceAltitude: number, lowRelativeAltitudeMode: boolean): void {
        // define the low density pattern
        const lowDensityPattern = [
            { start: 0, pattern: [[9, 0, 3], [10, 1, 2], [8, 0, 3]] },
            { start: 3, pattern: [[6, 1, 2], [8, 0, 3], [8, 0, 3]] },
            { start: 5, pattern: [[5, 0, 3], [6, 0, 3], [8, 1, 2]] },
        ];

        let rowCounter = 0;
        for (let y = 0; y < this.ViewConfig.mapHeight; y += 6) {
            const rowPattern = lowDensityPattern[rowCounter++];

            let column = 0;
            for (let x = rowPattern.start; x < this.ViewConfig.mapWidth;) {
                const cell = rowPattern.pattern[column++];
                column %= 3;

                if (this.ViewConfig.arcMode) {
                    const distance = Math.sqrt((x - this.ViewConfig.mapHeight) ** 2 + (y - this.ViewConfig.mapHeight) ** 2);
                    if (distance > this.ViewConfig.mapHeight) {
                        x += 1;
                        continue;
                    }
                }

                const elevation = localMapData.ElevationMap[y * this.ViewConfig.mapWidth + x];
                if (lowRelativeAltitudeMode) {
                    const delta = elevation - referenceAltitude;
                    if (delta >= 2000) {
                        NDRenderer.fillPixel(image, x, y, this.ViewConfig.mapWidth, cell[1], cell[2], { r: 255, g: 0, b: 0 });
                    } else if ((delta >= 1000 && delta < 2000) || (delta >= (this.ViewConfig.gearDown ? -250 : -500) && delta < 1000)) {
                        NDRenderer.fillPixel(image, x, y, this.ViewConfig.mapWidth, cell[1], cell[2], { r: 255, g: 255, b: 0 });
                    } else if ((delta >= -1000 && delta < (this.ViewConfig.gearDown ? -250 : -500)) || (delta >= -2000 && delta < -1000)) {
                        NDRenderer.fillPixel(image, x, y, this.ViewConfig.mapWidth, cell[1], cell[2], { r: 0, g: 255, b: 0 });
                    }
                } else if (localMapData.LowerDensityRangeThreshold <= elevation || localMapData.ElevationPercentile85th <= elevation) {
                    NDRenderer.fillPixel(image, x, y, this.ViewConfig.mapWidth, cell[1], cell[2], { r: 0, g: 255, b: 0 });
                }

                x += cell[0];
            }

            rowCounter %= 3;
        }
    }

    private fillHighDensityLayer(image: Uint8ClampedArray, localMapData: LocalMap, referenceAltitude: number, lowRelativeAltitudeMode: boolean): void {
        // define the high density pattern
        const highDensityPattern = [
            { start: 5, pattern: [[4, 0, 3], [5, 0, 3], [5, 0, 3]] },
            { start: 2, pattern: [[5, 0, 3], [7, 0, 3], [5, 0, 3]] },
            { start: 0, pattern: [[6, 0, 3], [7, 0, 3], [5, 0, 3]] },
        ];

        let rowCounter = 0;
        for (let y = 3; y < this.ViewConfig.mapHeight; y += 6) {
            const rowPattern = highDensityPattern[rowCounter++];

            let column = 0;
            for (let x = rowPattern.start; x < this.ViewConfig.mapWidth;) {
                const cell = rowPattern.pattern[column++];
                column %= 3;

                if (this.ViewConfig.arcMode) {
                    const distance = Math.sqrt((x - this.ViewConfig.mapHeight) ** 2 + (y - this.ViewConfig.mapHeight) ** 2);
                    if (distance > this.ViewConfig.mapHeight) {
                        x += 1;
                        continue;
                    }
                }

                const elevation = localMapData.ElevationMap[y * this.ViewConfig.mapWidth + x];
                if (!Number.isFinite(elevation)) {
                    NDRenderer.fillPixel(image, x, y, this.ViewConfig.mapWidth, cell[1], cell[2], { r: 255, g: 148, b: 255 });
                } else if (elevation === WaterElevation) {
                    NDRenderer.fillPixel(image, x, y, this.ViewConfig.mapWidth, cell[1], cell[2], { r: 0, g: 255, b: 255 });
                } else if (lowRelativeAltitudeMode) {
                    const delta = elevation - referenceAltitude;
                    if (delta >= 2000) {
                        NDRenderer.fillPixel(image, x, y, this.ViewConfig.mapWidth, cell[1], cell[2], { r: 255, g: 0, b: 0 });
                    } else if (delta >= 1000 && delta < 2000) {
                        NDRenderer.fillPixel(image, x, y, this.ViewConfig.mapWidth, cell[1], cell[2], { r: 255, g: 255, b: 0 });
                    } else if (delta >= -1000 && delta < (this.ViewConfig.gearDown ? -250 : -500)) {
                        NDRenderer.fillPixel(image, x, y, this.ViewConfig.mapWidth, cell[1], cell[2], { r: 0, g: 255, b: 0 });
                    }
                } else if (localMapData.HigherDensityRangeThreshold <= elevation || localMapData.ElevationPercentile95th <= elevation) {
                    NDRenderer.fillPixel(image, x, y, this.ViewConfig.mapWidth, cell[1], cell[2], { r: 0, g: 255, b: 0 });
                }

                x += cell[0];
            }

            rowCounter %= 3;
        }
    }

    private fillSolidLayer(image: Uint8ClampedArray, localMapData: LocalMap): void {
        for (let y = 0; y < this.ViewConfig.mapHeight; y += 2) {
            for (let x = 0; x < this.ViewConfig.mapWidth; x += 2) {
                if (this.ViewConfig.arcMode) {
                    const distance = Math.sqrt((x - this.ViewConfig.mapHeight) ** 2 + (y - this.ViewConfig.mapHeight) ** 2);
                    if (distance > this.ViewConfig.mapHeight) {
                        x += 1;
                        continue;
                    }
                }

                const elevation = localMapData.ElevationMap[y * this.ViewConfig.mapWidth + x];
                if (localMapData.SolidDensityRangeThreshold <= elevation) {
                    NDRenderer.fillPixel(image, x, y, this.ViewConfig.mapWidth, 0, 2, { r: 0, g: 255, b: 0 });
                }
            }
        }
    }

    private renderPeakMode(image: Uint8ClampedArray, localMapData: LocalMap, referenceAltitude: number): void {
        const thresholdAltitude = referenceAltitude - (this.ViewConfig.gearDown ? 250 : 500);
        const lowRelativeAltitudeMode = localMapData.MaximumElevation >= thresholdAltitude;

        this.fillLowDensityLayer(image, localMapData, referenceAltitude, lowRelativeAltitudeMode);
        this.fillHighDensityLayer(image, localMapData, referenceAltitude, lowRelativeAltitudeMode);
        if (!lowRelativeAltitudeMode) {
            this.fillSolidLayer(image, localMapData);
            localMapData.TerrainMapMinElevation = localMapData.LowerDensityRangeThreshold;
        } else {
            localMapData.TerrainMapMinElevation = localMapData.MinimumElevation;
        }

        localMapData.TerrainMapMaxElevation = localMapData.MaximumElevation;
    }

    public render(position: PositionDto): { buffer: SharedArrayBuffer, rows: number, columns: number, minElevation: number, maxElevation: number } {
        if (this.worldmap.Terraindata === undefined || position === undefined) {
            return { buffer: undefined, rows: 0, columns: 0, minElevation: Infinity, maxElevation: Infinity };
        }

        const start = new Date().getTime();

        // create the source buffer
        const sourceBuffer = new Uint8ClampedArray(this.ViewConfig.mapWidth * this.ViewConfig.mapHeight * 3);
        sourceBuffer.fill(0, 0, this.ViewConfig.mapWidth * this.ViewConfig.mapHeight * 3);

        const localMapData = this.createLocalElevationMap(position);

        // predict the reference altitude
        let referenceAltitude = position.altitude;
        if (position.verticalSpeed <= -1000) {
            // predict 30 seconds -> half of the vertical speed (feet per minute)
            referenceAltitude += position.verticalSpeed / 2;
        }

        this.renderPeakMode(sourceBuffer, localMapData, referenceAltitude);

        const retval = new SharedArrayBuffer(this.ViewConfig.mapWidth * this.ViewConfig.mapHeight * 3);
        const dest = new Uint8ClampedArray(retval);
        dest.set(new Uint8ClampedArray(sourceBuffer), 0);

        const deltaTime = new Date().getTime() - start;
        console.log(`Rendering duration: ${deltaTime}`);

        return {
            buffer: retval,
            rows: this.ViewConfig.mapHeight,
            columns: this.ViewConfig.mapWidth,
            minElevation: localMapData.TerrainMapMinElevation,
            maxElevation: localMapData.TerrainMapMaxElevation,
        };
    }
}
