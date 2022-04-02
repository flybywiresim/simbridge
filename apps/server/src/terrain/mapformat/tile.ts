import { Geodesic } from 'geographiclib';
import { ElevationGrid } from './elevationgrid';
import { Terrainmap } from './terrainmap';
import { QuadtreeNode } from './quadtreenode';

export class Tile {
    private parent: Terrainmap | undefined = undefined;

    private buffer: Buffer | undefined = undefined;

    public Southwest: number[] = [];

    public MinimumElevation: number = 0;

    public BigNodesUsed: boolean = false;

    public NodeCount: number = 0;

    public BufferOffset: number = 0;

    public BufferSize: number = 0;

    constructor(parent: Terrainmap, buffer: Buffer, offset: number) {
        this.parent = parent;
        this.buffer = buffer;

        // extract the tile header
        this.Southwest = [buffer.readInt8(offset), buffer.readInt16LE(offset + 1)];
        this.MinimumElevation = buffer.readInt16LE(offset + 3);
        this.BigNodesUsed = buffer.readUInt8(offset + 5) !== 0;
        this.NodeCount = buffer.readUInt32LE(offset + 6);

        this.BufferOffset = offset + 10;
        this.BufferSize = this.NodeCount * (this.BigNodesUsed ? 3 : 2);
    }

    private readNodes(): QuadtreeNode[] {
        const nodes: QuadtreeNode[] = [];

        for (let bufferOffset = 0; bufferOffset < this.BufferSize; bufferOffset += (this.BigNodesUsed ? 3 : 2)) {
            let address = this.BufferOffset + bufferOffset;
            const level = this.buffer.readUInt8(address);

            address += 1;
            const bin = this.BigNodesUsed ? this.buffer.readUInt16LE(address) : this.buffer.readUInt8(address);

            nodes.push(new QuadtreeNode(level, bin));
        }

        return nodes;
    }

    private calculateElevation(node: QuadtreeNode): number {
        return (this.MinimumElevation + node.ElevationBin * this.parent.ElevationResolution) * 3.28084;
    }

    private fillGrid(xStart: number, yStart: number, xSize: number, ySize: number, grid: ElevationGrid, node: QuadtreeNode): void {
        if (xStart + xSize >= grid.Columns) {
            xSize -= (xStart + xSize) - grid.Columns;
        }
        if (yStart + ySize >= grid.Rows) {
            ySize -= (yStart + ySize) - grid.Rows;
        }

        const elevation = this.calculateElevation(node);
        for (let y = 0; y < ySize; ++y) {
            for (let x = 0; x < xSize; ++x) {
                grid.Grid[y + yStart][x + xStart] = elevation;
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

    private processQuadtreeNode(nodes: QuadtreeNode[], index: number, xStart: number, yStart: number, xSize: number, ySize: number, level: number, grid: ElevationGrid): number {
        let leafCount = 0;

        while (leafCount !== 4) {
            const newArea = this.calculatePositionAndSize(leafCount, xStart, yStart, xSize, ySize);

            if (index + 1 >= nodes.length) {
                if (leafCount !== 0 || nodes[index].TreeLevel === level) {
                    this.fillGrid(newArea.xStart, newArea.yStart, newArea.xSize, newArea.ySize, grid, nodes[index]);
                } else {
                    this.fillGrid(xStart, yStart, xSize, ySize, grid, nodes[index]);
                }
                return index;
            }

            if (nodes[index].TreeLevel <= level) {
                if (leafCount !== 0 || nodes[index].TreeLevel === level) {
                    this.fillGrid(newArea.xStart, newArea.yStart, newArea.xSize, newArea.ySize, grid, nodes[index]);
                } else {
                    this.fillGrid(xStart, yStart, xSize, ySize, grid, nodes[index]);
                }
                leafCount += 1;
                index += 1;
            } else {
                index = this.processQuadtreeNode(nodes, index + 1, newArea.xStart, newArea.yStart, newArea.xSize, newArea.ySize, level + 1, grid);
                leafCount += 1;
            }
        }

        return index;
    }

    private createGrid(grid: ElevationGrid): void {
        const nodes = this.readNodes();
        if (nodes.length === 1) {
            this.fillGrid(0, 0, grid.Columns, grid.Rows, grid, nodes[0]);
        } else {
            this.processQuadtreeNode(nodes, 1, 0, 0, grid.Columns, grid.Rows, 1, grid);
        }
    }

    public gridDimension(): { width: number, height: number} {
        const rows = Math.round(Geodesic.WGS84.Inverse(this.Southwest[0], this.Southwest[1], this.Southwest[0] + this.parent.AngularSteps[0], this.Southwest[1]).s12 / 50);
        const cols = Math.round(Geodesic.WGS84.Inverse(this.Southwest[0], this.Southwest[1], this.Southwest[0], this.Southwest[1] + this.parent.AngularSteps[1]).s12 / 50);
        return { width: rows, height: cols };
    }

    public elevationGrid(): ElevationGrid {
        const { width, height } = this.gridDimension();
        const grid = Array.from({ length: width }, (_) => Array.from({ length: height }, (_) => 0));

        const retval = new ElevationGrid(width, height, grid);
        this.createGrid(retval);

        return retval;
    }
}
