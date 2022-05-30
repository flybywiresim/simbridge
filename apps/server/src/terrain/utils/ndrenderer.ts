import { NDViewDto } from '../dto/ndview.dto';
import { Worldmap } from '../manager/worldmap';
import { PositionDto } from '../dto/position.dto';
import { WGS84 } from './wgs84';
import { LocalMap } from './localmap';
import { WaterPattern } from './waterpattern';
import { HighDensityPattern } from './highdensitypattern';
import { LowDensityPattern } from './lowdensitypattern';
import { ElevationGrid } from '../mapformat/elevationgrid';

const sharp = require('sharp');

const InvalidElevation = 32767;
const WaterElevation = -1;

export class NDRenderer {
    private worldmap: Worldmap | undefined = undefined;

    public ViewConfig: NDViewDto | undefined = undefined;

    private position: PositionDto | undefined = undefined;

    private distanceHeadingLut: Array<{ distancePixels: number, distanceMeters: number, heading: number, orientation: number }> = [];

    constructor(map: Worldmap) {
        this.worldmap = map;
    }

    private calculateDistances(config: NDViewDto): void {
        const offsetX = config.mapWidth / 2;
        for (let y = 0; y < config.mapHeight; ++y) {
            for (let x = 0; x < config.mapWidth / 2; ++x) {
                const distancePixels = Math.sqrt((x - offsetX) ** 2 + (config.mapHeight - y) ** 2);
                const distanceMeters = distancePixels * config.meterPerPixel;
                this.distanceHeadingLut[y * config.mapWidth + x].distancePixels = distancePixels;
                this.distanceHeadingLut[y * config.mapWidth + x].distanceMeters = distanceMeters;
                this.distanceHeadingLut[y * config.mapWidth + config.mapWidth - x - 1].distancePixels = distancePixels;
                this.distanceHeadingLut[y * config.mapWidth + config.mapWidth - x - 1].distanceMeters = distanceMeters;
            }
        }
    }

    private static normalizeHeading(heading: number): number {
        return (heading - (Math.floor(heading / 360) * 360));
    }

    private calculateHeadings(position: PositionDto) {
        const offsetX = this.ViewConfig.mapWidth / 2;
        for (let y = 0; y < this.ViewConfig.mapHeight; ++y) {
            for (let x = 0; x < this.ViewConfig.mapWidth / 2; ++x) {
                const rightAngle = Math.acos((this.ViewConfig.mapHeight - y) / Math.sqrt((x - offsetX) ** 2 + (this.ViewConfig.mapHeight - y) ** 2)) * (180 / Math.PI);
                const leftAngle = 360 - rightAngle;

                const headingRight = NDRenderer.normalizeHeading(rightAngle + position.heading);
                const headingLeft = NDRenderer.normalizeHeading(leftAngle + position.heading);

                this.distanceHeadingLut[y * this.ViewConfig.mapWidth + x].heading = headingLeft;
                this.distanceHeadingLut[y * this.ViewConfig.mapWidth + x].orientation = rightAngle;
                this.distanceHeadingLut[y * this.ViewConfig.mapWidth + this.ViewConfig.mapWidth - x - 1].heading = headingRight;
                this.distanceHeadingLut[y * this.ViewConfig.mapWidth + this.ViewConfig.mapWidth - x - 1].orientation = rightAngle;
            }
        }
    }

    public configureView(config: NDViewDto): void {
        if (this.ViewConfig === undefined || config.mapHeight !== this.ViewConfig.mapHeight || config.mapWidth !== this.ViewConfig.mapWidth || this.distanceHeadingLut.length === 0) {
            this.distanceHeadingLut = [...Array(config.mapHeight * config.mapWidth)].map(() => ({ distancePixels: 0, distanceMeters: 0, heading: 0, orientation: 0 }));
            this.calculateDistances(config);
            if (this.position !== undefined) {
                this.calculateHeadings(this.position);
            }
        } else if (config.meterPerPixel !== this.ViewConfig.meterPerPixel) {
            this.calculateDistances(config);
        }

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

    private createLocalElevationMap(position: PositionDto, referenceAltitude: number): LocalMap {
        // initialize the local map
        const elevationMap: Int16Array = new Int16Array(this.ViewConfig.mapWidth * this.ViewConfig.mapHeight);
        const validElevations: number[] = [];
        let maxElevation = -10000;
        let minElevation = 10000;
        elevationMap.fill(InvalidElevation, 0);

        const offsetX = this.ViewConfig.mapWidth / 2;

        // create the local map and find the highest obstacle
        for (let y = 0; y < this.ViewConfig.mapHeight; ++y) {
            for (let x = 0; x < this.ViewConfig.mapWidth; ++x) {
                if (this.ViewConfig.arcMode) {
                    const distance = Math.sqrt((x - offsetX) ** 2 + (y - this.ViewConfig.mapHeight) ** 2);
                    if (distance > this.ViewConfig.mapHeight) {
                        continue;
                    }
                }

                const lutEntry = this.distanceHeadingLut[y * this.ViewConfig.mapWidth + x];
                const projected = WGS84.project(position.latitude, position.longitude, lutEntry.distanceMeters, lutEntry.heading);

                const worldIdx = Worldmap.worldMapIndices(this.worldmap, projected.latitude, projected.longitude);
                const tile = this.worldmap.Grid[worldIdx.row][worldIdx.column];
                let elevation = 0;

                if (tile.tileIndex === -1) {
                    elevation = WaterElevation;
                } else if (tile.elevationmap !== undefined && tile.elevationmap.MapLoaded) {
                    const mapIdx = ElevationGrid.worldToGridIndices(tile.elevationmap, { latitude: projected.latitude, longitude: projected.longitude });
                    elevation = tile.elevationmap.ElevationMap[mapIdx.row * tile.elevationmap.Columns + mapIdx.column];
                } else {
                    elevation = Infinity;
                }

                if (Number.isFinite(elevation) && elevation !== WaterElevation) {
                    maxElevation = Math.max(elevation, maxElevation);
                    minElevation = Math.min(elevation, minElevation);
                    validElevations.push(elevation);
                }

                elevationMap[y * this.ViewConfig.mapWidth + x] = elevation;
            }
        }

        // calculate the peak-mode percentils
        validElevations.sort((a, b) => a - b);

        const retval = new LocalMap();
        retval.ElevationMap = elevationMap;
        retval.MaximumElevation = maxElevation;
        retval.TerrainMapMaxElevation = retval.MaximumElevation;

        const flatEarth = retval.MaximumElevation - minElevation <= 100;
        const halfElevation = retval.MaximumElevation * 0.5;
        const percentile85th = NDRenderer.percentile(validElevations, 0.85);

        // normal mode
        if (maxElevation >= referenceAltitude - (this.ViewConfig.gearDown ? 250 : 500)) {
            retval.DisplayPeaksMode = false;
            retval.LowDensityGreenThreshold = referenceAltitude - 2000 <= minElevation ? minElevation + 200 : referenceAltitude - 2000;
            retval.HighDensityGreenThreshold = referenceAltitude - 1000 <= minElevation ? minElevation + 200 : referenceAltitude - 1000;
            retval.LowDensityYellowThreshold = referenceAltitude - (this.ViewConfig.gearDown ? 250 : 500);
            if (retval.LowDensityYellowThreshold <= minElevation) {
                retval.LowDensityYellowThreshold = minElevation + 200;
            }
            retval.HighDensityYellowThreshold = referenceAltitude + 1000;
            retval.HighDensityRedThreshold = referenceAltitude + 2000;

            if (!flatEarth) {
                if (halfElevation <= percentile85th && retval.LowDensityGreenThreshold > halfElevation) {
                    retval.LowDensityGreenThreshold = halfElevation;
                } else if (halfElevation > percentile85th && retval.LowDensityGreenThreshold > percentile85th) {
                    retval.LowDensityGreenThreshold = percentile85th;
                }
            }

            retval.TerrainMapMinElevation = retval.LowDensityGreenThreshold;
        // flat earth situation which does not trigger higher densities
        } else if (flatEarth) {
            retval.LowerDensityRangeThreshold = minElevation;
            retval.HigherDensityRangeThreshold = retval.MaximumElevation;
            retval.SolidDensityRangeThreshold = retval.MaximumElevation;
            retval.MinimumElevation = minElevation;

            retval.TerrainMapMinElevation = retval.LowerDensityRangeThreshold;
        // standard peaks mode
        } else {
            retval.LowerDensityRangeThreshold = Math.min(percentile85th, halfElevation);
            retval.HigherDensityRangeThreshold = Math.min(NDRenderer.percentile(validElevations, 0.95), (retval.MaximumElevation - minElevation) * 0.65);
            retval.SolidDensityRangeThreshold = (retval.MaximumElevation - minElevation) * 0.95;
            retval.TerrainMapMinElevation = retval.LowerDensityRangeThreshold;
        }

        return retval;
    }

    private fillPixel(image: Uint8ClampedArray, x: number, y: number, color: { r: number, g: number, b: number }) {
        image[(y * this.ViewConfig.mapWidth + x) * 3 + 0] = color.r;
        image[(y * this.ViewConfig.mapWidth + x) * 3 + 1] = color.g;
        image[(y * this.ViewConfig.mapWidth + x) * 3 + 2] = color.b;
    }

    private findCorrectPattern(densityPatterns: { angleRanges: number[][], minPixelDistance: number, patterns: number[][][] }[], x: number, y: number): number[][][] {
        const pxDistance = this.distanceHeadingLut[y * this.ViewConfig.mapWidth + x].distancePixels;
        const angle = this.distanceHeadingLut[y * this.ViewConfig.mapWidth + x].orientation;

        for (let i = 0; i < densityPatterns.length; ++i) {
            if (pxDistance >= densityPatterns[i].minPixelDistance) {
                for (let a = 0; a < densityPatterns[i].angleRanges.length; ++a) {
                    if (densityPatterns[i].angleRanges[a][0] <= angle && densityPatterns[i].angleRanges[a][1] > angle) {
                        return densityPatterns[i].patterns;
                    }
                }
            }
        }

        return densityPatterns[0].patterns;
    }

    private drawPixel(x: number, y: number, offsetX: number, elevation: number, highDensity: boolean): boolean {
        let pattern = null;

        if (highDensity) {
            if (elevation === WaterElevation || !Number.isFinite(elevation)) {
                pattern = this.findCorrectPattern(WaterPattern, x, y);
            } else {
                pattern = this.findCorrectPattern(HighDensityPattern, x, y);
            }
        } else {
            pattern = this.findCorrectPattern(LowDensityPattern, x, y);
        }

        const row = y % 13;
        let col = x % 13;
        let patternIdx = Math.round((x * (y + 1)) / 13) % pattern.length;
        if (x < offsetX) {
            col = 13 - col - 1;
            patternIdx = pattern.length - patternIdx - 1;
        }

        return pattern[patternIdx][row].includes(col);
    }

    private renderPeakMode(image: Uint8ClampedArray, localMapData: LocalMap): void {
        const offsetX = this.ViewConfig.mapWidth / 2;

        let y = 0;
        let x = 0;
        localMapData.ElevationMap.forEach((elevation) => {
            if (elevation !== InvalidElevation) {
                if (!Number.isFinite(elevation)) {
                    if (this.drawPixel(x, y, offsetX, elevation, true)) {
                        this.fillPixel(image, x, y, { r: 255, g: 148, b: 255 });
                    }
                } else if (elevation === WaterElevation) {
                    if (this.drawPixel(x, y, offsetX, elevation, true)) {
                        this.fillPixel(image, x, y, { r: 0, g: 255, b: 255 });
                    }
                } else if (localMapData.DisplayPeaksMode) {
                    if (localMapData.SolidDensityRangeThreshold <= elevation) {
                        this.fillPixel(image, x, y, { r: 0, g: 255, b: 0 });
                    } else if (localMapData.HigherDensityRangeThreshold <= elevation && localMapData.SolidDensityRangeThreshold > elevation) {
                        if (this.drawPixel(x, y, offsetX, elevation, true)) {
                            this.fillPixel(image, x, y, { r: 0, g: 255, b: 0 });
                        }
                    } else if (localMapData.LowerDensityRangeThreshold <= elevation && elevation < localMapData.HigherDensityRangeThreshold) {
                        if (this.drawPixel(x, y, offsetX, elevation, false)) {
                            this.fillPixel(image, x, y, { r: 0, g: 255, b: 0 });
                        }
                    }
                } else if (elevation >= localMapData.HighDensityRedThreshold) {
                    if (this.drawPixel(x, y, offsetX, elevation, true)) {
                        this.fillPixel(image, x, y, { r: 255, g: 0, b: 0 });
                    }
                } else if (elevation >= localMapData.HighDensityYellowThreshold) {
                    if (this.drawPixel(x, y, offsetX, elevation, true)) {
                        this.fillPixel(image, x, y, { r: 255, g: 255, b: 50 });
                    }
                } else if (elevation >= localMapData.HighDensityGreenThreshold && elevation < localMapData.LowDensityYellowThreshold) {
                    if (this.drawPixel(x, y, offsetX, elevation, true)) {
                        this.fillPixel(image, x, y, { r: 0, g: 255, b: 0 });
                    }
                } else if (elevation >= localMapData.LowDensityYellowThreshold && elevation < localMapData.HighDensityYellowThreshold) {
                    if (this.drawPixel(x, y, offsetX, elevation, false)) {
                        this.fillPixel(image, x, y, { r: 255, g: 255, b: 50 });
                    }
                } else if (elevation >= localMapData.LowDensityGreenThreshold && elevation < localMapData.HighDensityGreenThreshold) {
                    if (this.drawPixel(x, y, offsetX, elevation, false)) {
                        this.fillPixel(image, x, y, { r: 0, g: 255, b: 0 });
                    }
                }
            }

            x++;
            if (x >= this.ViewConfig.mapWidth) {
                y += 1;
                x = 0;
            }
        });
    }

    public async render(position: PositionDto): Promise<{ buffer: Uint8Array, rows: number, columns: number, minElevation: number, maxElevation: number }> {
        if (this.worldmap.Terraindata === undefined || position === undefined) {
            return { buffer: undefined, rows: 0, columns: 0, minElevation: Infinity, maxElevation: Infinity };
        }

        const start = new Date().getTime();

        if (this.position === undefined || position.heading !== this.position.heading) {
            this.calculateHeadings(position);
        }
        this.position = position;

        // create the source buffer
        const sourceBuffer = new Uint8ClampedArray(this.ViewConfig.mapWidth * this.ViewConfig.mapHeight * 3);
        sourceBuffer.fill(0, 0, this.ViewConfig.mapWidth * this.ViewConfig.mapHeight * 3);

        // predict the reference altitude
        let referenceAltitude = position.altitude;
        if (position.verticalSpeed <= -1000) {
            // predict 30 seconds -> half of the vertical speed (feet per minute)
            referenceAltitude += position.verticalSpeed / 2;
        }

        // create the local map data
        const localMapData = this.createLocalElevationMap(position, referenceAltitude);

        this.renderPeakMode(sourceBuffer, localMapData);

        const { data, _ } = await sharp(new Uint8ClampedArray(sourceBuffer), { raw: { width: this.ViewConfig.mapWidth, height: this.ViewConfig.mapHeight, channels: 3 } })
            .toFormat('png')
            .toBuffer({ resolveWithObject: true });

        const deltaTime = new Date().getTime() - start;
        console.log(`Rendering duration: ${deltaTime}`);

        return {
            buffer: new Uint8Array(data.buffer),
            rows: this.ViewConfig.mapHeight,
            columns: this.ViewConfig.mapWidth,
            minElevation: localMapData.TerrainMapMinElevation,
            maxElevation: localMapData.TerrainMapMaxElevation,
        };
    }
}
