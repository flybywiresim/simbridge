import { GPU } from 'gpu.js';
import { HistogramParameters } from './interfaces';

export function createElevationHistogram(
    this: HistogramParameters,
    elevations: number[][],
    width: number,
    height: number,
): number {
    const lowerElevation = this.thread.x * this.constants.binRange + this.constants.minimumElevation;
    const upperElevation = lowerElevation + this.constants.binRange - 1;
    let count: number = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const elevation = elevations[y][x];
            if (elevation !== this.constants.waterElevation && elevation !== this.constants.invalidElevation && elevation !== this.constants.unknownElevation) {
                if (elevation >= lowerElevation && elevation < upperElevation) {
                    count += 1;
                }
            }
        }
    }

    return count;
}

function histogramTotalFrequency(histogram: number[], binCount: number): number {
    let totalFrequency = 0;

    for (let bin = 0; bin < binCount; bin++) {
        totalFrequency += histogram[bin];
    }

    return totalFrequency;
}

export function elevationStatistics(
    histogram: number[],
    binCount: number,
    lowerPercentile: number,
    upperPercentile: number,
    binRange: number,
    minimumElevation: number,
): [number, number, number, number] {
    const totalFrequency = histogramTotalFrequency(histogram, binCount);
    let minElevationBin = -1;
    let maxElevationBin = -1;
    let lowerBin = binCount + 1;
    let upperBin = -1;

    let currentPercentile = 0;
    const factor = 100.0 / totalFrequency;
    for (let bin = 0; bin < binCount; bin++) {
        if (totalFrequency > 0) {
            const ratio = histogram[bin] / totalFrequency;
            currentPercentile += ratio * factor;
            if (currentPercentile >= lowerPercentile) {
                lowerBin = bin;
            }
            if (currentPercentile >= upperPercentile) {
                upperBin = bin;
            }
        }

        if (histogram[bin] > 0) {
            if (minElevationBin < 0) minElevationBin = bin;
            maxElevationBin = bin;
        }
    }

    if (lowerBin > binCount) {
        lowerBin = binCount - 1;
    }
    if (upperBin < 0) {
        upperBin = binCount - 1;
    }

    let minElevation = -1;
    let maxElevation = 0;
    if (minElevationBin >= 0) {
        minElevation = minElevationBin * binRange + minimumElevation;
        maxElevation = maxElevationBin * binRange + minimumElevation;
    }

    return [
        minElevation,
        maxElevation,
        lowerBin * binRange + minimumElevation,
        upperBin * binRange + minimumElevation,
    ];
}

export const registerStatisticsFunctions = (gpu: GPU): void => {
    gpu.addFunction(histogramTotalFrequency, {
        argumentTypes: {
            histogram: 'Array',
            binCount: 'Integer',
        },
        returnType: 'Integer',
    });
    gpu.addFunction(elevationStatistics, {
        argumentTypes: {
            histogram: 'Array',
            binCount: 'Integer',
            lowerPercentile: 'Integer',
            upperPercentile: 'Integer',
            binRange: 'Integer',
            minimumElevation: 'Integer',
        },
        returnType: 'Array(4)',
    });
};
