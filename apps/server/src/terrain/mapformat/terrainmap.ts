import { Logger } from '@nestjs/common';
import { Tileheader } from './tileheader';

export class Terrainmap {
    private Data: Buffer | undefined = undefined;

    public LatitudeRange: number[] = [];

    public LongitudeRange: number[] = [];

    public AngularSteps: number[] = [];

    public ElevationResolution: number = 0;

    public Tiles: Tileheader[] = []

    constructor(buffer: Buffer, logger: Logger) {
        this.Data = buffer;

        // extract the file header
        this.LatitudeRange = [buffer.readInt16LE(0), buffer.readInt16LE(2)];
        this.LongitudeRange = [buffer.readInt16LE(4), buffer.readInt16LE(6)];
        this.AngularSteps = [buffer.readUInt8(8), buffer.readUInt8(9)];
        this.ElevationResolution = buffer.readUInt8(10);

        logger.log(`Latitude: ${this.LatitudeRange[0]} - ${this.LatitudeRange[1]}; Longitude: ${this.LongitudeRange[0]} - ${this.LongitudeRange[1]}`);
        logger.log(`Steps: ${this.AngularSteps[0]}, ${this.AngularSteps[1]}; Resolution: ${this.ElevationResolution}`);

        const bytes = Buffer.byteLength(buffer);
        let offset = 11;
        while (offset < bytes) {
            const tile = new Tileheader(buffer, offset);
            this.Tiles.push(tile);
            offset = tile.BufferOffset + tile.BufferSize;
        }

        logger.log(`Parsed tiles: ${this.Tiles.length}`);
    }
}
