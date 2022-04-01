import { Logger } from '@nestjs/common';

export class Tileheader {
    public Southwest: number[] = [];

    public MinimumElevation: number = 0;

    public BigNodesUsed: boolean = false;

    public NodeCount: number = 0;

    public BufferOffset: number = 0;

    public BufferSize: number = 0;

    constructor(buffer: Buffer, offset: number) {
        // extract the tile header
        this.Southwest = [buffer.readInt8(offset), buffer.readInt16LE(offset + 1)];
        this.MinimumElevation = buffer.readInt16LE(offset + 3);
        this.BigNodesUsed = buffer.readUInt8(offset + 5) !== 0;
        this.NodeCount = buffer.readUInt32LE(offset + 6);

        this.BufferOffset = offset + 10;
        this.BufferSize = this.NodeCount * (this.BigNodesUsed ? 3 : 2);
    }
}
