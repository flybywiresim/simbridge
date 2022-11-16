// import { extractElevation } from './elevationmap';
import { NavigationDisplayParameters } from './interfaces';
import { elevationStatistics } from './statistics';

export function renderNavigationDisplay(
    this: NavigationDisplayParameters,
    elevationMap: number[][],
    width: number,
    height: number,
    histogram: number[],
    altitude: number,
    verticalSpeed: number,
    gearDown: number,
    destinationLatitude: number,
    destinationLongitude: number,
): void {
    let [minElevation, maxElevation, lowerPercentile, upperPercentile] = elevationStatistics(
        histogram,
        this.constants.histogramBinCount,
        this.constants.lowerPercentile,
        this.constants.upperPercentile,
        this.constants.histogramBinRange,
        this.constants.histogramMinimumElevation,
    );

    // predict 30 seconds -> half of the vertical speed (feet per minute)
    const referenceAltitude = altitude + (verticalSpeed <= -1000 ? verticalSpeed * 0.5 : 0);

    // use the upper border of the thresholds to ensure worst case visualization
    upperPercentile += this.constants.histogramBinRange - 1;

    // define some rendering thresholds
    const flatEarth = maxElevation - minElevation <= this.constants.flatEarthThreshold;
    const halfElevation = maxElevation * 0.5;

    // define the rendering mode
    const normalMode = maxElevation >= referenceAltitude - (gearDown ? 250 : 500);
}
