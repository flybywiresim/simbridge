import { NDViewDto } from '../dto/ndview.dto';
import { Worldmap } from '../manager/worldmap';
import { PositionDto } from '../dto/position.dto';
import { WGS84 } from './wgs84';
import { LocalMap } from './localmap';
import { WaterPattern } from './waterpattern';
import { HighDensityPattern } from './highdensitypattern';
import { LowDensityPattern } from './lowdensitypattern';
import { ElevationGrid } from '../mapformat/elevationgrid';
import { TerrainLevelMode, NDData } from '../manager/nddata';

const sharp = require('sharp');

const InvalidElevation = 32767;
const WaterElevation = -1;

export class NDRenderer {
    private worldmap: Worldmap | undefined = undefined;

    public ViewConfig: NDViewDto | undefined = undefined;

    private centerPixelX: number = 0;

    private distanceHeadingLut: Array<{ distancePixels: number, orientation: number }> = [];

    constructor(map: Worldmap) {
        this.worldmap = map;
    }

    private static normalizeHeading(heading: number): number {
        return (heading - (Math.floor(heading / 360) * 360));
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

    private createLocalElevationMap(position: PositionDto, referenceAltitude: number): LocalMap {
        this.centerPixelX = Math.round(this.ViewConfig.mapWidth / 2);

        // initialize the local map and LUT
        const elevationMap: Int16Array = new Int16Array(this.ViewConfig.mapWidth * this.ViewConfig.mapHeight);
        const validElevations: number[] = [];
        let maxElevation = -10000;
        let minElevation = 10000;
        elevationMap.fill(InvalidElevation, 0);
        this.distanceHeadingLut = [...Array(this.ViewConfig.mapHeight * this.ViewConfig.mapWidth)].map(() => ({ distancePixels: 0, heading: 0, orientation: 0 }));

        // create the local map and find the highest obstacle
        for (let y = 0; y < this.ViewConfig.mapHeight; ++y) {
            for (let x = 0; x < this.ViewConfig.mapWidth; ++x) {
                if (this.ViewConfig.arcMode) {
                    const distance = Math.sqrt((x - this.centerPixelX) ** 2 + (y - this.ViewConfig.mapHeight) ** 2);
                    if (distance > this.ViewConfig.mapHeight) {
                        continue;
                    }
                }

                let distanceMeters = 0;
                let heading = 0;

                // calculate only the first half and access the second half via wrapping of data
                if (x <= this.centerPixelX) {
                    const distancePixels = Math.sqrt((x - this.centerPixelX) ** 2 + (this.ViewConfig.mapHeight - y) ** 2);
                    distanceMeters = distancePixels * this.ViewConfig.meterPerPixel;
                    const angle = Math.acos((this.ViewConfig.mapHeight - y) / Math.sqrt((x - this.centerPixelX) ** 2 + (this.ViewConfig.mapHeight - y) ** 2)) * (180 / Math.PI);
                    heading = NDRenderer.normalizeHeading(360 - angle + position.heading);

                    this.distanceHeadingLut[y * this.ViewConfig.mapWidth + x].distancePixels = distancePixels;
                    this.distanceHeadingLut[y * this.ViewConfig.mapWidth + x].orientation = angle;
                } else {
                    const lutEntry = this.distanceHeadingLut[y * this.ViewConfig.mapWidth + (2 * this.centerPixelX - x)];
                    distanceMeters = lutEntry.distancePixels * this.ViewConfig.meterPerPixel;
                    heading = NDRenderer.normalizeHeading(lutEntry.orientation + position.heading);
                }

                const projected = WGS84.project(position.latitude, position.longitude, distanceMeters, heading);

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
                } else {
                    retval.TerrainMapMinElevation = TerrainLevelMode.Warning;
                }
            }

            retval.TerrainMapMinElevation = retval.LowDensityGreenThreshold;
            retval.TerrainMapMaxElevationMode = maxElevation >= retval.HighDensityRedThreshold ? TerrainLevelMode.Caution : TerrainLevelMode.Warning;
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
        let lutEntry = null;
        if (x > this.centerPixelX) {
            lutEntry = this.distanceHeadingLut[y * this.ViewConfig.mapWidth + (this.ViewConfig.mapWidth - x)];
        } else {
            lutEntry = this.distanceHeadingLut[y * this.ViewConfig.mapWidth + x];
        }

        const pxDistance = lutEntry.distancePixels;
        const angle = lutEntry.orientation;

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

    private drawPixel(x: number, y: number, elevation: number, highDensity: boolean): boolean {
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
        if (x < this.centerPixelX) {
            col = 13 - col - 1;
            patternIdx = pattern.length - patternIdx - 1;
        }

        return pattern[patternIdx][row].includes(col);
    }

    private renderPeakMode(image: Uint8ClampedArray, localMapData: LocalMap): void {
        let y = 0;
        let x = 0;
        localMapData.ElevationMap.forEach((elevation) => {
            if (elevation !== InvalidElevation) {
                if (!Number.isFinite(elevation)) {
                    if (this.drawPixel(x, y, elevation, true)) {
                        this.fillPixel(image, x, y, { r: 255, g: 148, b: 255 });
                    }
                } else if (elevation === WaterElevation) {
                    if (this.drawPixel(x, y, elevation, true)) {
                        this.fillPixel(image, x, y, { r: 0, g: 255, b: 255 });
                    }
                } else if (localMapData.DisplayPeaksMode) {
                    if (localMapData.SolidDensityRangeThreshold <= elevation) {
                        this.fillPixel(image, x, y, { r: 0, g: 255, b: 0 });
                    } else if (localMapData.HigherDensityRangeThreshold <= elevation && localMapData.SolidDensityRangeThreshold > elevation) {
                        if (this.drawPixel(x, y, elevation, true)) {
                            this.fillPixel(image, x, y, { r: 0, g: 255, b: 0 });
                        }
                    } else if (localMapData.LowerDensityRangeThreshold <= elevation && elevation < localMapData.HigherDensityRangeThreshold) {
                        if (this.drawPixel(x, y, elevation, false)) {
                            this.fillPixel(image, x, y, { r: 0, g: 255, b: 0 });
                        }
                    }
                } else if (elevation >= localMapData.HighDensityRedThreshold) {
                    if (this.drawPixel(x, y, elevation, true)) {
                        this.fillPixel(image, x, y, { r: 255, g: 0, b: 0 });
                    }
                } else if (elevation >= localMapData.HighDensityYellowThreshold) {
                    if (this.drawPixel(x, y, elevation, true)) {
                        this.fillPixel(image, x, y, { r: 255, g: 255, b: 50 });
                    }
                } else if (elevation >= localMapData.HighDensityGreenThreshold && elevation < localMapData.LowDensityYellowThreshold) {
                    if (this.drawPixel(x, y, elevation, true)) {
                        this.fillPixel(image, x, y, { r: 0, g: 255, b: 0 });
                    }
                } else if (elevation >= localMapData.LowDensityYellowThreshold && elevation < localMapData.HighDensityYellowThreshold) {
                    if (this.drawPixel(x, y, elevation, false)) {
                        this.fillPixel(image, x, y, { r: 255, g: 255, b: 50 });
                    }
                } else if (elevation >= localMapData.LowDensityGreenThreshold && elevation < localMapData.HighDensityGreenThreshold) {
                    if (this.drawPixel(x, y, elevation, false)) {
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

    public async render(position: PositionDto): Promise<NDData> {
        if (this.worldmap.Terraindata === undefined || position === undefined) {
            return null;
        }

        const start = new Date().getTime();

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

        const retval = new NDData();
        retval.Image = new Uint8Array(data.buffer);
        retval.Rows = this.ViewConfig.mapHeight;
        retval.Columns = this.ViewConfig.mapWidth;
        retval.MinimumElevation = localMapData.TerrainMapMinElevation;
        retval.MinimumElevationMode = localMapData.TerrainMapMinElevationMode;
        retval.MaximumElevation = localMapData.TerrainMapMaxElevation;
        retval.MaximumElevationMode = localMapData.TerrainMapMaxElevationMode;

        return retval;
    }
}
