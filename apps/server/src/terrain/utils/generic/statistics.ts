import { distanceWgs84 } from './helper';

export function calculateAbsoluteCutOffAltitude(
    latitude: number,
    longitude: number,
    altitude: number,
    destinationLatitude: number | undefined,
    destinationLongitude: number | undefined,
    destinationElevation: number,
    maxAirportDistance: number,
    histogramMinimumElevation: number,
    cutOffAltitudeMinimimum: number | undefined,
    cutOffAltitudeMaximum: number | undefined,
    invalidElevation: number,
): number {
    if (destinationLatitude === undefined
        || destinationLongitude === undefined
        || cutOffAltitudeMinimimum === undefined
        || cutOffAltitudeMaximum === undefined
    ) {
        return histogramMinimumElevation;
    }

    const FeetPerNauticalMile = 6076.12;
    const ThreeNauticalMilesInFeet = 18228.3;

    if (destinationElevation !== invalidElevation) {
        let cutOffAltitude = cutOffAltitudeMaximum;

        const distance = distanceWgs84(latitude, longitude, destinationLatitude, destinationLongitude);
        if (distance <= maxAirportDistance) {
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

    return histogramMinimumElevation;
}
