// hard coded patterns due to code generation limitations
export function a32nxDrawHighDensityPixel(
    color: [number, number, number, number],
    pixelX: number,
    pixelY: number,
    centerCoordinateX: number,
): [number, number, number, number] {
    // due to code creation issues is it required to calculate the pixel indices in this function
    const row = pixelY % this.constants.densityPatchSize;
    let column = pixelX % this.constants.densityPatchSize;
    let pattern = Math.round((pixelX * (pixelY + 1)) / this.constants.densityPatchSize) % 4;

    if (pixelX < centerCoordinateX) {
        column = this.constants.densityPatchSize - column - 1;
        pattern = 4 - pattern - 1;
    }

    if (pattern === 0) {
        if (row === 0) {
            if (column === 5) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 1) {
            if (column === 5 || column === 6 || column === 8 || column === 9) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 2) {
            if (column === 3 || column === 4 || column === 8 || column === 9) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 3) {
            if (column === 3 || column === 4 || column === 11 || column === 12) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 4) {
            if (column === 5 || column === 6 || column === 11 || column === 12) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 5) {
            if (column === 4 || column === 7 || column === 8) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 6) {
            if (column === 1 || column === 2 || column === 7 || column === 8) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 7) {
            if (column === 1 || column === 3 || column === 4 || column === 9 || column === 10) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 8) {
            if (column === 3 || column === 4 || column === 9 || column === 10) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 9) {
            if (column === 5 || column === 6 || column === 11 || column === 12) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 10) {
            if (column === 5 || column === 6 || column === 11) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 11) {
            if (column === 3 || column === 4 || column === 11 || column === 12) {
                return [color[0], color[1], color[2], color[3]];
            }
        }
    } if (pattern === 1) {
        if (row === 0) {
            if (column === 5 || column === 6) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 2) {
            if (column === 1 || column === 2 || column === 9 || column === 10) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 3) {
            if (column === 1 || column === 2 || column === 3 || column === 4 || column === 9 || column === 10 || column === 12) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 4) {
            if (column === 3 || column === 4 || column === 11 || column === 12) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 5) {
            if (column === 7 || column === 8 || column === 11 || column === 12) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 6) {
            if (column === 0 || column === 1 || column === 7 || column === 8) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 7) {
            if (column === 0 || column === 2 || column === 3 || column === 9 || column === 10) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 8) {
            if (column === 2 || column === 3 || column === 9 || column === 10) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 9) {
            if (column === 5 || column === 6 || column === 9 || column === 10) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 10) {
            if (column === 5 || column === 6 || column === 9 || column === 10) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 11) {
            if (column === 3 || column === 4 || column === 9 || column === 10) {
                return [color[0], color[1], color[2], color[3]];
            }
        }
    } if (pattern === 2) {
        if (row === 0) {
            if (column === 5 || column === 6) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 1) {
            if (column === 1 || column === 2 || column === 5 || column === 6) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 2) {
            if (column === 1 || column === 2 || column === 9 || column === 10) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 3) {
            if (column === 3 || column === 4 || column === 11 || column === 12) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 4) {
            if (column === 5 || column === 6 || column === 11 || column === 12) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 5) {
            if (column === 7 || column === 8) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 6) {
            if (column === 1 || column === 7 || column === 8) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 7) {
            if (column === 7 || column === 8) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 8) {
            if (column === 3 || column === 9 || column === 10) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 9) {
            if (column === 5 || column === 6 || column === 11 || column === 12) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 10) {
            if (column === 5 || column === 6 || column === 11 || column === 12) {
                return [color[0], color[1], color[2], color[3]];
            }
        } else if (row === 11) {
            if (column === 5 || column === 11 || column === 12) {
                return [color[0], color[1], color[2], color[3]];
            }
        }
    } else if (row === 0) {
        if (column === 5 || column === 7 || column === 8 || column === 9) {
            return [color[0], color[1], color[2], color[3]];
        }
    } else if (row === 1) {
        if (column === 4 || column === 5 || column === 6 || column === 8 || column === 9 || column === 10) {
            return [color[0], color[1], color[2], color[3]];
        }
    } else if (row === 2) {
        if (column === 11) {
            return [color[0], color[1], color[2], color[3]];
        }
    } else if (row === 3) {
        if (column === 3 || column === 4 || column === 5 || column === 6 || column === 9 || column === 10 || column === 12) {
            return [color[0], color[1], color[2], color[3]];
        }
    } else if (row === 4) {
        if (column === 4 || column === 5 || column === 6 || column === 8 || column === 9 || column === 11 || column === 12) {
            return [color[0], color[1], color[2], color[3]];
        }
    } else if (row === 5) {
        if (column === 2 || column === 3 || column === 9) {
            return [color[0], color[1], color[2], color[3]];
        }
    } else if (row === 6) {
        if (column === 2 || column === 3 || column === 5 || column === 6) {
            return [color[0], color[1], color[2], color[3]];
        }
    } else if (row === 7) {
        if (column === 0 || column === 1 || column === 5 || column === 6 || column === 7) {
            return [color[0], color[1], color[2], color[3]];
        }
    } else if (row === 8) {
        if (column === 6 || column === 7 || column === 12) {
            return [color[0], color[1], color[2], color[3]];
        }
    } else if (row === 9) {
        if (column === 7 || column === 8) {
            return [color[0], color[1], color[2], color[3]];
        }
    } else if (row === 10) {
        if (column === 8 || column === 9) {
            return [color[0], color[1], color[2], color[3]];
        }
    } else if (row === 11) {
        if (column === 9 || column === 10) {
            return [color[0], color[1], color[2], color[3]];
        }
    } else if (row === 12) {
        if (column === 10 || column === 11) {
            return [color[0], color[1], color[2], color[3]];
        }
    }

    return [0, 0, 0, 0];
}
