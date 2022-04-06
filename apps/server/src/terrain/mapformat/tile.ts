import { Geodesic } from 'geographiclib';
import { ElevationGrid } from './elevationgrid';
import { Terrainmap } from './terrainmap';
import { QuadtreeNode } from './quadtreenode';

export class Tile {
    private parent: Terrainmap | undefined = undefined;

    private buffer: SharedArrayBuffer | undefined = undefined;

    public Southwest: { latitude: number, longitude: number } = { latitude: 0, longitude: 0 };

    public MinimumElevation: number = 0;

    public BigNodesUsed: boolean = false;

    public NodeCount: number = 0;

    public BufferOffset: number = 0;

    public BufferSize: number = 0;

    constructor(parent: Terrainmap, buffer: SharedArrayBuffer, offset: number) {
        const arrBuffer = Buffer.from(buffer);

        this.parent = parent;
        this.buffer = buffer;

        // extract the tile header
        this.Southwest.latitude = arrBuffer.readInt8(offset);
        this.Southwest.longitude = arrBuffer.readInt16LE(offset + 1);
        this.MinimumElevation = arrBuffer.readInt16LE(offset + 3);
        this.BigNodesUsed = arrBuffer.readUInt8(offset + 5) !== 0;
        this.NodeCount = arrBuffer.readUInt32LE(offset + 6);

        this.BufferOffset = offset + 10;
        this.BufferSize = this.NodeCount * (this.BigNodesUsed ? 3 : 2);
    }

    private readNodes(): QuadtreeNode[] {
        const arrBuffer = Buffer.from(this.buffer);
        const nodes: QuadtreeNode[] = [];

        for (let bufferOffset = 0; bufferOffset < this.BufferSize; bufferOffset += (this.BigNodesUsed ? 3 : 2)) {
            let address = this.BufferOffset + bufferOffset;
            const level = arrBuffer.readUInt8(address);

            address += 1;
            const bin = this.BigNodesUsed ? arrBuffer.readUInt16LE(address) : arrBuffer.readUInt8(address);

            nodes.push(new QuadtreeNode(level, bin));
        }

        return nodes;
    }

    private calculateElevation(node: QuadtreeNode): number {
        return Math.round((this.MinimumElevation + node.ElevationBin * this.parent.ElevationResolution) * 3.28084);
    }

    private fillGrid(xStart: number, yStart: number, xSize: number, ySize: number, grid: ElevationGrid, array: Int32Array, node: QuadtreeNode): void {
        if (xStart + xSize >= grid.Columns) {
            xSize -= (xStart + xSize) - grid.Columns;
        }
        if (yStart + ySize >= grid.Rows) {
            ySize -= (yStart + ySize) - grid.Rows;
        }

        const elevation = this.calculateElevation(node);
        for (let y = 0; y < ySize; ++y) {
            for (let x = 0; x < xSize; ++x) {
                array[(y + yStart) * grid.Columns + x + xStart] = elevation;
            }
        }
    }

    private calculatePositionAndSize(leafCount: number, xStart: number, yStart: number, xSize: number, ySize: number): { xStart: number, yStart: number, xSize: number, ySize: number } {
        const retval = {
            xStart,
            yStart,
            xSize: 0,
            ySize: 0,
        };

        // calculate the new size
        retval.xSize = Math.round(xSize * 0.5);
        retval.ySize = Math.round(ySize * 0.5);

        // update the position
        if (leafCount === 1) {
            retval.xStart += retval.xSize;
        } else if (leafCount === 2) {
            retval.yStart += retval.ySize;
        } else if (leafCount === 3) {
            retval.xStart += retval.xSize;
            retval.yStart += retval.ySize;
        }

        return retval;
    }

    private processQuadtreeNode(nodes: QuadtreeNode[], index: number, xStart: number, yStart: number, xSize: number, ySize: number, level: number, grid: ElevationGrid,
        array: Int32Array): number {
        let leafCount = 0;

        while (leafCount !== 4) {
            const newArea = this.calculatePositionAndSize(leafCount, xStart, yStart, xSize, ySize);

            if (index + 1 >= nodes.length) {
                if (leafCount !== 0) {
                    this.fillGrid(newArea.xStart, newArea.yStart, newArea.xSize, newArea.ySize, grid, array, nodes[index]);
                } else {
                    this.fillGrid(xStart, yStart, xSize, ySize, grid, array, nodes[index]);
                }
                return index;
            }

            if (nodes[index + 1].TreeLevel <= level) {
                if (leafCount !== 0 || nodes[index + 1].TreeLevel === level) {
                    this.fillGrid(newArea.xStart, newArea.yStart, newArea.xSize, newArea.ySize, grid, array, nodes[index]);
                } else {
                    this.fillGrid(xStart, yStart, xSize, ySize, grid, array, nodes[index]);
                }
                leafCount += 1;
                index += 1;
            } else {
                index = this.processQuadtreeNode(nodes, index + 1, newArea.xStart, newArea.yStart, newArea.xSize, newArea.ySize, level + 1, grid, array);
                leafCount += 1;
            }
        }

        return index;
    }

    private createGrid(grid: ElevationGrid): void {
        const array = new Int32Array(grid.Grid);
        const nodes = this.readNodes();

        if (nodes.length === 1) {
            this.fillGrid(0, 0, grid.Columns, grid.Rows, grid, array, nodes[0]);
        } else {
            this.processQuadtreeNode(nodes, 1, 0, 0, grid.Columns, grid.Rows, 1, grid, array);
        }
    }

    public gridDimension(): { width: number, height: number} {
        const rows = Math.round(Geodesic.WGS84.Inverse(this.Southwest.latitude, this.Southwest.longitude,
            this.Southwest.latitude + this.parent.AngularSteps.latitude, this.Southwest.longitude).s12 / 50);
        const cols = Math.round(Geodesic.WGS84.Inverse(this.Southwest.latitude, this.Southwest.longitude,
            this.Southwest.latitude, this.Southwest.longitude + this.parent.AngularSteps.longitude).s12 / 50);
        return { width: rows, height: cols };
    }

    public elevationGrid(): ElevationGrid {
        const { width, height } = this.gridDimension();

        const northeast = { latitude: this.Southwest.latitude + this.parent.AngularSteps.latitude, longitude: this.Southwest.longitude + this.parent.AngularSteps.longitude };
        const retval = new ElevationGrid(this.Southwest, northeast, width, height);
        this.createGrid(retval);

        return retval;
    }
}
