import { Tile } from './tile';

export class Terrainmap {
    private Data: Buffer | undefined = undefined;

    public LatitudeRange: number[] = [];

    public LongitudeRange: number[] = [];

    public AngularSteps: number[] = [];

    public ElevationResolution: number = 0;

    public Tiles: Tile[] = []

    constructor(buffer: Buffer) {
        this.Data = buffer;

        // extract the file header
        this.LatitudeRange = [buffer.readInt16LE(0), buffer.readInt16LE(2)];
        this.LongitudeRange = [buffer.readInt16LE(4), buffer.readInt16LE(6)];
        this.AngularSteps = [buffer.readUInt8(8), buffer.readUInt8(9)];
        this.ElevationResolution = buffer.readUInt8(10);

        const bytes = Buffer.byteLength(buffer);
        let offset = 11;
        while (offset < bytes) {
            const tile = new Tile(buffer, offset);
            this.Tiles.push(tile);
            offset = tile.BufferOffset + tile.BufferSize;
        }
    }
}
