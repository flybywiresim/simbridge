import { NavigationDisplayParameters } from '../interfaces';

export function calculateNormalModeGreenThresholds(
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

export function calculateNormalModeWarningThresholds(
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

export function calculatePeaksModeThresholds(
  lowerPercentile: number,
  upperPercentile: number,
  halfElevation: number,
  minimumElevation: number,
  maximumElevation: number,
): [number, number, number] {
  const lowerDensity = Math.min(lowerPercentile, halfElevation);
  let higherDensity = Math.min(upperPercentile, (maximumElevation - minimumElevation) * 0.65 + minimumElevation);
  let solidDensity = (maximumElevation - minimumElevation) * 0.95 + minimumElevation;

  if (
    lowerDensity >= higherDensity ||
    lowerDensity >= solidDensity ||
    higherDensity >= solidDensity ||
    lowerPercentile >= upperPercentile ||
    lowerPercentile >= solidDensity ||
    upperPercentile >= solidDensity
  ) {
    higherDensity = maximumElevation + 100;
    solidDensity = maximumElevation + 100;
  }

  return [lowerDensity, higherDensity, solidDensity];
}

export function drawDensityPixel(
  patternValue: number,
  patternIndex: number,
  color: [number, number, number, number],
): [number, number, number, number] {
  if (Math.round(patternValue % patternIndex) === 0) {
    return color;
  }
  return [4, 4, 5, 0];
}

export function renderNormalMode(
  elevation: number,
  patternMapValue: number,
  height: number,
  referenceAltitude: number,
  minimumElevation: number,
  maximumElevation: number,
  flatEarth: number,
  gearDownAltitudeOffset: number,
  lowerPercentile: number,
  halfElevation: number,
  absoluteCutOffAltitude: number,
): [number, number, number, number] {
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

  // store statistics in the last row as some metadata
  if (this.thread.y >= height) {
    /*
     * Content pixel 0:
     *  - R: rendering mode
     *  - G: minimum elevation
     *  - B: maximum elevation
     *  - A: high density red threshold
     *
     * Content pixel 1:
     *  - R: high density yellow
     *  - G: low density yellow
     *  - B: high density green
     *  - A: low density green
     */
    if (this.thread.x < 4) {
      return [0, minimumElevation, maximumElevation, warningThresholds[2]];
    }
    if (this.thread.x < 8) {
      return [warningThresholds[1], warningThresholds[0], greenThresholds[1], greenThresholds[0]];
    }
    return [0, 0, 0, 0];
  }

  if (
    elevation !== this.constants.invalidElevation &&
    elevation !== this.constants.unknownElevation &&
    elevation !== this.constants.waterElevation &&
    elevation >= absoluteCutOffAltitude
  ) {
    if (elevation >= warningThresholds[2]) {
      return drawDensityPixel(patternMapValue, 5, [255, 0, 0, 255]);
    }
    if (elevation >= warningThresholds[1]) {
      return drawDensityPixel(patternMapValue, 5, [255, 255, 50, 255]);
    }
    if (elevation >= greenThresholds[1] && elevation < warningThresholds[0]) {
      return drawDensityPixel(patternMapValue, 5, [0, 255, 0, 255]);
    }
    if (elevation >= warningThresholds[0] && elevation < warningThresholds[1]) {
      return drawDensityPixel(patternMapValue, 3, [255, 255, 50, 255]);
    }
    if (elevation >= greenThresholds[0] && elevation < greenThresholds[1]) {
      return drawDensityPixel(patternMapValue, 3, [0, 255, 0, 255]);
    }
  } else if (elevation === this.constants.waterElevation) {
    return drawDensityPixel(patternMapValue, 7, [0, 255, 255, 255]);
  } else if (elevation === this.constants.unknownElevation) {
    return drawDensityPixel(patternMapValue, 5, [255, 148, 255, 255]);
  }

  return [0, 0, 0, 255];
}

export function renderPeaksMode(
  elevation: number,
  patternMapValue: number,
  height: number,
  lowerPercentile: number,
  upperPercentile: number,
  halfElevation: number,
  minimumElevation: number,
  maximumElevation: number,
): [number, number, number, number] {
  const thresholds = calculatePeaksModeThresholds(
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
     *  - A: solid green threshold
     *
     * Content pixel 1:
     *  - R: high density green
     *  - G: low density green
     */
    if (this.thread.x < 4) {
      return [1, minimumElevation, maximumElevation, thresholds[2]];
    }
    if (this.thread.x < 8) {
      return [thresholds[1], thresholds[0], 0, 0];
    }
    return [0, 0, 0, 0];
  }

  if (
    elevation !== this.constants.invalidElevation &&
    elevation !== this.constants.unknownElevation &&
    elevation !== this.constants.waterElevation
  ) {
    if (thresholds[2] <= elevation) {
      // solid threshold
      return [0, 255, 0, 255];
    }
    if (thresholds[1] <= elevation) {
      return drawDensityPixel(patternMapValue, 5, [0, 255, 0, 255]);
    }
    if (thresholds[0] <= elevation) {
      return drawDensityPixel(patternMapValue, 3, [0, 255, 0, 255]);
    }
  } else if (elevation === this.constants.waterElevation) {
    return drawDensityPixel(patternMapValue, 7, [0, 255, 255, 255]);
  } else if (elevation === this.constants.unknownElevation) {
    return drawDensityPixel(patternMapValue, 5, [255, 148, 255, 255]);
  }

  return [0, 0, 0, 255];
}

export function renderNavigationDisplay(
  this: NavigationDisplayParameters,
  elevationGrid: number[][],
  histogram: number[],
  patternMap: number[][],
  width: number,
  height: number,
  altitude: number,
  verticalSpeed: number,
  gearDownAltitudeOffset: number,
  cutOffAltitude: number,
): number {
  // calculate the bin of the cut off altitude
  const cutOffAltitudeBin = Math.floor(
    (cutOffAltitude - this.constants.histogramMinElevation) / this.constants.histogramBinRange,
  );
  // predict 30 seconds -> half of the vertical speed (feet per minute)
  const referenceAltitude = altitude + (verticalSpeed <= -1000 ? verticalSpeed * 0.5 : 0);

  // calculate the total frequency to collect the statistics
  let totalFrequency = 0;
  for (
    let totalFrequencyBin = cutOffAltitudeBin;
    totalFrequencyBin < this.constants.histogramBinCount;
    totalFrequencyBin++
  ) {
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

  const pixelX = Math.floor(this.thread.x / 4);
  const colorChannel = this.thread.x % 4;
  let pixelElevation = -1000;
  let patternValue = 0;

  // check the corner cases only for pixels inside the real rendering area
  if (this.thread.y < height) {
    // find highest elevation in 8x8 patch to simulate the lower resolution of the real system
    const patchXStart = pixelX - (pixelX % 8);
    const patchXEnd = Math.min(width, patchXStart + 8);
    const patchYStart = this.thread.y - (this.thread.y % 8);
    const patchYEnd = Math.min(height, patchYStart + 8);

    for (let y = patchYStart; y < patchYEnd; ++y) {
      for (let x = patchXStart; x < patchXEnd; ++x) {
        const currentElevation = elevationGrid[y][x];
        if (currentElevation > pixelElevation && currentElevation !== this.constants.invalidElevation) {
          pixelElevation = currentElevation;
        }
      }
    }

    patternValue = patternMap[this.thread.y][pixelX];
  }

  // the pixel is disabled at all or the areas are clipped. Be sure not to overdraw the metadata line though
  if (patternValue === 0 && this.thread.y !== height) {
    return [4, 4, 5, 0][colorChannel];
  }

  if (maxElevation >= referenceAltitude - gearDownAltitudeOffset) {
    return renderNormalMode(
      pixelElevation,
      patternValue,
      height,
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

  return renderPeaksMode(
    pixelElevation,
    patternValue,
    height,
    lowerPercentileElevation,
    upperPercentileElevation,
    halfElevation,
    minElevation,
    maxElevation,
  )[colorChannel];
}
