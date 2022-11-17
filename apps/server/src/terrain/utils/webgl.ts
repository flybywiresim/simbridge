import { parentPort } from 'worker_threads';
import { GPU, IKernelRunShortcut, KernelOutput } from 'gpu.js';
import { RenderingData, TileData } from '../manager/worldmap';
import { TerrainMap } from '../mapformat/terrainmap';
import { createLocalElevationMap } from './gpu/elevationmap';
import { registerHelperFunctions } from './gpu/helper';
import { HistogramConstants, LocalElevationMapConstants } from './gpu/interfaces';
import { createElevationHistogram, registerStatisticsFunctions } from './gpu/statistics';
import { TileManager } from '../manager/tilemanager';

const sharp = require('sharp');

// debug configuration
const DebugElevationMap = false;
const DebugHistogram = false;

// elevation map constants
const InvalidDataValue = -1;
const InvalidElevation = 32767;
const UnknownElevation = 32766;
const WaterElevation = -1;
const FlattenGridRowIndex = 0;
const FlattenGridColumnIndex = 1;
const FlattenGridTileIndex = 2;
const FlattenGridRowCount = 3;
const FlattenGridColumnCount = 4;
const FlattenGridEntryCount = 5;
const FlattenTileIndex = 0;
const FlattenTileOffset = 1;
const FlattenTileEntryCount = 2;

// histogram parameters
const HistogramBinRange = 100;
const MinimumElevation = -500; // some areas in the world are below water level
const MaximumElevation = 29040; // mount everest

function uploadTexture(texture: number[]): number {
    return texture[this.thread.x];
}

class NavigationDisplayRenderer {
    private flattenedGridData: { grid: number[], tileCount: number } = null;

    private flattenedTileData: {
        indices: number[],
        tiles: number[][],
        offsets: number[],
        bufferLength: number,
    } = null;

    private gpuInstance: GPU = null;

    private uploadTextureToGPU: IKernelRunShortcut = null;

    private localElevationMap: IKernelRunShortcut = null;

    private elevationHistogram: IKernelRunShortcut = null;

    private gpuWorldGridBuffer: KernelOutput = null;

    private gpuTileBuffer: KernelOutput = null;

    private static fastFlatten<T>(arr: T[][]): T[] {
        const numElementsUptoIndex = Array(arr.length);
        numElementsUptoIndex[0] = 0;
        for (let i = 1; i < arr.length; i++) {
            numElementsUptoIndex[i] = numElementsUptoIndex[i - 1] + arr[i - 1].length;
        }
        const flattened = new Array(numElementsUptoIndex[arr.length - 1] + arr[arr.length - 1].length);
        let skip;
        for (let i = 0; i < arr.length; i++) {
            skip = numElementsUptoIndex[i];
            for (let j = 0; j < arr[i].length; j++) {
                flattened[skip + j] = arr[i][j];
            }
        }
        return flattened;
    }

    public async initialize(terrainmap: TerrainMap): Promise<void> {
        this.flattenedGridData = {
            grid: [],
            tileCount: 0,
        };
        this.flattenedTileData = {
            indices: [],
            tiles: [],
            offsets: [],
            bufferLength: 0,
        };

        const tileManager = new TileManager(terrainmap);
        tileManager.grid.forEach((row, rowIndex) => {
            row.forEach((tile, columnIndex) => {
                if (tile.tileIndex !== -1) {
                    this.flattenedGridData.grid.push(rowIndex);
                    this.flattenedGridData.grid.push(columnIndex);
                    this.flattenedGridData.grid.push(tile.tileIndex);
                    this.flattenedGridData.grid.push(InvalidDataValue);
                    this.flattenedGridData.grid.push(InvalidDataValue);
                }
            });
        });

        this.flattenedGridData.tileCount = this.flattenedGridData.grid.length / FlattenGridEntryCount;

        // prepare the GPU environment
        this.gpuInstance = new GPU({ mode: 'gpu' });
        registerHelperFunctions(this.gpuInstance);
        registerStatisticsFunctions(this.gpuInstance);

        this.uploadTextureToGPU = this.gpuInstance
            .createKernel(uploadTexture, {
                argumentTypes: { texture: 'Array' },
                dynamicArguments: true,
                dynamicOutput: true,
                pipeline: true,
                immutable: true,
                precision: 'single',
                strictIntegers: true,
                tactic: 'speed',
            });

        this.localElevationMap = this.gpuInstance
            .createKernel(createLocalElevationMap, {
                dynamicArguments: true,
                dynamicOutput: true,
                pipeline: !DebugElevationMap,
                immutable: true,
                precision: 'single',
                strictIntegers: true,
                tactic: 'speed',
            })
            .setLoopMaxIterations(this.flattenedGridData.tileCount); // number of tiles in the world

        this.elevationHistogram = this.gpuInstance
            .createKernel(createElevationHistogram, {
                dynamicArguments: true,
                dynamicOutput: true,
                pipeline: !DebugHistogram,
                immutable: true,
                precision: 'single',
                strictIntegers: true,
                tactic: 'speed',
            })
            .setConstants<HistogramConstants>({
                minimumElevation: MinimumElevation,
                invalidElevation: InvalidElevation,
                unknownElevation: UnknownElevation,
                waterElevation: WaterElevation,
                binRange: HistogramBinRange,
            })
            .setOutput([Math.ceil((MaximumElevation - MinimumElevation + 1) / HistogramBinRange)]);
    }

    private findFlattenGridDataOffset(row: number, column: number): number {
        for (let i = 0; i < this.flattenedGridData.tileCount; ++i) {
            const offset = i * FlattenGridEntryCount;
            if (row === this.flattenedGridData.grid[offset + FlattenGridRowIndex] && column === this.flattenedGridData.grid[offset + FlattenGridColumnIndex]) {
                return offset;
            }
        }

        return -1;
    }

    public updateTileData(whitelist: { row: number, column: number }[], loadedTiles: TileData[]): void {
        const tileData = [];
        let tileOffset = 0;

        this.flattenedTileData.bufferLength = 0;

        // cleanup cached data and collect whitelist entries
        for (let i = 0; i < this.flattenedGridData.tileCount; ++i) {
            const offset = i * FlattenGridEntryCount;

            if (this.flattenedGridData.grid[offset + FlattenGridTileIndex] !== -1) {
                const tileIndex = this.flattenedTileData.indices.findIndex((tile) => tile === this.flattenedGridData.grid[offset + FlattenGridTileIndex]);
                const gridIndex = whitelist.findIndex((entry) => (
                    this.flattenedGridData.grid[offset + FlattenGridRowIndex] === entry.row
                        && this.flattenedGridData.grid[offset + FlattenGridColumnIndex] === entry.column
                ));

                if (gridIndex === -1) {
                    // reset internal data
                    this.flattenedGridData.grid[offset + FlattenGridRowCount] = InvalidDataValue;
                    this.flattenedGridData.grid[offset + FlattenGridColumnCount] = InvalidDataValue;

                    // reset the flatten tiles
                    if (tileIndex !== -1) {
                        this.flattenedTileData.indices.splice(tileIndex, 1);
                        this.flattenedTileData.tiles.splice(tileIndex, 1);
                    }
                } else {
                    // skip the ones that are newly added
                    if (tileIndex !== -1) {
                        tileData.push(this.flattenedGridData.grid[offset + FlattenGridTileIndex]);
                        tileData.push(tileOffset);
                        tileOffset += this.flattenedTileData.tiles[tileIndex].length;
                    }

                    // remove found entry
                    whitelist.splice(gridIndex, 1);
                }
            }
        }

        loadedTiles.forEach((tile) => {
            if (tile.grid !== null) {
                const flatGridOffset = this.findFlattenGridDataOffset(tile.row, tile.column);
                if (flatGridOffset < 0) {
                    console.log(`ERROR: Invalid tile received: ${tile.row}, ${tile.column}`);
                }
                if (tile.grid !== undefined && tile.grid.MapLoaded) {
                    this.flattenedGridData.grid[flatGridOffset + FlattenGridRowCount] = tile.grid.Rows;
                    this.flattenedGridData.grid[flatGridOffset + FlattenGridColumnCount] = tile.grid.Columns;
                    const tileIndex = this.flattenedGridData.grid[flatGridOffset + FlattenGridTileIndex];

                    this.flattenedTileData.indices.push(tileIndex);
                    this.flattenedTileData.tiles.push(Array.from(tile.grid.ElevationMap));

                    tileData.push(tileIndex);
                    tileData.push(tileOffset);
                    tileOffset += this.flattenedTileData.tiles[this.flattenedTileData.tiles.length - 1].length;
                } else {
                    this.flattenedGridData.grid[flatGridOffset + FlattenGridRowCount] = InvalidDataValue;
                    this.flattenedGridData.grid[flatGridOffset + FlattenGridColumnCount] = InvalidDataValue;
                }
            }
        });

        // update the GPU data
        this.flattenedTileData.offsets = tileData;

        if (this.uploadTextureToGPU !== null) {
            // upload the world grid
            let start = performance.now();
            this.uploadTextureToGPU = this.uploadTextureToGPU.setOutput([this.flattenedGridData.grid.length]);
            this.gpuWorldGridBuffer = this.uploadTextureToGPU(this.flattenedGridData.grid);
            console.log(`World upload: ${performance.now() - start}`);

            // upload the cached tiles
            start = performance.now();
            const buffer = NavigationDisplayRenderer.fastFlatten(this.flattenedTileData.tiles);
            this.uploadTextureToGPU = this.uploadTextureToGPU.setOutput([buffer.length]);
            this.gpuTileBuffer = this.uploadTextureToGPU(buffer);
            console.log(`Tile upload: ${performance.now() - start}`);

            this.flattenedTileData.bufferLength = buffer.length;
        }
    }

    public async render(data: RenderingData): Promise<void> {
        if (this.localElevationMap !== null) {
            let start = performance.now();
            this.localElevationMap = this.localElevationMap
                .setConstants<LocalElevationMapConstants>({
                    angleStepPerTile: [1, 1],
                    worldGridElementCount: this.flattenedGridData.tileCount,
                    invalidDataValue: InvalidDataValue,
                    invalidElevation: InvalidElevation,
                    unknownElevation: UnknownElevation,
                    waterElevation: WaterElevation,
                    gridRowIndex: FlattenGridRowIndex,
                    gridColumnIndex: FlattenGridColumnIndex,
                    gridTileIndex: FlattenGridTileIndex,
                    gridRowCount: FlattenGridRowCount,
                    gridColumnCount: FlattenGridColumnCount,
                    gridEntryCount: FlattenGridEntryCount,
                    flattenTileIndex: FlattenTileIndex,
                    flattenTileOffset: FlattenTileOffset,
                    flattenTileEntryCount: FlattenTileEntryCount,
                })
                .setOutput([data.viewConfig.mapWidth, data.viewConfig.mapHeight]);
            console.log(`Compilation (render): ${performance.now() - start}`);

            start = performance.now();
            const elevationGrid = this.localElevationMap(
                data.position.latitude,
                data.position.longitude,
                data.position.heading,
                [data.viewConfig.mapWidth, data.viewConfig.mapHeight],
                data.viewConfig.meterPerPixel,
                this.gpuWorldGridBuffer,
                this.flattenedTileData.indices.length,
                this.flattenedTileData.offsets,
                this.gpuTileBuffer,
                this.flattenedTileData.bufferLength,
            );
            console.log(`Elevation map: ${performance.now() - start}`);

            if (DebugElevationMap) {
                const elevations = NavigationDisplayRenderer.fastFlatten(elevationGrid as number[][]);
                let maxElevation = 0;
                let minElevation = 1000;
                elevations.forEach((entry) => {
                    maxElevation = Math.max(entry, maxElevation);
                    minElevation = Math.min(entry, minElevation);
                });

                const image = new Uint8ClampedArray(elevations.length);
                elevations.forEach((entry, index) => {
                    const gray = Math.max(Math.min((entry / maxElevation) * 255, 255), 0);
                    image[index] = gray;
                });

                const base64 = await sharp(image, { raw: { width: data.viewConfig.mapWidth, height: data.viewConfig.mapHeight, channels: 1 } })
                    .png()
                    .toBuffer()
                    .then((clipped) => Buffer.from(new Uint8Array(clipped)).toString('base64'));
                console.log(base64);

                return;
            }

            start = performance.now();
            const histogram = this.elevationHistogram(
                elevationGrid,
                data.viewConfig.mapWidth,
                data.viewConfig.mapHeight,
            );
            console.log(`Histogram: ${performance.now() - start}`);

            if (DebugHistogram) {
                (histogram as number[]).forEach((entry) => console.log(entry));
            }
        }
    }
}

const renderer = new NavigationDisplayRenderer();

async function createNavigationDisplayMaps(data: RenderingData) {
    // no valid position data received
    if (data.position === undefined) {
        console.log('No valid position received for rendering');
        parentPort.postMessage(undefined);
    } else {
        renderer.render(data);
        parentPort.postMessage(undefined);
    }
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
