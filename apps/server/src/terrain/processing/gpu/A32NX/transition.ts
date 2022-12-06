import { rad2deg } from '../../generic/helper';
import { NavigationDisplayTransitionParameters } from '../interfaces';

export function a32nxInitialNavigationDisplayTransition(
    this: NavigationDisplayTransitionParameters,
    image: number[][],
    height: number,
    angleThresholdStart: number,
    angleThresholdStop: number,
): number {
    // keep the metadata block
    if (this.thread.y >= height) return image[this.thread.y][this.thread.x];

    const centerX = this.constants.screenWidth / 2.0;
    const pixelX = Math.floor(this.thread.x / 3);

    const delta = [pixelX - centerX, height - this.thread.y];
    const distancePixels = Math.sqrt(delta[0] ** 2 + delta[1] ** 2);
    const angle = rad2deg(Math.acos(delta[1] / distancePixels));

    if (angleThresholdStart <= angle && angleThresholdStop >= angle) {
        return image[this.thread.y][this.thread.x];
    }

    return 0;
}

export function a32nxUpdateNavigationDisplayTransition(
    this: NavigationDisplayTransitionParameters,
    lastImage: number[][],
    image: number[][],
    height: number,
    angleThreshold: number,
): number {
    // keep the metadata block
    if (this.thread.y >= height) return image[this.thread.y][this.thread.x];

    const centerX = this.constants.screenWidth / 2.0;
    const pixelX = Math.floor(this.thread.x / 3);

    const delta = [pixelX - centerX, height - this.thread.y];
    const distancePixels = Math.sqrt(delta[0] ** 2 + delta[1] ** 2);
    const angle = rad2deg(Math.acos(delta[1] / distancePixels));

    if (angleThreshold >= angle) {
        return image[this.thread.y][this.thread.x];
    }

    return lastImage[this.thread.y][this.thread.x];
}
