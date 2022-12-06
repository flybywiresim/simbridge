// hard coded patterns due to code generation limitations
export function a32nxDrawLowDensityPixel(
    color: [number, number, number],
    pixelX: number,
    pixelY: number,
    centerCoordinateX: number,
): [number, number, number] {
    // due to code creation issues is it required to calculate the pixel indices in this function
    const row = pixelY % this.constants.densityPatchSize;
    let column = pixelX % this.constants.densityPatchSize;
    let pattern = Math.round((pixelX * (pixelY + 1)) / this.constants.densityPatchSize) % 3;

    if (pixelX < centerCoordinateX) {
        column = this.constants.densityPatchSize - column - 1;
        pattern = 3 - pattern - 1;
    }
    const indices = [pattern, row, column];

    if (indices[0] === 0) {
        if (indices[1] === 3) {
            if (indices[2] === 0 || indices[2] === 8 || indices[2] === 10 || indices[2] === 11) {
                return [color[0], color[1], color[2]];
            }
        } else if (indices[1] === 9) {
            if (indices[2] === 2 || indices[2] === 3 || indices[2] === 11 || indices[2] === 12) {
                return [color[0], color[1], color[2]];
            }
        }
    } else if (indices[0] === 1) {
        if (indices[1] === 5) {
            if (indices[2] === 6 || indices[2] === 7) {
                return [color[0], color[1], color[2]];
            }
        } else if (indices[1] === 12) {
            if (indices[2] === 1 || indices[2] === 11) {
                return [color[0], color[1], color[2]];
            }
        }
    } else if (indices[1] === 0) {
        if (indices[2] === 2 || indices[2] === 6 || indices[2] === 10 || indices[2] === 11) {
            return [color[0], color[1], color[2]];
        }
    } else if (indices[1] === 6) {
        if (indices[2] === 2 || indices[2] === 5 || indices[2] === 6 || indices[2] === 12) {
            return [color[0], color[1], color[2]];
        }
    } else if (indices[1] === 12) {
        if (indices[2] === 11) {
            return [color[0], color[1], color[2]];
        }
    }

    return [4, 4, 5];
}
