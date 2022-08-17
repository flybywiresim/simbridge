import { parentPort } from 'worker_threads';
import { NavigationDisplayViewDto } from '../dto/navigationdisplayview.dto';
import { Worldmap, RenderingData } from '../manager/worldmap';
import { PositionDto } from '../dto/position.dto';
import { WGS84 } from './wgs84';
import { LocalMap } from './localmap';
import { WaterPattern } from './waterpattern';
import { HighDensityPattern } from './highdensitypattern';
import { LowDensityPattern } from './lowdensitypattern';
import { ElevationGrid } from '../mapformat/elevationgrid';
import { TerrainMap } from '../mapformat/terrainmap';
import { TerrainLevelMode, NavigationDisplayData } from '../manager/navigationdisplaydata';
import { TileManager } from '../manager/tilemanager';

const sharp = require('sharp');

const InvalidElevation = 32767;
const UnknownElevation = 32766;
const WaterElevation = -1;

class NavigationDisplayRenderer {
    public data: RenderingData;

    private centerPixelX: number = 0;

    private tiles: TileManager = null;

    private distanceHeadingLut: Array<{ distancePixels: number, orientation: number }> = [];

    public initialize(terrainmap: TerrainMap): void {
        this.tiles = new TileManager(terrainmap);
    }

    public updateTileData(whitelist: { row: number, column: number }[], loadedTiles: { row: number, column: number, grid: ElevationGrid }[]): void {
        loadedTiles.forEach((tile) => {
            if (tile.grid !== null) {
                this.tiles.setElevationMap({ row: tile.row, column: tile.column }, tile.grid);
            }
        });

        this.tiles.cleanupElevationCache(whitelist);
    }

    public updateRenderingData(data: RenderingData): void {
        this.data = data;
    }

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

    private extractElevation(viewConfig: NavigationDisplayViewDto, position: PositionDto, x: number, y: number): number {
        const distancePixelsSqrt = (x - this.centerPixelX) ** 2 + (viewConfig.mapHeight - y) ** 2;

        if (viewConfig.arcMode) {
            if (distancePixelsSqrt > viewConfig.mapHeight * viewConfig.mapHeight) {
                return InvalidElevation;
            }
        }

        const distancePixels = Math.sqrt(distancePixelsSqrt);
        const distanceMeters = distancePixels * viewConfig.meterPerPixel;
        const angle = Math.acos((viewConfig.mapHeight - y) / distancePixels) * (180 / Math.PI);
        const heading = NavigationDisplayRenderer.normalizeHeading((x > this.centerPixelX ? angle : (360 - angle)) + position.heading);
        this.distanceHeadingLut[y * viewConfig.mapWidth + x].distancePixels = distancePixels;
        this.distanceHeadingLut[y * viewConfig.mapWidth + x].orientation = angle;

        const projected = WGS84.project(position.latitude, position.longitude, distanceMeters, heading);

        const worldIdx = Worldmap.worldMapIndices(this.data.gridDefinition, projected.latitude, projected.longitude);
        const tile = this.tiles.grid[worldIdx.row][worldIdx.column];
        let elevation = 0;

        if (tile.tileIndex === -1) {
            elevation = WaterElevation;
        } else if (tile.elevationmap !== undefined && tile.elevationmap.MapLoaded) {
            const mapIdx = ElevationGrid.worldToGridIndices(tile.elevationmap, { latitude: projected.latitude, longitude: projected.longitude });
            elevation = tile.elevationmap.ElevationMap[mapIdx.row * tile.elevationmap.Columns + mapIdx.column];
        } else {
            elevation = UnknownElevation;
        }

        return elevation;
    }

    private createLocalElevationMap(viewConfig: NavigationDisplayViewDto, position: PositionDto, referenceAltitude: number): LocalMap {
        this.centerPixelX = Math.round(viewConfig.mapWidth / 2);

        // initialize the local map and LUT
        const elevationMap: Int16Array = new Int16Array(viewConfig.mapWidth * viewConfig.mapHeight);
        const validElevations: number[] = [];
        let maxElevation = -10000;
        let minElevation = 10000;
        this.distanceHeadingLut = [...Array(viewConfig.mapHeight * viewConfig.mapWidth)].map(() => ({ distancePixels: 0, heading: 0, orientation: 0 }));

        // create the local map and find the highest obstacle
        let x = 0;
        let y = 0;
        elevationMap.forEach((_) => {
            let elevation = InvalidElevation;
            if (viewConfig.arcMode) {
                const distance = Math.sqrt((x - this.centerPixelX) ** 2 + (y - viewConfig.mapHeight) ** 2);
                if (distance <= viewConfig.mapHeight) {
                    elevation = this.extractElevation(viewConfig, position, x, y);
                }
            } else {
                elevation = this.extractElevation(viewConfig, position, x, y);
            }

            if (elevation !== WaterElevation && elevation !== InvalidElevation && elevation !== UnknownElevation) {
                maxElevation = Math.max(elevation, maxElevation);
                minElevation = Math.min(elevation, minElevation);
                validElevations.push(elevation);
            }

            elevationMap[y * viewConfig.mapWidth + x] = elevation;

            x += 1;
            if (x >= viewConfig.mapWidth) {
                y += 1;
                x = 0;
            }
        });

        // calculate the peak-mode percentils
        validElevations.sort((a, b) => a - b);

        const retval = new LocalMap();
        retval.ElevationMap = Int16Array.from(elevationMap);
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

    private fillPixel(viewConfig: NavigationDisplayViewDto, image: Uint8ClampedArray, x: number, y: number, r: number, g: number, b: number) {
        image[(y * viewConfig.mapWidth + x) * 3 + 0] = r;
        image[(y * viewConfig.mapWidth + x) * 3 + 1] = g;
        image[(y * viewConfig.mapWidth + x) * 3 + 2] = b;
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
            if (elevation === WaterElevation) {
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
            this.fillPixel(viewConfig, image, x, y, 4, 4, 5);
            if (elevation !== InvalidElevation && elevation !== UnknownElevation) {
                if (elevation === WaterElevation) {
                    if (this.drawPixel(viewConfig, x, y, elevation, true)) {
                        this.fillPixel(viewConfig, image, x, y, 0, 255, 255);
                    }
                } else if (localMapData.DisplayPeaksMode) {
                    if (localMapData.SolidDensityRangeThreshold <= elevation) {
                        this.fillPixel(viewConfig, image, x, y, 0, 255, 0);
                        localMapData.RenderedNonCriticalAreas = true;
                    } else if (localMapData.HigherDensityRangeThreshold <= elevation && localMapData.SolidDensityRangeThreshold > elevation) {
                        if (this.drawPixel(viewConfig, x, y, elevation, true)) {
                            this.fillPixel(viewConfig, image, x, y, 0, 255, 0);
                            localMapData.RenderedNonCriticalAreas = true;
                        }
                    } else if (localMapData.LowerDensityRangeThreshold <= elevation && elevation < localMapData.HigherDensityRangeThreshold) {
                        if (this.drawPixel(viewConfig, x, y, elevation, false)) {
                            this.fillPixel(viewConfig, image, x, y, 0, 255, 0);
                            localMapData.RenderedNonCriticalAreas = true;
                        }
                    }
                } else if (elevation >= localMapData.HighDensityRedThreshold) {
                    if (this.drawPixel(viewConfig, x, y, elevation, true)) {
                        this.fillPixel(viewConfig, image, x, y, 255, 0, 0);
                    }
                } else if (elevation >= localMapData.HighDensityYellowThreshold) {
                    if (this.drawPixel(viewConfig, x, y, elevation, true)) {
                        this.fillPixel(viewConfig, image, x, y, 255, 255, 50);
                    }
                } else if (elevation >= localMapData.HighDensityGreenThreshold && elevation < localMapData.LowDensityYellowThreshold) {
                    if (this.drawPixel(viewConfig, x, y, elevation, true)) {
                        this.fillPixel(viewConfig, image, x, y, 0, 255, 0);
                        localMapData.RenderedNonCriticalAreas = true;
                    }
                } else if (elevation >= localMapData.LowDensityYellowThreshold && elevation < localMapData.HighDensityYellowThreshold) {
                    if (this.drawPixel(viewConfig, x, y, elevation, false)) {
                        this.fillPixel(viewConfig, image, x, y, 255, 255, 50);
                    }
                } else if (elevation >= localMapData.LowDensityGreenThreshold && elevation < localMapData.HighDensityGreenThreshold) {
                    if (this.drawPixel(viewConfig, x, y, elevation, false)) {
                        this.fillPixel(viewConfig, image, x, y, 0, 255, 0);
                        localMapData.RenderedNonCriticalAreas = true;
                    }
                }
            } else if (elevation === UnknownElevation) {
                if (this.drawPixel(viewConfig, x, y, elevation, true)) {
                    this.fillPixel(viewConfig, image, x, y, 255, 148, 255);
                    localMapData.RenderedNonCriticalAreas = true;
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
        if (this.data.tiles.length === 0 || position === undefined) {
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

    public static async clipNavigationDisplayMap(pixelData: Uint8ClampedArray, mapData, width: number, height: number, stepSize: number, horizontal: boolean): Promise<string> {
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

        return sharp(pixelData, { raw: { width: mapData.Columns, height: mapData.Rows, channels: 3 } })
            .composite([
                { input: clippingPath, blend: 'dest-atop' },
            ])
            .png()
            .toBuffer()
            .then((clipped) => Buffer.from(new Uint8Array(clipped)).toString('base64'));
    }
}

const renderer = new NavigationDisplayRenderer();

async function createNavigationDisplayMaps(data: RenderingData) {
    renderer.updateRenderingData(data);
    const mapData = renderer.render(data.viewConfig, data.position);

    const pixeldata = new Uint8ClampedArray(mapData.Pixeldata);
    const overallFrames = data.viewConfig.mapTransitionTime * data.viewConfig.mapTransitionFps;
    const overallFramesHalfTime = Math.ceil(overallFrames / 2);

    const heightStep = Math.round(mapData.Rows / overallFramesHalfTime);
    const widthStep = Math.round((mapData.Columns / 2) / overallFramesHalfTime);
    const frames = {};

    for (let i = 0; i < overallFramesHalfTime; ++i) {
        frames[i] = NavigationDisplayRenderer.clipNavigationDisplayMap(pixeldata, mapData, mapData.Columns, mapData.Rows, widthStep * i, true);
    }
    for (let i = 0; i < overallFramesHalfTime; ++i) {
        frames[i + overallFramesHalfTime] = NavigationDisplayRenderer.clipNavigationDisplayMap(pixeldata, mapData, mapData.Columns, mapData.Rows, heightStep * i, false);
    }
    if ((overallFrames - overallFramesHalfTime) * heightStep !== mapData.Rows) {
        frames[overallFrames + 1] = NavigationDisplayRenderer.clipNavigationDisplayMap(pixeldata, mapData, mapData.Columns, mapData.Rows, mapData.Rows, false);
    }

    const frameKeys = Object.keys(frames);
    mapData.ImageSequence = await Promise.all(frameKeys.map((frame) => frames[frame]));
    mapData.Timestamp = data.timestamp;

    parentPort.postMessage(mapData);
}

parentPort.on('message', (data: { type: string, instance: any }) => {
    if (data.type === 'INITIALIZATION') {
        renderer.initialize(data.instance as TerrainMap);
    } else if (data.type === 'TILES') {
        renderer.updateTileData(data.instance.whitelist, data.instance.loadedTiles);
    } else if (data.type === 'RENDERING') {
        createNavigationDisplayMaps(data.instance as RenderingData);
    }
});
