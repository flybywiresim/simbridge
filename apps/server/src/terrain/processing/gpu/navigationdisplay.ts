import { GPU } from 'gpu.js';
import { drawHighDensityPixel } from './highdensitypixel';
import { drawLowDensityPixel } from './lowdensitypixel';
import { drawWaterDensityPixel } from './waterpixel';
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
    pixelX: number,
    pixelY: number,
    height: number,
    centerCoordinateX: number,
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
        const warningThresholds = calculateNormalModeWarningThresholds(
            referenceAltitude,
            minimumElevation,
            gearDownAltitudeOffset,
        );
        const greenThresholds = calculateNormalModeGreenThresholds(
            referenceAltitude,
            minimumElevation,
            flatEarth,
            lowerPercentile,
            halfElevation,
        );

        if (elevation >= warningThresholds[2]) {
            return drawHighDensityPixel([255, 0, 0, 255], pixelX, pixelY, centerCoordinateX);
        }
        if (elevation >= warningThresholds[1]) {
            return drawHighDensityPixel([255, 255, 50, 255], pixelX, pixelY, centerCoordinateX);
        }
        if (elevation >= greenThresholds[1] && elevation < warningThresholds[0]) {
            return drawHighDensityPixel([0, 255, 0, 255], pixelX, pixelY, centerCoordinateX);
        }
        if (elevation >= warningThresholds[0] && elevation < warningThresholds[1]) {
            return drawLowDensityPixel([255, 255, 50, 255], pixelX, pixelY, centerCoordinateX);
        }
        if (elevation >= greenThresholds[0] && elevation < greenThresholds[1]) {
            return drawLowDensityPixel([0, 255, 0, 255], pixelX, pixelY, centerCoordinateX);
        }

        return [0, 0, 0, 0];
    }
    if (elevation === this.constants.waterElevation) {
        return drawWaterDensityPixel([0, 255, 255, 255], pixelX, pixelY, height, centerCoordinateX);
    }
    if (elevation === this.constants.unknownElevation) {
        return drawHighDensityPixel([255, 148, 255, 255], pixelX, pixelY, centerCoordinateX);
    }

    return [0, 0, 0, 0];
}

function renderPeaksMode(
    elevation: number,
    pixelX: number,
    pixelY: number,
    height: number,
    centerCoordinateX: number,
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
            return drawHighDensityPixel([0, 255, 0, 255], pixelX, pixelY, centerCoordinateX);
        }
        if (thresholds[0] <= elevation) {
            return drawLowDensityPixel([0, 255, 0, 255], pixelX, pixelY, centerCoordinateX);
        }

        return [0, 0, 0, 0];
    }
    if (elevation === this.constants.waterElevation) {
        return drawWaterDensityPixel([0, 255, 255, 255], pixelX, pixelY, height, centerCoordinateX);
    }
    if (elevation === this.constants.unknownElevation) {
        return drawHighDensityPixel([255, 148, 255, 255], pixelX, pixelY, centerCoordinateX);
    }

    return [0, 0, 0, 0];
}

export function renderNavigationDisplay(
    this: NavigationDisplayParameters,
    elevationGrid: number[][],
    histogram: number[],
    width: number,
    height: number,
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

    const centerCoordinateX = width / 2;
    const pixelX = Math.floor(this.thread.x / 4);
    const colorChannel = this.thread.x % 4;
    const pixelElevation = elevationGrid[this.thread.y][pixelX];

    if (maxElevation >= referenceAltitude - gearDownAltitudeOffset) {
        return renderNormalMode(
            pixelElevation,
            pixelX,
            this.thread.y,
            height,
            centerCoordinateX,
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
        pixelX,
        this.thread.y,
        height,
        centerCoordinateX,
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
    gpu.addFunction(drawLowDensityPixel, {
        argumentTypes: {
            color: 'Array(4)',
            pixelX: 'Integer',
            pixelY: 'Integer',
            centerCoordinateX: 'Float',
        },
        returnType: 'Array(4)',
    });
    gpu.addFunction(drawHighDensityPixel, {
        argumentTypes: {
            color: 'Array(4)',
            pixelX: 'Integer',
            pixelY: 'Integer',
            centerCoordinateX: 'Float',
        },
        returnType: 'Array(4)',
    });
    gpu.addFunction(drawWaterDensityPixel, {
        argumentTypes: {
            color: 'Array(4)',
            pixelX: 'Integer',
            pixelY: 'Integer',
            height: 'Integer',
            centerCoordinateX: 'Float',
        },
        returnType: 'Array(4)',
    });
    gpu.addFunction(renderNormalMode, {
        argumentTypes: {
            elevation: 'Integer',
            pixelX: 'Integer',
            pixelY: 'Integer',
            height: 'Integer',
            centerCoordinateX: 'Float',
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
            pixelX: 'Integer',
            pixelY: 'Integer',
            height: 'Integer',
            centerCoordinateX: 'Float',
            lowerPercentile: 'Float',
            upperPercentile: 'Float',
            halfElevation: 'Float',
            minimumElevation: 'Float',
            maximumElevation: 'Float',
        },
        returnType: 'Array(4)',
    });
};
