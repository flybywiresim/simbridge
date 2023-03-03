import { HistogramParameters } from './interfaces';

export function createLocalElevationHistogram(
    this: HistogramParameters,
    elevations: number[][],
    width: number,
    height: number,
): number {
    // get the patch
    const patchesInX = Math.ceil(width / this.constants.patchSize);
    const patchY = Math.floor(this.thread.y / patchesInX);
    const patchX = this.thread.y % patchesInX;

    // get the patch borders
    const xStart = patchX * this.constants.patchSize;
    const xEnd = Math.min(width, xStart + this.constants.patchSize);
    const yStart = patchY * this.constants.patchSize;
    const yEnd = Math.min(height, yStart + this.constants.patchSize);

    // create the local histogram
    let occurance = 0;
    for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
            let elevation = elevations[y][x];
            if (elevation !== this.constants.unknownElevation && elevation !== this.constants.invalidElevation && elevation !== this.constants.waterElevation) {
                elevation -= this.constants.minimumElevation;
                const bin = Math.max(Math.min(Math.ceil(elevation / this.constants.binRange), this.constants.binCount), 0);

                if (bin === this.thread.x) {
                    occurance += 1;
                }
            }
        }
    }

    return occurance;
}

export function createElevationHistogram(
    localHistograms: number[][],
    patchCount: number,
): number {
    let occurance = 0;
    for (let i = 0; i < patchCount; i++) {
        occurance += localHistograms[i][this.thread.x];
    }
    return occurance;
}
