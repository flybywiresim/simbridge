import { gunzip } from 'zlib';
import { ElevationGrid } from './elevationgrid';
import { Terrainmap } from './terrainmap';

export class Tile {
    private parent: Terrainmap | undefined = undefined;

    private buffer: SharedArrayBuffer | undefined = undefined;

    public Southwest: { latitude: number, longitude: number } = { latitude: 0, longitude: 0 };

    public BufferOffset: number = 0;

    public BufferSize: number = 0;

    private GridDimension: { rows: number, columns: number } = { rows: 0, columns: 0 };

    constructor(parent: Terrainmap, buffer: SharedArrayBuffer, offset: number) {
        const arrBuffer = Buffer.from(buffer);

        this.parent = parent;
        this.buffer = buffer;

        // extract the tile header
        this.GridDimension.rows = arrBuffer.readUInt16LE(offset);
        this.GridDimension.columns = arrBuffer.readUInt16LE(offset + 2);
        this.Southwest.latitude = arrBuffer.readInt8(offset + 4);
        this.Southwest.longitude = arrBuffer.readInt16LE(offset + 5);
        this.BufferSize = arrBuffer.readUInt32LE(offset + 7);
        this.BufferOffset = offset + 11;
    }

    public loadElevationGrid(): ElevationGrid {
        const northeast = { latitude: this.Southwest.latitude + this.parent.AngularSteps.latitude, longitude: this.Southwest.longitude + this.parent.AngularSteps.longitude };
        const retval = new ElevationGrid(this.Southwest, northeast, this.GridDimension.columns, this.GridDimension.rows);

        const compressed = new Uint8Array(this.buffer).subarray(this.BufferOffset, this.BufferOffset + this.BufferSize);
        gunzip(compressed, (err, decompressed) => {
            const decompressedBuffer = Buffer.from(decompressed);
            const grid = new Int16Array(retval.Grid);

            let offset = 0;
            for (let row = 0; row < this.GridDimension.rows; ++row) {
                for (let col = 0; col < this.GridDimension.columns; ++col) {
                    grid[row * this.GridDimension.columns + col] = decompressedBuffer.readInt16LE(offset);
                    if (grid[row * this.GridDimension.columns + col] !== -1) {
                        grid[row * this.GridDimension.columns + col] = Math.round(grid[row * this.GridDimension.columns + col] * 3.28084);
                    }
                    offset += 2;
                }
            }
        });

        return retval;
    }
}
