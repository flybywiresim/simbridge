// import { GPU } from 'gpu.js';
import { a32nxDrawHighDensityPixel } from './highdensitypixel';
import { a32nxDrawLowDensityPixel } from './lowdensitypixel';
import { a32nxDrawWaterDensityPixel } from './waterpixel';
import { NavigationDisplayParameters } from '../interfaces';

export function a32nxCalculateNormalModeGreenThresholds(
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

export function a32nxCalculateNormalModeWarningThresholds(
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

export function a32nxCalculatePeaksModeThresholds(
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

export function a32nxRenderNormalMode(
    elevation: number,
    pixelX: number,
    pixelY: number,
    height: number,
    centerCoordinateX: number,
    referenceAltitude: number,
    minimumElevation: number,
    maximumElevation: number,
    flatEarth: number,
    gearDownAltitudeOffset: number,
    lowerPercentile: number,
    halfElevation: number,
    absoluteCutOffAltitude: number,
): [number, number, number] {
    const warningThresholds = a32nxCalculateNormalModeWarningThresholds(
        referenceAltitude,
        minimumElevation,
        gearDownAltitudeOffset,
    );
    const greenThresholds = a32nxCalculateNormalModeGreenThresholds(
        referenceAltitude,
        minimumElevation,
        flatEarth,
        lowerPercentile,
        halfElevation,
    );

    // store statistics in the last row as some metadata
    if (this.thread.y >= height) {
        /*
         * Content pixel 0:
         *  - R: rendering mode
         *  - G: minimum elevation
         *  - B: maximum elevation
         *
         * Content pixel 1:
         *  - R: high density red threshold
         *  - G: high density yellow
         *  - B: low density yellow
         *
         * Content pixel 2:
         *  - R: high density green
         *  - G: low density green
         */
        if (this.thread.x < 3) {
            return [0, minimumElevation, maximumElevation];
        }
        if (this.thread.x < 6) {
            return [warningThresholds[2], warningThresholds[1], warningThresholds[0]];
        }
        if (this.thread.x < 9) {
            return [greenThresholds[1], greenThresholds[0], 0];
        }
        return [0, 0, 0];
    }

    if (elevation !== this.constants.invalidElevation
        && elevation !== this.constants.unknownElevation
        && elevation !== this.constants.waterElevation
        && elevation >= absoluteCutOffAltitude
    ) {
        if (elevation >= warningThresholds[2]) {
            return a32nxDrawHighDensityPixel([255, 0, 0], pixelX, pixelY, centerCoordinateX);
        }
        if (elevation >= warningThresholds[1]) {
            return a32nxDrawHighDensityPixel([255, 255, 50], pixelX, pixelY, centerCoordinateX);
        }
        if (elevation >= greenThresholds[1] && elevation < warningThresholds[0]) {
            return a32nxDrawHighDensityPixel([0, 255, 0], pixelX, pixelY, centerCoordinateX);
        }
        if (elevation >= warningThresholds[0] && elevation < warningThresholds[1]) {
            return a32nxDrawLowDensityPixel([255, 255, 50], pixelX, pixelY, centerCoordinateX);
        }
        if (elevation >= greenThresholds[0] && elevation < greenThresholds[1]) {
            return a32nxDrawLowDensityPixel([0, 255, 0], pixelX, pixelY, centerCoordinateX);
        }

        return [4, 4, 5];
    }
    if (elevation === this.constants.waterElevation) {
        return a32nxDrawWaterDensityPixel([0, 255, 255], pixelX, pixelY, height, centerCoordinateX);
    }
    if (elevation === this.constants.unknownElevation) {
        return a32nxDrawHighDensityPixel([255, 148, 255], pixelX, pixelY, centerCoordinateX);
    }

    return [4, 4, 5];
}

export function a32nxRenderPeaksMode(
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
): [number, number, number] {
    const thresholds = a32nxCalculatePeaksModeThresholds(
        lowerPercentile,
        upperPercentile,
        halfElevation,
        minimumElevation,
        maximumElevation,
    );

    // store statistics in the last row as some metadata
    if (this.thread.y >= height) {
        /*
         * Content pixel 0:
         *  - R: rendering mode
         *  - G: minimum elevation
         *  - B: maximum elevation
         *
         * Content pixel 1:
         *  - R: solid green threshold
         *  - G: high density green
         *  - B: low density green
         */
        if (this.thread.x < 3) {
            return [1, minimumElevation, maximumElevation];
        }
        if (this.thread.x < 6) {
            return [thresholds[2], thresholds[1], thresholds[0]];
        }
        return [0, 0, 0];
    }

    if (elevation !== this.constants.invalidElevation
        && elevation !== this.constants.unknownElevation
        && elevation !== this.constants.waterElevation
    ) {
        if (thresholds[2] <= elevation) {
            // solid threshold
            return [0, 255, 0];
        }
        if (thresholds[1] <= elevation) {
            return a32nxDrawHighDensityPixel([0, 255, 0], pixelX, pixelY, centerCoordinateX);
        }
        if (thresholds[0] <= elevation) {
            return a32nxDrawLowDensityPixel([0, 255, 0], pixelX, pixelY, centerCoordinateX);
        }

        return [4, 4, 5];
    }
    if (elevation === this.constants.waterElevation) {
        return a32nxDrawWaterDensityPixel([0, 255, 255], pixelX, pixelY, height, centerCoordinateX);
    }
    if (elevation === this.constants.unknownElevation) {
        return a32nxDrawHighDensityPixel([255, 148, 255], pixelX, pixelY, centerCoordinateX);
    }

    return [4, 4, 5];
}

export function a32nxRenderNavigationDisplay(
    this: NavigationDisplayParameters,
    elevationGrid: number[][],
    histogram: number[],
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

    const centerCoordinateX = this.constants.screenWidth / 2;
    const pixelX = Math.floor(this.thread.x / 3);
    const colorChannel = this.thread.x % 3;
    let pixelElevation = 0;

    // fallback for metadata block
    if (this.thread.y < height) {
        pixelElevation = elevationGrid[this.thread.y][pixelX];
    }

    if (maxElevation >= referenceAltitude - gearDownAltitudeOffset) {
        return a32nxRenderNormalMode(
            pixelElevation,
            pixelX,
            this.thread.y,
            height,
            centerCoordinateX,
            referenceAltitude,
            minElevation,
            maxElevation,
            flatEarth,
            gearDownAltitudeOffset,
            lowerPercentileElevation,
            halfElevation,
            cutOffAltitude,
        )[colorChannel];
    }

    return a32nxRenderPeaksMode(
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
