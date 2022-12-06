import { rad2deg } from '../../generic/helper';

export function a32nxInitialNavigationDisplayTransition(
    image: number[][],
    width: number,
    height: number,
    frameCount: number,
): number {
    // keep the metadata block
    if (this.thread.y >= height) return image[this.thread.y][this.thread.x];

    const centerX = width / 2.0;
    const pixelX = Math.floor(this.thread.x / 3);
    const angleStep = 90.0 / frameCount;

    const delta = [pixelX - centerX, height - this.thread.y];
    const distancePixels = Math.sqrt(delta[0] ** 2 + delta[1] ** 2);
    const angle = rad2deg(Math.acos(delta[1] / distancePixels));

    if (this.thread.z * angleStep <= angle) {
        return image[this.thread.y][this.thread.x];
    }

    return 0;
}

export function a32nxUpdateNavigationDisplayTransition(
    lastImage: number[][],
    image: number[][],
    width: number,
    height: number,
    frameCount: number,
): number {
    // keep the metadata block
    if (this.thread.y >= height) return image[this.thread.y][this.thread.x];

    const centerX = width / 2.0;
    const pixelX = Math.floor(this.thread.x / 3);
    const angleStep = 90.0 / frameCount;

    const delta = [pixelX - centerX, height - this.thread.y];
    const distancePixels = Math.sqrt(delta[0] ** 2 + delta[1] ** 2);
    const angle = rad2deg(Math.acos(delta[1] / distancePixels));

    if (this.thread.z * angleStep <= angle) {
        return image[this.thread.y][this.thread.x];
    }

    return lastImage[this.thread.y][this.thread.x];
}
