export class QuadtreeNode {
    public TreeLevel: number = 0;

    public ElevationBin: number = 0;

    constructor(level: number, bin: number) {
        this.TreeLevel = level;
        this.ElevationBin = bin;
    }
}
