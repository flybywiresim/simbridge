import { GPU } from 'gpu.js';
import { NavigationDisplayParameters } from './interfaces';

function calculateNormalModeGreenThresholds(
    referenceAltitude: number,
    minimumElevation: number,
    flatEarth: number,
    lowerPercentile: number,
    halfElevation: number,
): [number, number] {
    let lowDensityGreen = 0;
    let highDensityGreen = 0;

    if (referenceAltitude - this.constants.normalModeLowDensityGreenOffset <= minimumElevation) {
        lowDensityGreen = minimumElevation + 200;
    } else {
        lowDensityGreen = referenceAltitude - this.constants.normalModeLowDensityGreenOffset;
    }

    if (referenceAltitude - this.constants.normalModeHighDensityGreenOffset <= minimumElevation) {
        highDensityGreen = minimumElevation + 200;
    } else {
        highDensityGreen = referenceAltitude - this.constants.normalModeHighDensityGreenOffset;
    }

    if (flatEarth >= 0) {
        if (halfElevation <= lowerPercentile && lowDensityGreen > halfElevation) {
            lowDensityGreen = halfElevation;
        } else if (halfElevation > lowerPercentile && lowDensityGreen > lowerPercentile) {
            lowDensityGreen = lowerPercentile;
        }
    }

    return [lowDensityGreen, highDensityGreen];
}

function calculateNormalModeWarningThresholds(
    referenceAltitude: number,
    minimumElevation: number,
    gearDownAltitudeOffset: number,
): [number, number, number] {
    let lowDensityYellow = referenceAltitude - gearDownAltitudeOffset;
    const highDensityYellow = referenceAltitude + this.constants.normalModeHighDensityYellowOffset;
    const highDensityRed = referenceAltitude + this.constants.normalModeHighDensityRedOffset;

    if (lowDensityYellow <= minimumElevation) {
        lowDensityYellow = minimumElevation + 200;
    }

    return [lowDensityYellow, highDensityYellow, highDensityRed];
}

function calculatePeaksModeThresholds(
    lowerPercentile: number,
    upperPercentile: number,
    halfElevation: number,
    minimumElevation: number,
    maximumElevation: number,
): [number, number, number] {
    const lowerDensity = Math.min(lowerPercentile, halfElevation);
    let higherDensity = Math.min(upperPercentile, (maximumElevation - minimumElevation) * 0.65 + minimumElevation);
    let solidDensity = (maximumElevation - minimumElevation) * 0.95 + minimumElevation;

    if (lowerDensity >= higherDensity || lowerDensity >= solidDensity || higherDensity >= solidDensity
        || lowerPercentile >= upperPercentile || lowerPercentile >= solidDensity || upperPercentile >= solidDensity
    ) {
        higherDensity = maximumElevation + 100;
        solidDensity = maximumElevation + 100;
    }

    return [lowerDensity, higherDensity, solidDensity];
}

function renderNormalMode(
    elevation: number,
    referenceAltitude: number,
    minimumElevation: number,
    flatEarth: number,
    gearDownAltitudeOffset: number,
    lowerPercentile: number,
    halfElevation: number,
    absoluteCutOffAltitude: number,
): [number, number, number, number] {
    if (elevation !== this.constants.invalidElevation
        && elevation !== this.constants.unknownElevation
        && elevation !== this.constants.waterElevation
        && elevation >= absoluteCutOffAltitude
    ) {
        const greenThresholds = calculateNormalModeGreenThresholds(
            referenceAltitude,
            minimumElevation,
            flatEarth,
            lowerPercentile,
            halfElevation,
        );
        const warningThresholds = calculateNormalModeWarningThresholds(
            referenceAltitude,
            minimumElevation,
            gearDownAltitudeOffset,
        );

        if (elevation >= warningThresholds[2]) {
            // high density
            return [255, 0, 0, 255];
        }
        if (elevation >= warningThresholds[1]) {
            // high density
            return [255, 255, 50, 255];
        }
        if (elevation >= greenThresholds[1] && elevation < warningThresholds[0]) {
            // low density
            return [0, 255, 0, 255];
        }
        if (elevation >= warningThresholds[0] && elevation < warningThresholds[1]) {
            // low density
            return [255, 255, 50, 255];
        }
        if (elevation >= greenThresholds[0] && elevation < greenThresholds[1]) {
            // low density
            return [0, 255, 0, 255];
        }

        return [0, 0, 0, 0];
    }
    if (elevation === this.constants.waterElevation) {
        return [0, 255, 255, 255];
    }
    if (elevation === this.constants.unknownElevation) {
        return [255, 148, 255, 255];
    }

    return [0, 0, 0, 0];
}

function renderPeaksMode(
    elevation: number,
    lowerPercentile: number,
    upperPercentile: number,
    halfElevation: number,
    minimumElevation: number,
    maximumElevation: number,
): [number, number, number, number] {
    if (elevation !== this.constants.invalidElevation
        && elevation !== this.constants.unknownElevation
        && elevation !== this.constants.waterElevation
    ) {
        const thresholds = calculatePeaksModeThresholds(
            lowerPercentile,
            upperPercentile,
            halfElevation,
            minimumElevation,
            maximumElevation,
        );

        if (thresholds[2] <= elevation) {
            // solid threshold
            return [0, 255, 0, 255];
        }
        if (thresholds[1] <= elevation) {
            // high density
            return [0, 255, 0, 255];
        }
        if (thresholds[0] <= elevation) {
            // low density
            return [0, 255, 0, 255];
        }

        return [0, 0, 0, 0];
    }
    if (elevation === this.constants.waterElevation) {
        return [0, 255, 255, 255];
    }
    if (elevation === this.constants.unknownElevation) {
        return [255, 148, 255, 255];
    }

    return [0, 0, 0, 0];
}

/* export function renderNavigationDisplay(
    this: NavigationDisplayParameters,
    elevationMap: number[][],
    width: number,
    altitude: number,
    verticalSpeed: number,
    gearDownAltitudeOffset: number,
    minElevation: number,
    maxElevation: number,
    lowerPercentileElevation: number,
    upperPercentileElevation: number,
    cutOffAltitude: number,
): number {
    // predict 30 seconds -> half of the vertical speed (feet per minute)
    const referenceAltitude = altitude + (verticalSpeed <= -1000 ? verticalSpeed * 0.5 : 0);

    // define some rendering thresholds
    const flatEarth = this.constants.flatEarthThreshold - (maxElevation - minElevation);
    const halfElevation = maxElevation * 0.5;

    const colorChannel = this.thread.x % 4;
    const pixelElevation = elevationMap[this.thread.y][this.thread.x];

    if (maxElevation >= referenceAltitude - gearDownAltitudeOffset) {
        return renderNormalMode(
            pixelElevation,
            referenceAltitude,
            minElevation,
            flatEarth,
            gearDownAltitudeOffset,
            lowerPercentileElevation,
            halfElevation,
            cutOffAltitude,
        )[colorChannel];
    }

    return renderPeaksMode(
        pixelElevation,
        lowerPercentileElevation,
        upperPercentileElevation,
        halfElevation,
        minElevation,
        maxElevation,
    )[colorChannel];
} */

export function renderNavigationDisplay(
    this: NavigationDisplayParameters,
    elevationGrid: number[][],
    histogram: number[],
    width: number,
    altitude: number,
    verticalSpeed: number,
    gearDownAltitudeOffset: number,
    cutOffAltitude: number,
): number {
    // calculate the bin of the cut off altitude
    const cutOffAltitudeBin = Math.floor((cutOffAltitude - this.constants.histogramMinElevation) / this.constants.histogramBinRange);
    // predict 30 seconds -> half of the vertical speed (feet per minute)
    const referenceAltitude = altitude + (verticalSpeed <= -1000 ? verticalSpeed * 0.5 : 0);

    // calculate the total frequency to collect the statistics
    let totalFrequency = 0;
    for (let totalFrequencyBin = cutOffAltitudeBin; totalFrequencyBin < this.constants.histogramBinCount; totalFrequencyBin++) {
        totalFrequency += histogram[totalFrequencyBin];
    }

    let minElevationBin = -1;
    let maxElevationBin = -1;
    let lowerBin = -1;
    let upperBin = -1;

    let currentPercentile = 0;
    for (let bin = cutOffAltitudeBin; bin < this.constants.histogramBinCount; bin++) {
        if (totalFrequency > 0) {
            currentPercentile += histogram[bin] / totalFrequency;
            if (lowerBin === -1 && currentPercentile >= this.constants.lowerPercentile) {
                lowerBin = bin;
            }
            if (upperBin === -1 && currentPercentile >= this.constants.upperPercentile) {
                upperBin = bin;
            }
        }

        if (histogram[bin] > 0) {
            if (minElevationBin < 0) minElevationBin = bin;
            maxElevationBin = bin;
        }
    }

    if (lowerBin > this.constants.histogramBinCount) {
        lowerBin = this.constants.histogramBinCount - 1;
    }
    if (upperBin < 0) {
        upperBin = this.constants.histogramBinCount - 1;
    }
    const lowerPercentileElevation = lowerBin * this.constants.histogramBinRange + this.constants.histogramMinElevation;
    const upperPercentileElevation = upperBin * this.constants.histogramBinRange + this.constants.histogramMinElevation;

    let minElevation = -1;
    if (minElevationBin >= 0) {
        minElevation = minElevationBin * this.constants.histogramBinRange + this.constants.histogramMinElevation;
    }

    let maxElevation = 0;
    if (maxElevationBin >= 0) {
        maxElevation = (maxElevationBin + 1) * this.constants.histogramBinRange + this.constants.histogramMinElevation;
    }

    // define some rendering thresholds
    const flatEarth = this.constants.flatEarthThreshold - (maxElevation - minElevation);
    const halfElevation = maxElevation * 0.5;

    const colorChannel = this.thread.x % 4;
    const pixelElevation = elevationGrid[this.thread.y][Math.ceil(this.thread.x / 4)];

    if (maxElevation >= referenceAltitude - gearDownAltitudeOffset) {
        return renderNormalMode(
            pixelElevation,
            referenceAltitude,
            minElevation,
            flatEarth,
            gearDownAltitudeOffset,
            lowerPercentileElevation,
            halfElevation,
            cutOffAltitude,
        )[colorChannel];
    }

    return renderPeaksMode(
        pixelElevation,
        lowerPercentileElevation,
        upperPercentileElevation,
        halfElevation,
        minElevation,
        maxElevation,
    )[colorChannel];
}

export const registerNavigationDisplayFunctions = (gpu: GPU): void => {
    gpu.addFunction(calculateNormalModeGreenThresholds, {
        argumentTypes: {
            referenceAltitude: 'Float',
            minimumElevation: 'Float',
            flatEarth: 'Number',
            lowerPercentile: 'Float',
            halfElevation: 'Float',
        },
        returnType: 'Array(2)',
    });
    gpu.addFunction(calculateNormalModeWarningThresholds, {
        argumentTypes: {
            referenceAltitude: 'Float',
            minimumElevation: 'Float',
            gearDownAltitudeOffset: 'Number',
        },
        returnType: 'Array(3)',
    });
    gpu.addFunction(calculatePeaksModeThresholds, {
        argumentTypes: {
            lowerPercentile: 'Float',
            upperPercentile: 'Float',
            halfElevation: 'Float',
            minimumElevation: 'Float',
            maximumElevation: 'Float',
        },
        returnType: 'Array(3)',
    });
    gpu.addFunction(renderNormalMode, {
        argumentTypes: {
            elevation: 'Integer',
            referenceAltitude: 'Float',
            minimumElevation: 'Float',
            flatEarth: 'Integer',
            gearDownAltitudeOffset: 'Integer',
            lowerPercentile: 'Float',
            halfElevation: 'Float',
            absoluteCutOffAltitude: 'Float',
        },
        returnType: 'Array(4)',
    });
    gpu.addFunction(renderPeaksMode, {
        argumentTypes: {
            elevation: 'Integer',
            lowerPercentile: 'Float',
            upperPercentile: 'Float',
            halfElevation: 'Float',
            minimumElevation: 'Float',
            maximumElevation: 'Float',
        },
        returnType: 'Array(4)',
    });
};
