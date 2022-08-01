import { parentPort } from 'worker_threads';
import { NavigationDisplayViewDto } from '../dto/navigationdisplayview.dto';
import { Worldmap, WorldMapData } from '../manager/worldmap';
import { PositionDto } from '../dto/position.dto';
import { WGS84 } from './wgs84';
import { LocalMap } from './localmap';
import { WaterPattern } from './waterpattern';
import { HighDensityPattern } from './highdensitypattern';
import { LowDensityPattern } from './lowdensitypattern';
import { ElevationGrid } from '../mapformat/elevationgrid';
import { TerrainLevelMode, NavigationDisplayData } from '../manager/navigationdisplaydata';

const sharp = require('sharp');

const InvalidElevation = 32767;
const WaterElevation = -1;

class NavigationDisplayRenderer {
    private centerPixelX: number = 0;

    private distanceHeadingLut: Array<{ distancePixels: number, orientation: number }> = [];

    constructor(private data: WorldMapData) { }

    private static normalizeHeading(heading: number): number {
        return (heading - (Math.floor(heading / 360) * 360));
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

    private createLocalElevationMap(viewConfig: NavigationDisplayViewDto, position: PositionDto, referenceAltitude: number): LocalMap {
        this.centerPixelX = Math.round(viewConfig.mapWidth / 2);

        // initialize the local map and LUT
        const elevationMap: Int16Array = new Int16Array(viewConfig.mapWidth * viewConfig.mapHeight);
        const validElevations: number[] = [];
        let maxElevation = -10000;
        let minElevation = 10000;
        elevationMap.fill(InvalidElevation, 0);
        this.distanceHeadingLut = [...Array(viewConfig.mapHeight * viewConfig.mapWidth)].map(() => ({ distancePixels: 0, heading: 0, orientation: 0 }));

        // create the local map and find the highest obstacle
        for (let y = 0; y < viewConfig.mapHeight; ++y) {
            for (let x = 0; x < viewConfig.mapWidth; ++x) {
                if (viewConfig.arcMode) {
                    const distance = Math.sqrt((x - this.centerPixelX) ** 2 + (y - viewConfig.mapHeight) ** 2);
                    if (distance > viewConfig.mapHeight) {
                        continue;
                    }
                }

                let distanceMeters = 0;
                let heading = 0;

                // calculate only the first half and access the second half via wrapping of data
                if (x <= this.centerPixelX) {
                    const distancePixels = Math.sqrt((x - this.centerPixelX) ** 2 + (viewConfig.mapHeight - y) ** 2);
                    distanceMeters = distancePixels * viewConfig.meterPerPixel;
                    const angle = Math.acos((viewConfig.mapHeight - y) / Math.sqrt((x - this.centerPixelX) ** 2 + (viewConfig.mapHeight - y) ** 2)) * (180 / Math.PI);
                    heading = NavigationDisplayRenderer.normalizeHeading(360 - angle + position.heading);

                    this.distanceHeadingLut[y * viewConfig.mapWidth + x].distancePixels = distancePixels;
                    this.distanceHeadingLut[y * viewConfig.mapWidth + x].orientation = angle;
                } else {
                    const lutEntry = this.distanceHeadingLut[y * viewConfig.mapWidth + (2 * this.centerPixelX - x)];
                    distanceMeters = lutEntry.distancePixels * viewConfig.meterPerPixel;
                    heading = NavigationDisplayRenderer.normalizeHeading(lutEntry.orientation + position.heading);
                }

                const projected = WGS84.project(position.latitude, position.longitude, distanceMeters, heading);

                const worldIdx = Worldmap.worldMapIndices(this.data, projected.latitude, projected.longitude);
                const tile = this.data.grid[worldIdx.row][worldIdx.column];
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

                elevationMap[y * viewConfig.mapWidth + x] = elevation;
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
        const percentile85th = NavigationDisplayRenderer.percentile(validElevations, 0.85);

        // normal mode
        if (maxElevation >= referenceAltitude - (viewConfig.gearDown ? 250 : 500)) {
            retval.DisplayPeaksMode = false;
            retval.LowDensityGreenThreshold = referenceAltitude - 2000 <= minElevation ? minElevation + 200 : referenceAltitude - 2000;
            retval.HighDensityGreenThreshold = referenceAltitude - 1000 <= minElevation ? minElevation + 200 : referenceAltitude - 1000;
            retval.LowDensityYellowThreshold = referenceAltitude - (viewConfig.gearDown ? 250 : 500);
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

            retval.TerrainMapMinElevation = retval.LowDensityGreenThreshold >= 0 ? retval.LowDensityGreenThreshold : 0;
            retval.TerrainMapMaxElevationMode = maxElevation >= retval.HighDensityRedThreshold ? TerrainLevelMode.Caution : TerrainLevelMode.Warning;
        // standard peaks mode
        } else {
            const percentile95th = NavigationDisplayRenderer.percentile(validElevations, 0.95);
            retval.LowerDensityRangeThreshold = Math.min(percentile85th, halfElevation);
            retval.HigherDensityRangeThreshold = Math.min(percentile95th, (retval.MaximumElevation - minElevation) * 0.65 + minElevation);
            retval.SolidDensityRangeThreshold = (retval.MaximumElevation - minElevation) * 0.95 + minElevation;
            retval.TerrainMapMinElevation = retval.LowerDensityRangeThreshold;

            // validate the ranges and statistics to detect other flat terrain situations (disable upper ranges)
            if (retval.LowerDensityRangeThreshold >= retval.HigherDensityRangeThreshold
            || retval.LowerDensityRangeThreshold >= retval.SolidDensityRangeThreshold
            || retval.HigherDensityRangeThreshold >= retval.SolidDensityRangeThreshold
            || percentile85th >= percentile95th
            || percentile85th >= retval.SolidDensityRangeThreshold
            || percentile95th >= retval.SolidDensityRangeThreshold) {
                retval.HigherDensityRangeThreshold = retval.MaximumElevation + 100;
                retval.SolidDensityRangeThreshold = retval.MaximumElevation + 100;
            }

            // special case for all-water scenarios
            if (retval.TerrainMapMaxElevation < 0) {
                retval.TerrainMapMinElevation = -1;
                retval.TerrainMapMaxElevation = 0;
            }
        }

        return retval;
    }

    private fillPixel(viewConfig: NavigationDisplayViewDto, image: Uint8ClampedArray, x: number, y: number, color: { r: number, g: number, b: number }) {
        image[(y * viewConfig.mapWidth + x) * 3 + 0] = color.r;
        image[(y * viewConfig.mapWidth + x) * 3 + 1] = color.g;
        image[(y * viewConfig.mapWidth + x) * 3 + 2] = color.b;
    }

    private findCorrectPattern(viewConfig: NavigationDisplayViewDto, densityPatterns: { angleRanges: number[][],
        minPixelDistance: number, patterns: number[][][] }[], x: number, y: number): number[][][] {
        // find the correct pixel entry
        let lutEntry = null;
        if (x > this.centerPixelX) {
            lutEntry = this.distanceHeadingLut[y * viewConfig.mapWidth + (viewConfig.mapWidth - x)];
        } else {
            lutEntry = this.distanceHeadingLut[y * viewConfig.mapWidth + x];
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

    private drawPixel(viewConfig: NavigationDisplayViewDto, x: number, y: number, elevation: number, highDensity: boolean): boolean {
        let pattern = null;

        if (highDensity) {
            if (elevation === WaterElevation || !Number.isFinite(elevation)) {
                pattern = this.findCorrectPattern(viewConfig, WaterPattern, x, y);
            } else {
                pattern = this.findCorrectPattern(viewConfig, HighDensityPattern, x, y);
            }
        } else {
            pattern = this.findCorrectPattern(viewConfig, LowDensityPattern, x, y);
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

    private renderPeakMode(viewConfig: NavigationDisplayViewDto, image: Uint8ClampedArray, localMapData: LocalMap): void {
        let y = 0;
        let x = 0;
        localMapData.ElevationMap.forEach((elevation) => {
            if (elevation !== InvalidElevation) {
                if (!Number.isFinite(elevation)) {
                    if (this.drawPixel(viewConfig, x, y, elevation, true)) {
                        this.fillPixel(viewConfig, image, x, y, { r: 255, g: 148, b: 255 });
                    }
                } else if (elevation === WaterElevation) {
                    if (this.drawPixel(viewConfig, x, y, elevation, true)) {
                        this.fillPixel(viewConfig, image, x, y, { r: 0, g: 255, b: 255 });
                    }
                } else if (localMapData.DisplayPeaksMode) {
                    if (localMapData.SolidDensityRangeThreshold <= elevation) {
                        this.fillPixel(viewConfig, image, x, y, { r: 0, g: 255, b: 0 });
                        localMapData.RenderedNonCriticalAreas = true;
                    } else if (localMapData.HigherDensityRangeThreshold <= elevation && localMapData.SolidDensityRangeThreshold > elevation) {
                        if (this.drawPixel(viewConfig, x, y, elevation, true)) {
                            this.fillPixel(viewConfig, image, x, y, { r: 0, g: 255, b: 0 });
                            localMapData.RenderedNonCriticalAreas = true;
                        }
                    } else if (localMapData.LowerDensityRangeThreshold <= elevation && elevation < localMapData.HigherDensityRangeThreshold) {
                        if (this.drawPixel(viewConfig, x, y, elevation, false)) {
                            this.fillPixel(viewConfig, image, x, y, { r: 0, g: 255, b: 0 });
                            localMapData.RenderedNonCriticalAreas = true;
                        }
                    }
                } else if (elevation >= localMapData.HighDensityRedThreshold) {
                    if (this.drawPixel(viewConfig, x, y, elevation, true)) {
                        this.fillPixel(viewConfig, image, x, y, { r: 255, g: 0, b: 0 });
                    }
                } else if (elevation >= localMapData.HighDensityYellowThreshold) {
                    if (this.drawPixel(viewConfig, x, y, elevation, true)) {
                        this.fillPixel(viewConfig, image, x, y, { r: 255, g: 255, b: 50 });
                    }
                } else if (elevation >= localMapData.HighDensityGreenThreshold && elevation < localMapData.LowDensityYellowThreshold) {
                    if (this.drawPixel(viewConfig, x, y, elevation, true)) {
                        this.fillPixel(viewConfig, image, x, y, { r: 0, g: 255, b: 0 });
                        localMapData.RenderedNonCriticalAreas = true;
                    }
                } else if (elevation >= localMapData.LowDensityYellowThreshold && elevation < localMapData.HighDensityYellowThreshold) {
                    if (this.drawPixel(viewConfig, x, y, elevation, false)) {
                        this.fillPixel(viewConfig, image, x, y, { r: 255, g: 255, b: 50 });
                    }
                } else if (elevation >= localMapData.LowDensityGreenThreshold && elevation < localMapData.HighDensityGreenThreshold) {
                    if (this.drawPixel(viewConfig, x, y, elevation, false)) {
                        this.fillPixel(viewConfig, image, x, y, { r: 0, g: 255, b: 0 });
                        localMapData.RenderedNonCriticalAreas = true;
                    }
                }
            }

            x++;
            if (x >= viewConfig.mapWidth) {
                y += 1;
                x = 0;
            }
        });
    }

    public render(viewConfig: NavigationDisplayViewDto, position: PositionDto): NavigationDisplayData {
        if (this.data.terrainData === undefined || position === undefined) {
            return null;
        }

        // create the source buffer
        const sharedBuffer = new SharedArrayBuffer(viewConfig.mapWidth * viewConfig.mapHeight * 3);
        const sourceBuffer = new Uint8ClampedArray(sharedBuffer);
        sourceBuffer.fill(0, 0, viewConfig.mapWidth * viewConfig.mapHeight * 3);

        // predict the reference altitude
        let referenceAltitude = position.altitude;
        if (position.verticalSpeed <= -1000) {
            // predict 30 seconds -> half of the vertical speed (feet per minute)
            referenceAltitude += position.verticalSpeed / 2;
        }

        // create the local map data
        const localMapData = this.createLocalElevationMap(viewConfig, position, referenceAltitude);

        this.renderPeakMode(viewConfig, sourceBuffer, localMapData);

        const retval = new NavigationDisplayData();
        retval.Pixeldata = sharedBuffer;
        retval.Rows = viewConfig.mapHeight;
        retval.Columns = viewConfig.mapWidth;
        retval.MinimumElevation = localMapData.TerrainMapMinElevation;
        retval.MinimumElevationMode = localMapData.RenderedNonCriticalAreas ? TerrainLevelMode.PeaksMode : TerrainLevelMode.Warning;
        retval.MaximumElevation = localMapData.TerrainMapMaxElevation;
        retval.MaximumElevationMode = localMapData.TerrainMapMaxElevationMode;

        return retval;
    }

    public static async clipNavigationDisplayMap(pngData, width: number, height: number, stepSize: number, horizontal: boolean): Promise<string> {
        const centerX = Math.round(width / 2);
        let clippingPath = undefined;

        if (horizontal) {
            clippingPath = Buffer.from(`
                <svg width="${width}" height="${height}">
                    <path d="M ${centerX} ${height} L ${centerX + stepSize} 0 L ${centerX - stepSize} 0z" />
                </svg>`);
        } else {
            clippingPath = Buffer.from(`
                <svg width="${width}" height="${height}">
                    <path d="M ${centerX} ${height} L ${width - 1} ${stepSize} L ${width - 1} 0 L 0 0 L 0 ${stepSize}z" />
                </svg>`);
        }

        return sharp(pngData)
            .composite([
                { input: clippingPath, blend: 'dest-atop' },
            ])
            .toBuffer()
            .then((clipped) => Buffer.from(new Uint8Array(clipped)).toString('base64'));
    }
}

async function createNavigationDisplayMaps(viewConfig: NavigationDisplayViewDto, data: WorldMapData, position: PositionDto, timestamp: number) {
    const renderer = new NavigationDisplayRenderer(data);
    const mapData = renderer.render(viewConfig, position);

    const frames = await sharp(new Uint8ClampedArray(mapData.Pixeldata), { raw: { width: mapData.Columns, height: mapData.Rows, channels: 3 } })
        .png()
        .ensureAlpha()
        .toBuffer()
        .then((data) => {
            const overallFrames = viewConfig.mapTransitionTime * viewConfig.mapTransitionFps;
            const overallFramesHalfTime = Math.ceil(overallFrames / 2);

            const heightStep = Math.round(mapData.Rows / overallFramesHalfTime);
            const widthStep = Math.round((mapData.Columns / 2) / overallFramesHalfTime);
            const frameCollection = {};

            for (let i = 0; i < overallFramesHalfTime; ++i) {
                frameCollection[i] = NavigationDisplayRenderer.clipNavigationDisplayMap(data, mapData.Columns, mapData.Rows, widthStep * i, true);
            }
            for (let i = 0; i < overallFramesHalfTime; ++i) {
                frameCollection[i + overallFramesHalfTime] = NavigationDisplayRenderer.clipNavigationDisplayMap(data, mapData.Columns, mapData.Rows, heightStep * i, false);
            }
            if ((overallFrames - overallFramesHalfTime) * heightStep !== mapData.Rows) {
                frameCollection[overallFrames + 1] = NavigationDisplayRenderer.clipNavigationDisplayMap(data, mapData.Columns, mapData.Rows, mapData.Rows, false);
            }

            return frameCollection;
        });

    const frameKeys = Object.keys(frames);
    mapData.ImageSequence = await Promise.all(frameKeys.map((frame) => frames[frame]));
    mapData.Timestamp = timestamp;

    parentPort.postMessage(mapData);
}

parentPort.on('message', (data: { viewConfig: NavigationDisplayViewDto, data: WorldMapData, position: PositionDto, timestamp: number }) => {
    createNavigationDisplayMaps(data.viewConfig, data.data, data.position, data.timestamp);
});
