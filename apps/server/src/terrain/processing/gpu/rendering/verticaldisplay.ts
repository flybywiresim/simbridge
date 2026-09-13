import { VerticalDisplayParameters } from '../interfaces';

export function renderVerticalDisplay(
  this: VerticalDisplayParameters,
  elevationProfile: number[],
  minimumAltitude: number,
  maximumAltitude: number,
  greyBackgroundFromX: number,
): number {
  const pixelX = Math.floor(this.thread.x / 4);
  const ch = this.thread.x % 4;

  if (pixelX >= this.constants.elevationProfileEntryCount) {
    return ch === 0 ? 0 : ch === 1 ? 0 : ch === 2 ? 0 : 0;
  }

  const elevation = elevationProfile[pixelX];
  if (elevation === this.constants.invalidElevation || elevation === this.constants.unknownElevation) {
    return 0;
  }

  const stepY = (maximumAltitude - minimumAltitude) / this.constants.maxImageHeight;
  const altitude = (this.constants.maxImageHeight - this.thread.y) * stepY + minimumAltitude;

  if (altitude > elevation) {
    if (greyBackgroundFromX >= 0 && pixelX >= greyBackgroundFromX) {
      return ch === 0 ? 78 : ch === 1 ? 78 : ch === 2 ? 97 : 255;
    } else {
      return 0;
    }
  }

  if (elevation === this.constants.waterElevation) {
    if (altitude <= 0) {
      return ch === 0 ? 0 : ch === 1 ? 255 : ch === 2 ? 255 : 255;
    }
    return 0;
  }

  return ch === 0 ? 110 : ch === 1 ? 51 : ch === 2 ? 14 : 255;
}
