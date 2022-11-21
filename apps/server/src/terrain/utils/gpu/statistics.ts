import { HistogramParameters } from './interfaces';

export function createLocalElevationHistogram(
    this: HistogramParameters,
    elevations: number[][],
    width: number,
    height: number,
): number {
    // get the patch
    const threadsInX = Math.floor(width / this.constants.patchSize);
    const row = Math.ceil(this.thread.y / threadsInX);
    const column = this.thread.y % threadsInX;

    // get the patch borders
    const xStart = column * this.constants.patchSize;
    const xEnd = Math.min(width, xStart + this.constants.patchSize);
    const yStart = row * this.constants.patchSize;
    const yEnd = Math.min(height, yStart + this.constants.patchSize);

    // create the local histogram
    let occurance = 0;
    for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
            const elevation = elevations[y][x] - this.constants.minimumElevation;
            const bin = Math.max(Math.min(Math.ceil(elevation / this.constants.binRange), this.constants.binCount), 0);

            if (bin === this.thread.x) {
                occurance += 1;
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
