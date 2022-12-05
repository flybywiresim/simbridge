// need to draw spaghetti code due to wrong code generation
export function a32nxDrawWaterDensityPixel(
    color: [number, number, number, number],
    pixelX: number,
    pixelY: number,
    height: number,
    centerCoordinateX: number,
): [number, number, number, number] {
    const delta = [this.thread.x - centerCoordinateX, height - this.thread.y];

    // calculate distance and bearing for the projection
    const distancePixels = Math.sqrt(delta[0] ** 2 + delta[1] ** 2);
    const angle = Math.abs(Math.acos(delta[1] / distancePixels) * (180.0 / Math.PI));

    if (distancePixels >= 400) {
        if (angle >= 75 && angle <= 90) {
            // due to code creation issues is it required to calculate the pixel indices in this function
            const row = pixelY % this.constants.densityPatchSize;
            let column = pixelX % this.constants.densityPatchSize;
            let pattern = Math.round((pixelX * (pixelY + 1)) / this.constants.densityPatchSize) % 5;

            if (pixelX < centerCoordinateX) {
                column = this.constants.densityPatchSize - column - 1;
                pattern = 5 - pattern - 1;
            }

            if (pattern === 0) {
                if (row === 0 && column === 5) {
                    return color;
                }
                if (row === 1 && (column === 5 || column === 6 || column === 8 || column === 9)) {
                    return color;
                }
                if (row === 2 && (column === 3 || column === 4 || column === 8 || column === 9)) {
                    return color;
                }
                if (row === 3 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 4 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 5 && (column === 4 || column === 7 || column === 8)) {
                    return color;
                }
                if (row === 6 && (column === 1 || column === 2 || column === 7 || column === 8)) {
                    return color;
                }
                if (row === 7 && (column === 1 || column === 3 || column === 4 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 8 && (column === 3 || column === 4 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 9 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 10 && (column === 5 || column === 6 || column === 11)) {
                    return color;
                }
                if (row === 11 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                    return color;
                }
            } else if (pattern === 1) {
                if (row === 0 && (column === 5 || column === 6)) {
                    return color;
                }
                if (row === 2 && (column === 1 || column === 2 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 3 && (column === 1 || column === 2 || column === 3 || column === 4 || column === 9 || column === 10 || column === 12)) {
                    return color;
                }
                if (row === 4 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 5 && (column === 7 || column === 8 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 6 && (column === 0 || column === 1 || column === 7 || column === 8)) {
                    return color;
                }
                if (row === 7 && (column === 0 || column === 2 || column === 3 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 8 && (column === 2 || column === 3 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 9 && (column === 5 || column === 6 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 10 && (column === 5 || column === 6 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 11 && (column === 3 || column === 4 || column === 9 || column === 10)) {
                    return color;
                }
            } else if (pattern === 2) {
                if (row === 0 && (column === 5 || column === 6)) {
                    return color;
                }
                if (row === 1 && (column === 1 || column === 2 || column === 5 || column === 6)) {
                    return color;
                }
                if (row === 2 && (column === 1 || column === 2 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 3 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 4 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 5 && (column === 7 || column === 8)) {
                    return color;
                }
                if (row === 6 && (column === 1 || column === 7 || column === 8)) {
                    return color;
                }
                if (row === 7 && (column === 7 || column === 8)) {
                    return color;
                }
                if (row === 8 && (column === 3 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 9 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 10 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 11 && (column === 5 || column === 11 || column === 12)) {
                    return color;
                }
            } else if (pattern === 3) {
                if (row === 0 && (column === 3 || column === 4 || column === 10 || column === 11)) {
                    return color;
                }
                if (row === 1 && (column === 4 || column === 5 || column === 10 || column === 11)) {
                    return color;
                }
                if (row === 2 && (column === 2 || column === 3 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 3 && (column === 0 || column === 2 || column === 3 || column === 6 || column === 7 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 4 && (column === 0 || column === 6 || column === 7 || column === 9 || column === 12)) {
                    return color;
                }
                if (row === 5 && column === 12) {
                    return color;
                }
                if (row === 6 && (column === 3 || column === 4 || column === 5 || column === 6 || column === 12)) {
                    return color;
                }
                if (row === 7 && (column === 1 || column === 2 || column === 3 || column === 4 || column === 5 || column === 6 || column === 7 || column === 8)) {
                    return color;
                }
                if (row === 8 && (column === 1 || column === 2 || column === 7 || column === 8)) {
                    return color;
                }
                if (row === 9 && (column === 2 || column === 3 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 10 && (column === 2 || column === 10)) {
                    return color;
                }
                if (row === 11 && (column === 0 || column === 1)) {
                    return color;
                }
                if (row === 12 && (column === 0 || column === 1 || column === 8 || column === 9)) {
                    return color;
                }
            } else if (pattern === 4) {
                if (row === 0 && (column === 5 || column === 7 || column === 8 || column === 9)) {
                    return color;
                }
                if (row === 1 && (column === 4 || column === 5 || column === 6 || column === 8 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 2 && column === 11) {
                    return color;
                }
                if (row === 3 && (column === 3 || column === 4 || column === 5 || column === 6 || column === 9 || column === 10 || column === 12)) {
                    return color;
                }
                if (row === 4 && (column === 4 || column === 5 || column === 6 || column === 8 || column === 9 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 5 && (column === 2 || column === 3 || column === 9)) {
                    return color;
                }
                if (row === 6 && (column === 2 || column === 3 || column === 5 || column === 6)) {
                    return color;
                }
                if (row === 7 && (column === 0 || column === 1 || column === 5 || column === 6 || column === 7)) {
                    return color;
                }
                if (row === 8 && (column === 6 || column === 7 || column === 12)) {
                    return color;
                }
                if (row === 9 && (column === 7 || column === 8)) {
                    return color;
                }
                if (row === 10 && (column === 8 || column === 9)) {
                    return color;
                }
                if (row === 11 && (column === 9 || column === 10)) {
                    return color;
                }
                if (row === 12 && (column === 10 || column === 11)) {
                    return color;
                }
            }
        } else if (angle >= 60 && angle < 75) {
            // due to code creation issues is it required to calculate the pixel indices in this function
            const row = pixelY % this.constants.densityPatchSize;
            let column = pixelX % this.constants.densityPatchSize;
            let pattern = Math.round((pixelX * (pixelY + 1)) / this.constants.densityPatchSize) % 3;

            if (pixelX < centerCoordinateX) {
                column = this.constants.densityPatchSize - column - 1;
                pattern = 3 - pattern - 1;
            }

            if (pattern === 0) {
                if (row === 0 && column === 5) {
                    return color;
                }
                if (row === 1 && (column === 5 || column === 6 || column === 8 || column === 9)) {
                    return color;
                }
                if (row === 2 && (column === 3 || column === 4 || column === 8 || column === 9)) {
                    return color;
                }
                if (row === 3 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 4 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 5 && (column === 4 || column === 7 || column === 8)) {
                    return color;
                }
                if (row === 6 && (column === 1 || column === 2 || column === 7 || column === 8)) {
                    return color;
                }
                if (row === 7 && (column === 1 || column === 3 || column === 4 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 8 && (column === 3 || column === 4 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 9 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 10 && (column === 5 || column === 6 || column === 11)) {
                    return color;
                }
                if (row === 11 && (column === 3 || column === 4 || column === 12 || column === 12)) {
                    return color;
                }
            } else if (pattern === 1) {
                if (row === 0 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 1 && (column === 5 || column === 10 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 2 && (column === 10 || column === 11)) {
                    return color;
                }
                if (row === 3 && (column === 9 || column === 10 || column === 11)) {
                    return color;
                }
                if (row === 4 && (column === 2 || column === 3 || column === 4 || column === 8 || column === 9)) {
                    return color;
                }
                if (row === 5 && (column === 2 || column === 4 || column === 8 || column === 10)) {
                    return color;
                }
                if (row === 6 && (column === 6 || column === 7)) {
                    return color;
                }
                if (row === 7 && (column === 5 || column === 6 || column === 7)) {
                    return color;
                }
                if (row === 8 && (column === 1 || column === 5 || column === 6)) {
                    return color;
                }
                if (row === 9 && (column === 4 || column === 5 || column === 6)) {
                    return color;
                }
                if (row === 10 && (column === 4 || column === 5)) {
                    return color;
                }
                if (row === 11 && (column === 2 || column === 3 || column === 4)) {
                    return color;
                }
            } else if (pattern === 2) {
                if (row === 1 && (column === 2 || column === 10 || column === 11)) {
                    return color;
                }
                if (row === 2 && (column === 4 || column === 7 || column === 8 || column === 9)) {
                    return color;
                }
                if (row === 3 && (column === 1 || column === 5 || column === 6 || column === 7)) {
                    return color;
                }
                if (row === 4 && (column === 3 || column === 4 || column === 5 || column === 6)) {
                    return color;
                }
                if (row === 5 && (column === 0 || column === 1 || column === 2)) {
                    return color;
                }
                if (row === 6 && (column === 7 || column === 8 || column === 9)) {
                    return color;
                }
                if (row === 7 && (column === 5 || column === 6 || column === 7)) {
                    return color;
                }
                if (row === 8 && (column === 3 || column === 4 || column === 6)) {
                    return color;
                }
                if (row === 9 && (column === 1 || column === 2 || column === 3)) {
                    return color;
                }
                if (row === 10 && (column === 0 || column === 1 || column === 2 || column === 3)) {
                    return color;
                }
                if (row === 11 && (column === 3 || column === 7 || column === 11)) {
                    return color;
                }
            }
        } else if (angle >= 15 && angle <= 30) {
            // due to code creation issues is it required to calculate the pixel indices in this function
            const row = pixelY % this.constants.densityPatchSize;
            let column = pixelX % this.constants.densityPatchSize;
            let pattern = Math.round((pixelX * (pixelY + 1)) / this.constants.densityPatchSize) % 3;

            if (pixelX < centerCoordinateX) {
                column = this.constants.densityPatchSize - column - 1;
                pattern = 3 - pattern - 1;
            }

            if (pattern === 0) {
                if (row === 0 && column === 5) {
                    return color;
                }
                if (row === 1 && (column === 5 || column === 6 || column === 8 || column === 9)) {
                    return color;
                }
                if (row === 2 && (column === 3 || column === 4 || column === 8 || column === 9)) {
                    return color;
                }
                if (row === 3 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 4 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 5 && (column === 4 || column === 7 || column === 8)) {
                    return color;
                }
                if (row === 6 && (column === 1 || column === 2 || column === 7 || column === 8)) {
                    return color;
                }
                if (row === 7 && (column === 1 || column === 3 || column === 4 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 8 && (column === 3 || column === 4 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 9 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 10 && (column === 5 || column === 6 || column === 11)) {
                    return color;
                }
                if (row === 11 && (column === 3 || column === 4 || column === 12 || column === 12)) {
                    return color;
                }
            } else if (pattern === 1) {
                if (row === 0 && (column === 3 || column === 8)) {
                    return color;
                }
                if (row === 1 && (column === 5 || column === 8)) {
                    return color;
                }
                if (row === 2 && (column === 1 || column === 7 || column === 8)) {
                    return color;
                }
                if (row === 3 && (column === 2 || column === 6 || column === 7)) {
                    return color;
                }
                if (row === 4 && (column === 4 || column === 6)) {
                    return color;
                }
                if (row === 5 && (column === 5 || column === 6)) {
                    return color;
                }
                if (row === 6 && column === 5) {
                    return color;
                }
                if (row === 7 && (column === 4 || column === 5)) {
                    return color;
                }
                if (row === 8 && (column === 4 || column === 10)) {
                    return color;
                }
                if (row === 9 && (column === 4 || column === 8)) {
                    return color;
                }
                if (row === 10 && (column === 3 || column === 4 || column === 11)) {
                    return color;
                }
                if (row === 11 && (column === 3 || column === 11)) {
                    return color;
                }
            } else if (pattern === 2) {
                if (row === 0 && (column === 1 || column === 2 || column === 6)) {
                    return color;
                }
                if (row === 1 && (column === 5 || column === 6)) {
                    return color;
                }
                if (row === 2 && (column === 3 || column === 4 || column === 5 || column === 6)) {
                    return color;
                }
                if (row === 3 && (column === 3 || column === 4 || column === 5)) {
                    return color;
                }
                if (row === 4 && (column === 3 || column === 4 || column === 5 || column === 7 || column === 8 || column === 12)) {
                    return color;
                }
                if (row === 5 && (column === 2 || column === 3 || column === 4 || column === 7 || column === 8 || column === 12)) {
                    return color;
                }
                if (row === 6 && (column === 2 || column === 3)) {
                    return color;
                }
                if (row === 7 && (column === 2 || column === 10)) {
                    return color;
                }
                if (row === 8 && (column === 0 || column === 1 || column === 2 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 9 && (column === 1 || column === 2 || column === 9)) {
                    return color;
                }
                if (row === 10 && (column === 8 || column === 9)) {
                    return color;
                }
                if (row === 11 && (column === 8 || column === 9)) {
                    return color;
                }
                if (row === 12 && (column === 5 || column === 8 || column === 12)) {
                    return color;
                }
            }
        } else {
            // due to code creation issues is it required to calculate the pixel indices in this function
            const row = pixelY % this.constants.densityPatchSize;
            let column = pixelX % this.constants.densityPatchSize;
            let pattern = Math.round((pixelX * (pixelY + 1)) / this.constants.densityPatchSize) % 3;

            if (pixelX < centerCoordinateX) {
                column = this.constants.densityPatchSize - column - 1;
                pattern = 3 - pattern - 1;
            }

            if (pattern === 0) {
                if (row === 0 && column === 5) {
                    return color;
                }
                if (row === 1 && (column === 5 || column === 6 || column === 8 || column === 9)) {
                    return color;
                }
                if (row === 2 && (column === 3 || column === 4 || column === 8 || column === 9)) {
                    return color;
                }
                if (row === 3 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 4 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 5 && (column === 4 || column === 7 || column === 8)) {
                    return color;
                }
                if (row === 6 && (column === 1 || column === 2 || column === 7 || column === 8)) {
                    return color;
                }
                if (row === 7 && (column === 1 || column === 3 || column === 4 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 8 && (column === 3 || column === 4 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 9 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                    return color;
                }
                if (row === 10 && (column === 5 || column === 6 || column === 11)) {
                    return color;
                }
                if (row === 11 && (column === 3 || column === 4 || column === 12 || column === 12)) {
                    return color;
                }
            } else if (pattern === 1) {
                if (row === 0 && (column === 2 || column === 8 || column === 9 || column === 12)) {
                    return color;
                }
                if (row === 1 && (column === 2 || column === 3 || column === 12)) {
                    return color;
                }
                if (row === 2 && (column === 1 || column === 2 || column === 3)) {
                    return color;
                }
                if (row === 3 && (column === 1 || column === 2)) {
                    return color;
                }
                if (row === 6 && column === 12) {
                    return color;
                }
                if (row === 7 && column === 12) {
                    return color;
                }
                if (row === 10 && (column === 10 || column === 11)) {
                    return color;
                }
                if (row === 11 && (column === 0 || column === 2 || column === 3 || column === 4 || column === 10 || column === 11)) {
                    return color;
                }
                if (row === 12 && (column === 0 || column === 3)) {
                    return color;
                }
            } else if (pattern === 2) {
                if (row === 0 && (column === 1 || column === 2 || column === 6)) {
                    return color;
                }
                if (row === 1 && (column === 5 || column === 6)) {
                    return color;
                }
                if (row === 2 && (column === 3 || column === 4 || column === 5 || column === 6)) {
                    return color;
                }
                if (row === 3 && (column === 3 || column === 4 || column === 5)) {
                    return color;
                }
                if (row === 4 && (column === 3 || column === 4 || column === 5 || column === 7 || column === 8 || column === 12)) {
                    return color;
                }
                if (row === 5 && (column === 2 || column === 3 || column === 4 || column === 7 || column === 8 || column === 12)) {
                    return color;
                }
                if (row === 6 && (column === 2 || column === 3)) {
                    return color;
                }
                if (row === 7 && (column === 2 || column === 10)) {
                    return color;
                }
                if (row === 8 && (column === 0 || column === 1 || column === 2 || column === 9 || column === 10)) {
                    return color;
                }
                if (row === 9 && (column === 1 || column === 2 || column === 9)) {
                    return color;
                }
                if (row === 10 && (column === 8 || column === 9)) {
                    return color;
                }
                if (row === 11 && (column === 8 || column === 9)) {
                    return color;
                }
                if (row === 12 && (column === 5 || column === 8 || column === 12)) {
                    return color;
                }
            }
        }
    } else if ((angle >= 0 && angle <= 15) || (angle >= 75 && angle <= 90)) {
        // due to code creation issues is it required to calculate the pixel indices in this function
        const row = pixelY % this.constants.densityPatchSize;
        let column = pixelX % this.constants.densityPatchSize;
        let pattern = Math.round((pixelX * (pixelY + 1)) / this.constants.densityPatchSize) % 6;

        if (pixelX < centerCoordinateX) {
            column = this.constants.densityPatchSize - column - 1;
            pattern = 6 - pattern - 1;
        }

        if (pattern === 0) {
            if (row === 0 && column === 5) {
                return color;
            }
            if (row === 1 && (column === 5 || column === 6 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 2 && (column === 3 || column === 4 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 3 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 4 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 5 && (column === 4 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 6 && (column === 1 || column === 2 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 7 && (column === 1 || column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 8 && (column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 9 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 10 && (column === 5 || column === 6 || column === 11)) {
                return color;
            }
            if (row === 11 && (column === 3 || column === 4 || column === 12 || column === 12)) {
                return color;
            }
        } else if (pattern === 1) {
            if (row === 0 && (column === 5 || column === 6)) {
                return color;
            }
            if (row === 2 && (column === 1 || column === 2 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 3 && (column === 1 || column === 2 || column === 3 || column === 4 || column === 9 || column === 10 || column === 12)) {
                return color;
            }
            if (row === 4 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 5 && (column === 7 || column === 8 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 6 && (column === 0 || column === 1 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 7 && (column === 0 || column === 2 || column === 3 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 8 && (column === 2 || column === 3 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 9 && (column === 5 || column === 6 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 10 && (column === 5 || column === 6 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 11 && (column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
        } else if (pattern === 2) {
            if (row === 0 && (column === 5 || column === 6)) {
                return color;
            }
            if (row === 1 && (column === 1 || column === 2 || column === 5 || column === 6)) {
                return color;
            }
            if (row === 2 && (column === 1 || column === 2 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 3 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 4 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 5 && (column === 7 || column === 8)) {
                return color;
            }
            if (row === 6 && (column === 1 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 7 && (column === 7 || column === 8)) {
                return color;
            }
            if (row === 8 && (column === 3 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 9 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 10 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 11 && (column === 5 || column === 11 || column === 12)) {
                return color;
            }
        } else if (pattern === 3) {
            if (row === 0 && column === 5) {
                return color;
            }
            if (row === 1 && (column === 5 || column === 6 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 2 && (column === 3 || column === 4 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 3 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 4 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 5 && (column === 4 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 6 && (column === 1 || column === 2 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 7 && (column === 1 || column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 8 && (column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 9 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 10 && (column === 5 || column === 6 || column === 11)) {
                return color;
            }
            if (row === 11 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
        } else if (pattern === 4) {
            if (row === 0 && column === 5) {
                return color;
            }
            if (row === 1 && (column === 5 || column === 6 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 2 && (column === 3 || column === 4 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 3 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 4 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 5 && (column === 4 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 6 && (column === 1 || column === 2 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 7 && (column === 1 || column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 8 && (column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 9 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 10 && (column === 5 || column === 6 || column === 11)) {
                return color;
            }
            if (row === 11 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
        } else if (pattern === 5) {
            if (row === 0 && (column === 5 || column === 7 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 1 && (column === 4 || column === 5 || column === 6 || column === 8 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 2 && column === 11) {
                return color;
            }
            if (row === 3 && (column === 3 || column === 4 || column === 5 || column === 6 || column === 9 || column === 10 || column === 12)) {
                return color;
            }
            if (row === 4 && (column === 4 || column === 5 || column === 6 || column === 8 || column === 9 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 5 && (column === 2 || column === 3 || column === 9)) {
                return color;
            }
            if (row === 6 && (column === 2 || column === 3 || column === 5 || column === 6)) {
                return color;
            }
            if (row === 7 && (column === 0 || column === 1 || column === 5 || column === 6 || column === 7)) {
                return color;
            }
            if (row === 8 && (column === 6 || column === 7 || column === 12)) {
                return color;
            }
            if (row === 9 && (column === 7 || column === 8)) {
                return color;
            }
            if (row === 10 && (column === 8 || column === 9)) {
                return color;
            }
            if (row === 11 && (column === 9 || column === 10)) {
                return color;
            }
            if (row === 12 && (column === 10 || column === 11)) {
                return color;
            }
        }
    } else if ((angle >= 15 && angle <= 30) || (angle >= 60 && angle < 75)) {
        // due to code creation issues is it required to calculate the pixel indices in this function
        const row = pixelY % this.constants.densityPatchSize;
        let column = pixelX % this.constants.densityPatchSize;
        let pattern = Math.round((pixelX * (pixelY + 1)) / this.constants.densityPatchSize) % 6;

        if (pixelX < centerCoordinateX) {
            column = this.constants.densityPatchSize - column - 1;
            pattern = 6 - pattern - 1;
        }

        if (pattern === 0) {
            if (row === 0 && column === 5) {
                return color;
            }
            if (row === 1 && (column === 5 || column === 6 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 2 && (column === 3 || column === 4 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 3 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 4 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 5 && (column === 4 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 6 && (column === 1 || column === 2 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 7 && (column === 1 || column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 8 && (column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 9 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 10 && (column === 5 || column === 6 || column === 11)) {
                return color;
            }
            if (row === 11 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
        } else if (pattern === 1) {
            if (row === 0 && column === 7) {
                return color;
            }
            if (row === 1 && (column === 6 || column === 7 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 2 && (column === 8 || column === 9 || column === 10 || column === 11)) {
                return color;
            }
            if (row === 3 && (column === 5 || column === 10)) {
                return color;
            }
            if (row === 4 && (column === 5 || column === 6)) {
                return color;
            }
            if (row === 5 && (column === 0 || column === 6)) {
                return color;
            }
            if (row === 6 && (column === 3 || column === 6)) {
                return color;
            }
            if (row === 7 && (column === 3 || column === 4 || column === 6 || column === 7 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 8 && (column === 2 || column === 3 || column === 4 || column === 7 || column === 8 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 9 && (column === 2 || column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 10 && (column === 1 || column === 2 || column === 3 || column === 10)) {
                return color;
            }
            if (row === 11 && (column === 1 || column === 2 || column === 3 || column === 10 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 12 && column === 11) {
                return color;
            }
        } else if (pattern === 2) {
            if (row === 0 && (column === 5 || column === 6)) {
                return color;
            }
            if (row === 2 && (column === 1 || column === 2 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 3 && (column === 1 || column === 2 || column === 3 || column === 4 || column === 9 || column === 10 || column === 12)) {
                return color;
            }
            if (row === 4 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 5 && (column === 7 || column === 8 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 6 && (column === 0 || column === 1 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 7 && (column === 0 || column === 2 || column === 3 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 8 && (column === 2 || column === 3 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 9 && (column === 5 || column === 6 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 10 && (column === 5 || column === 6 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 11 && (column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
        } else if (pattern === 3) {
            if (row === 0 && (column === 2 || column === 8 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 1 && (column === 2 || column === 3 || column === 4 || column === 9)) {
                return color;
            }
            if (row === 2 && column === 3) {
                return color;
            }
            if (row === 3 && (column === 0 || column === 3 || column === 4)) {
                return color;
            }
            if (row === 4 && (column === 0 || column === 1 || column === 2 || column === 3 || column === 4 || column === 5)) {
                return color;
            }
            if (row === 5 && (column === 0 || column === 1 || column === 4 || column === 5 || column === 6 || column === 7)) {
                return color;
            }
            if (row === 6 && (column === 5 || column === 6 || column === 7 || column === 12)) {
                return color;
            }
            if (row === 7 && (column === 4 || column === 5 || column === 6 || column === 7 || column === 12)) {
                return color;
            }
            if (row === 8 && (column === 0 || column === 6 || column === 7 || column === 8 || column === 12)) {
                return color;
            }
            if (row === 9 && (column === 7 || column === 8)) {
                return color;
            }
            if (row === 10 && (column === 0 || column === 1 || column === 10)) {
                return color;
            }
            if (row === 11 && (column === 5 || column === 10 || column === 11)) {
                return color;
            }
            if (row === 12 && (column === 4 || column === 5 || column === 6 || column === 7 || column === 10 || column === 11 || column === 12)) {
                return color;
            }
        } else if (pattern === 4) {
            if (row === 0 && (column === 5 || column === 7 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 1 && (column === 4 || column === 5 || column === 6 || column === 8 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 2 && column === 11) {
                return color;
            }
            if (row === 3 && (column === 3 || column === 4 || column === 5 || column === 6 || column === 9 || column === 10 || column === 12)) {
                return color;
            }
            if (row === 4 && (column === 4 || column === 5 || column === 6 || column === 8 || column === 9 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 5 && (column === 2 || column === 3 || column === 9)) {
                return color;
            }
            if (row === 6 && (column === 2 || column === 3 || column === 5 || column === 6)) {
                return color;
            }
            if (row === 7 && (column === 0 || column === 1 || column === 5 || column === 6 || column === 7)) {
                return color;
            }
            if (row === 8 && (column === 6 || column === 7 || column === 12)) {
                return color;
            }
            if (row === 9 && (column === 7 || column === 8)) {
                return color;
            }
            if (row === 10 && (column === 8 || column === 9)) {
                return color;
            }
            if (row === 11 && (column === 9 || column === 10)) {
                return color;
            }
            if (row === 12 && (column === 10 || column === 11)) {
                return color;
            }
        } else if (pattern === 5) {
            if (row === 0 && (column === 2 || column === 8 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 1 && (column === 2 || column === 3 || column === 4 || column === 9)) {
                return color;
            }
            if (row === 2 && column === 3) {
                return color;
            }
            if (row === 3 && (column === 0 || column === 3 || column === 4)) {
                return color;
            }
            if (row === 4 && (column === 0 || column === 1 || column === 2 || column === 3 || column === 4 || column === 5)) {
                return color;
            }
            if (row === 5 && (column === 0 || column === 1 || column === 4 || column === 5 || column === 6 || column === 7)) {
                return color;
            }
            if (row === 6 && (column === 5 || column === 6 || column === 7 || column === 12)) {
                return color;
            }
            if (row === 7 && (column === 4 || column === 5 || column === 6 || column === 7 || column === 12)) {
                return color;
            }
            if (row === 8 && (column === 0 || column === 6 || column === 7 || column === 8 || column === 12)) {
                return color;
            }
            if (row === 9 && (column === 7 || column === 8)) {
                return color;
            }
            if (row === 10 && (column === 0 || column === 1 || column === 10)) {
                return color;
            }
            if (row === 11 && (column === 5 || column === 10 || column === 11)) {
                return color;
            }
            if (row === 12 && (column === 4 || column === 5 || column === 6 || column === 7 || column === 10 || column === 11 || column === 12)) {
                return color;
            }
        }
    } else {
        // due to code creation issues is it required to calculate the pixel indices in this function
        const row = pixelY % this.constants.densityPatchSize;
        let column = pixelX % this.constants.densityPatchSize;
        let pattern = Math.round((pixelX * (pixelY + 1)) / this.constants.densityPatchSize) % 6;

        if (pixelX < centerCoordinateX) {
            column = this.constants.densityPatchSize - column - 1;
            pattern = 6 - pattern - 1;
        }

        if (pattern === 0) {
            if (row === 0 && column === 7) {
                return color;
            }
            if (row === 1 && (column === 6 || column === 7 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 2 && (column === 8 || column === 9 || column === 10 || column === 11)) {
                return color;
            }
            if (row === 3 && (column === 5 || column === 6)) {
                return color;
            }
            if (row === 4 && (column === 0 || column === 6)) {
                return color;
            }
            if (row === 5 && (column === 3 || column === 6)) {
                return color;
            }
            if (row === 6 && (column === 3 || column === 4 || column === 6 || column === 7 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 7 && (column === 2 || column === 3 || column === 4 || column === 7 || column === 8 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 8 && (column === 2 || column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 9 && (column === 1 || column === 2 || column === 3 || column === 10)) {
                return color;
            }
            if (row === 10 && (column === 1 || column === 2 || column === 3 || column === 10 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 11 && column === 11) {
                return color;
            }
        } else if (pattern === 1) {
            if (row === 0 && (column === 2 || column === 8 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 1 && (column === 2 || column === 3 || column === 4 || column === 9)) {
                return color;
            }
            if (row === 2 && column === 3) {
                return color;
            }
            if (row === 3 && (column === 0 || column === 3 || column === 4)) {
                return color;
            }
            if (row === 4 && (column === 0 || column === 1 || column === 2 || column === 3 || column === 4 || column === 5)) {
                return color;
            }
            if (row === 5 && (column === 0 || column === 1 || column === 4 || column === 5 || column === 6 || column === 7)) {
                return color;
            }
            if (row === 6 && (column === 5 || column === 6 || column === 7 || column === 12)) {
                return color;
            }
            if (row === 7 && (column === 4 || column === 5 || column === 6 || column === 7 || column === 12)) {
                return color;
            }
            if (row === 8 && (column === 0 || column === 6 || column === 7 || column === 8 || column === 12)) {
                return color;
            }
            if (row === 9 && (column === 7 || column === 8)) {
                return color;
            }
            if (row === 10 && (column === 0 || column === 1 || column === 10)) {
                return color;
            }
            if (row === 11 && (column === 5 || column === 10 || column === 11)) {
                return color;
            }
            if (row === 12 && (column === 4 || column === 5 || column === 6 || column === 7 || column === 10 || column === 11 || column === 12)) {
                return color;
            }
        } else if (pattern === 2) {
            if (row === 0 && column === 5) {
                return color;
            }
            if (row === 1 && (column === 5 || column === 6 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 2 && (column === 3 || column === 4 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 3 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 4 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 5 && (column === 4 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 6 && (column === 1 || column === 2 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 7 && (column === 1 || column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 8 && (column === 3 || column === 4 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 9 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 10 && (column === 5 || column === 6 || column === 11)) {
                return color;
            }
            if (row === 11 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
        } else if (pattern === 3) {
            if (row === 0 && (column === 2 || column === 8 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 1 && (column === 2 || column === 3 || column === 4 || column === 9)) {
                return color;
            }
            if (row === 2 && column === 3) {
                return color;
            }
            if (row === 3 && (column === 0 || column === 3 || column === 4)) {
                return color;
            }
            if (row === 4 && (column === 0 || column === 1 || column === 2 || column === 3 || column === 4 || column === 5)) {
                return color;
            }
            if (row === 5 && (column === 0 || column === 1 || column === 4 || column === 5 || column === 6 || column === 7)) {
                return color;
            }
            if (row === 6 && (column === 5 || column === 6 || column === 7 || column === 12)) {
                return color;
            }
            if (row === 7 && (column === 4 || column === 5 || column === 6 || column === 7 || column === 12)) {
                return color;
            }
            if (row === 8 && (column === 0 || column === 6 || column === 7 || column === 8 || column === 12)) {
                return color;
            }
            if (row === 9 && (column === 7 || column === 8)) {
                return color;
            }
            if (row === 10 && (column === 0 || column === 1 || column === 10)) {
                return color;
            }
            if (row === 11 && (column === 5 || column === 10 || column === 11)) {
                return color;
            }
            if (row === 12 && (column === 4 || column === 5 || column === 6 || column === 7 || column === 10 || column === 11 || column === 12)) {
                return color;
            }
        } else if (pattern === 4) {
            if (row === 0 && (column === 5 || column === 6)) {
                return color;
            }
            if (row === 1 && (column === 1 || column === 2 || column === 5 || column === 6)) {
                return color;
            }
            if (row === 2 && (column === 1 || column === 2 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 3 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 4 && (column === 3 || column === 4 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 5 && (column === 7 || column === 8)) {
                return color;
            }
            if (row === 6 && (column === 1 || column === 7 || column === 8)) {
                return color;
            }
            if (row === 7 && (column === 7 || column === 8)) {
                return color;
            }
            if (row === 8 && (column === 3 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 9 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 10 && (column === 5 || column === 6 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 11 && (column === 5 || column === 11 || column === 12)) {
                return color;
            }
        } else if (pattern === 5) {
            if (row === 0 && (column === 5 || column === 7 || column === 8 || column === 9)) {
                return color;
            }
            if (row === 1 && (column === 4 || column === 5 || column === 6 || column === 8 || column === 9 || column === 10)) {
                return color;
            }
            if (row === 2 && column === 11) {
                return color;
            }
            if (row === 3 && (column === 3 || column === 4 || column === 5 || column === 6 || column === 9 || column === 10 || column === 12)) {
                return color;
            }
            if (row === 4 && (column === 4 || column === 5 || column === 6 || column === 8 || column === 9 || column === 11 || column === 12)) {
                return color;
            }
            if (row === 5 && (column === 2 || column === 3 || column === 9)) {
                return color;
            }
            if (row === 6 && (column === 2 || column === 3 || column === 5 || column === 6)) {
                return color;
            }
            if (row === 7 && (column === 0 || column === 1 || column === 5 || column === 6 || column === 7)) {
                return color;
            }
            if (row === 8 && (column === 6 || column === 7 || column === 12)) {
                return color;
            }
            if (row === 9 && (column === 7 || column === 8)) {
                return color;
            }
            if (row === 10 && (column === 8 || column === 9)) {
                return color;
            }
            if (row === 11 && (column === 9 || column === 10)) {
                return color;
            }
            if (row === 12 && (column === 10 || column === 11)) {
                return color;
            }
        }
    }

    return [0, 0, 0, 0];
}
