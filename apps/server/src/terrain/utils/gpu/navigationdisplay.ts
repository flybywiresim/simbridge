import { GPU } from 'gpu.js';
import { distanceWgs84 } from './helper';
import { NavigationDisplayParameters } from './interfaces';
import { elevationStatistics, maximumElevation } from './statistics';

const FeetPerNauticalMile = 6076.12;
const ThreeNauticalMilesInFeet = 18228.3;

function calculateAbsoluteCutOffAltitude(
    latitude: number,
    longitude: number,
    altitude: number,
    destinationLatitude: number,
    destinationLongitude: number,
    destinationElevation: number,
    cutOffAltitudeMinimimum: number,
    cutOffAltitudeMaximum: number,
    invalidElevation: number,
): number {
    if (destinationElevation !== invalidElevation) {
        let cutOffAltitude = cutOffAltitudeMaximum;

        const distance = distanceWgs84(latitude, longitude, destinationLatitude, destinationLongitude);
        if (distance <= this.constants.maxAirportDistance) {
            const distanceFeet = distance * FeetPerNauticalMile;

            // calculate the glide until touchdown
            const opposite = altitude - destinationElevation;
            let glideRadian = 0.0;
            if (opposite > 0 && distance > 0) {
                // calculate the glide slope, opposite [ft] -> distance needs to be converted to feet
                glideRadian = Math.atan(opposite / distanceFeet);
            }

            // check if the glide is greater or equal 3°
            if (glideRadian < 0.0523599) {
                if (distance <= 1.0 || glideRadian === 0.0) {
                    // use the minimum value close to the airport
                    cutOffAltitude = cutOffAltitudeMinimimum;
                } else {
                    // use a linear model from max to min for 4 nm to 1 nm
                    const slope = (cutOffAltitudeMinimimum - cutOffAltitudeMaximum) / ThreeNauticalMilesInFeet;
                    cutOffAltitude = Math.round(slope * (distanceFeet - FeetPerNauticalMile) + cutOffAltitudeMaximum);

                    // ensure that we are not below the minimum and not above the maximum
                    cutOffAltitude = Math.max(cutOffAltitude, cutOffAltitudeMinimimum);
                    cutOffAltitude = Math.min(cutOffAltitude, cutOffAltitudeMaximum);
                }
            }
        }

        return cutOffAltitude;
    }

    return this.constants.histogramMinimumElevation;
}

export function renderNavigationDisplay(
    this: NavigationDisplayParameters,
    elevationMap: number[][],
    width: number,
    height: number,
    histogram: number[],
    latitude: number,
    longitude: number,
    altitude: number,
    verticalSpeed: number,
    gearDown: number,
    destinationLatitude: number,
    destinationLongitude: number,
    destinationElevation: number,
    cutOffAltitudeMinimimum: number,
    cutOffAltitudeMaximum: number,
): void {
    // predict 30 seconds -> half of the vertical speed (feet per minute)
    const referenceAltitude = altitude + (verticalSpeed <= -1000 ? verticalSpeed * 0.5 : 0);
    const maxElevation = maximumElevation(histogram);

    // define the rendering mode
    const normalMode = maxElevation >= referenceAltitude - (gearDown ? 250 : 500);

    // define the cut-off altitude
    let cutOffAltitude = this.constants.histogramMinimumElevation;
    if (normalMode) {
        cutOffAltitude = calculateAbsoluteCutOffAltitude(
            latitude,
            longitude,
            altitude,
            destinationLatitude,
            destinationLongitude,
            destinationElevation,
            cutOffAltitudeMinimimum,
            cutOffAltitudeMaximum,
            this.constants.invalidElevation,
        );
    }

    // calculate the statistics with a safety margin and filter it based on the ACOA
    let [minElevation, lowerPercentile, upperPercentile] = elevationStatistics(
        histogram,
        cutOffAltitude,
    );
    upperPercentile += this.constants.histogramBinRange - 1;

    // define some rendering thresholds
    const flatEarth = maxElevation - minElevation <= this.constants.flatEarthThreshold;
    const halfElevation = maxElevation * 0.5;
}

export const registerNavigationDisplayFunctions = (gpu: GPU): void => {
    gpu.addFunction(calculateAbsoluteCutOffAltitude, {
        argumentTypes: {
            latitude: 'Float',
            longitude: 'Float',
            altitude: 'Float',
            destinationLatitude: 'Float',
            destinationLongitude: 'Float',
            destinationElevation: 'Integer',
            cutOffAltitudeMinimimum: 'Integer',
            cutOffAltitudeMaximum: 'Integer',
            minimumElevation: 'Integer',
            invalidElevation: 'Integer',
        },
        returnType: 'Float',
    });
};
