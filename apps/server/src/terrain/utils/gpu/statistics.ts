import { GPU } from 'gpu.js';
import { HistogramParameters } from './interfaces';

export function createElevationHistogram(
    this: HistogramParameters,
    elevations: number[],
    size: number,
): number {
    const lowerElevation = this.thread.x * this.constants.binRange + this.constants.minimumElevation;
    const upperElevation = lowerElevation + this.constants.binRange;
    let count: number = 0;

    for (let i = 0; i < size; i++) {
        const elevation = elevations[i];
        if (elevation !== this.constants.waterElevation && elevation !== this.constants.invalidElevation && elevation !== this.constants.unknownElevation) {
            if (elevation >= lowerElevation && elevation < upperElevation) {
                count += 1;
            }
        }
    }

    return count;
}

function histogramTotalFrequency(histogram: number[], binCount: number, cutOffAltitudeBin: number): number {
    let totalFrequency = 0;

    for (let bin = cutOffAltitudeBin; bin < binCount; bin++) {
        totalFrequency += histogram[bin];
    }

    return totalFrequency;
}

export function maximumElevation(histogram: number[]) {
    let elevationBin = 0;

    for (let bin = 0; bin < this.constants.histogramBinCount; bin++) {
        if (histogram[bin] > 0) {
            elevationBin = bin;
        }
    }

    // use the worst case of the bin -> next bin - 1
    elevationBin += 1;

    return elevationBin * this.constants.histogramBinRange + this.constants.histogramMinimumElevation - 1;
}

export function elevationStatistics(
    histogram: number[],
    cutOffAltitude: number,
): [number, number, number] {
    const cutOffAltitudeBin = Math.floor((cutOffAltitude - this.constants.histogramMinimumElevation) / this.constants.histogramBinRange);
    const totalFrequency = histogramTotalFrequency(histogram, this.constants.histogramBinCount, cutOffAltitudeBin);
    let minElevationBin = -1;
    let lowerBin = this.constants.histogramBinCount + 1;
    let upperBin = -1;

    let currentPercentile = 0;
    const factor = 100.0 / totalFrequency;
    for (let bin = cutOffAltitudeBin; bin < this.constants.histogramBinCount; bin++) {
        if (totalFrequency > 0) {
            const ratio = histogram[bin] / totalFrequency;
            currentPercentile += ratio * factor;
            if (currentPercentile >= this.constants.lowerPercentile) {
                lowerBin = bin;
            }
            if (currentPercentile >= this.constants.upperPercentile) {
                upperBin = bin;
            }
        }

        if (histogram[bin] > 0) {
            if (minElevationBin < 0) minElevationBin = bin;
        }
    }

    if (lowerBin > this.constants.histogramBinCount) {
        lowerBin = this.constants.histogramBinCount - 1;
    }
    if (upperBin < 0) {
        upperBin = this.constants.histogramBinCount - 1;
    }

    let minElevation = -1;
    if (minElevationBin >= 0) {
        minElevation = minElevationBin * this.constants.histogramBinRange + this.constants.histogramMinimumElevation;
    }

    return [
        minElevation,
        lowerBin * this.constants.histogramBinRange + this.constants.histogramMinimumElevation,
        upperBin * this.constants.histogramBinRange + this.constants.histogramMinimumElevation,
    ];
}

export const registerStatisticsFunctions = (gpu: GPU): void => {
    gpu.addFunction(histogramTotalFrequency, {
        argumentTypes: {
            histogram: 'Array',
            binCount: 'Integer',
            cutOffAltitudeBin: 'Integer',
        },
        returnType: 'Integer',
    });
    gpu.addFunction(maximumElevation, {
        argumentTypes: { histogram: 'Array' },
        returnType: 'Integer',
    });
    gpu.addFunction(elevationStatistics, {
        argumentTypes: {
            histogram: 'Array',
            cutOffAltitude: 'Float',
        },
        returnType: 'Array(3)',
    });
};
