import { GPU } from 'gpu.js';
import { deg2rad, distanceWgs84, rad2deg } from '../generic/helper';

export function normalizeHeading(angle: number): number {
    return (angle - (Math.floor(angle / 360.0) * 360.0));
}

export function projectWgs84(latitude: number, longitude: number, bearing: number, distance: number): [number, number] {
    const latRad = deg2rad(latitude);
    const longRad = deg2rad(longitude);
    const bearingRad = deg2rad(bearing);
    const ratio = distance / 6371010.0;

    const latDest = Math.asin(Math.sin(latRad) * Math.cos(ratio) + Math.cos(latRad) * Math.sin(ratio) * Math.cos(bearingRad));
    const longDest = longRad + Math.atan2(Math.sin(bearingRad) * Math.sin(ratio) * Math.cos(latRad), Math.cos(ratio) - Math.sin(latRad) * Math.sin(latDest));

    return [rad2deg(latDest), rad2deg(longDest)];
}

export function coordinate2worldIndex(latitude: number, longitude: number, latStep: number, longStep: number): [number, number] {
    const row = Math.floor((latitude + 90.0) / latStep);
    const column = Math.floor((longitude + 180.0) / longStep);
    return [row, column];
}

export function coordinate2gridIndex(
    latitude: number,
    longitude: number,
    row: number,
    column: number,
    latStep: number,
    longStep: number,
    gridRows: number,
    gridColumns: number,
): [number, number] {
    const southwest = [row * latStep - 90.0, column * longStep - 180.0];
    const latCellStep = latStep / gridRows;
    const longCellStep = longStep / gridColumns;

    const rowIndex = Math.max(
        Math.min(gridRows - Math.floor((latitude - southwest[0]) / latCellStep), gridRows - 1),
        0,
    );
    const columnIndex = Math.max(
        Math.min(Math.floor((longitude - southwest[1]) / longCellStep), gridColumns - 1),
        0,
    );

    return [rowIndex, columnIndex];
}

export function findTileInformation(
    entryCount: number,
    rowIndex: number,
    columnIndex: number,
    tileIndex: number,
    rowCountIndex: number,
    columnCountIndex: number,
    worldRow: number,
    worldColumn: number,
    grid: number[],
    tileCount: number,
    waterElevation: number,
): [number, number, number] {
    for (let i = 0; i < tileCount; i++) {
        const offset = i * entryCount;
        if (grid[offset + rowIndex] === worldRow && grid[offset + columnIndex] === worldColumn) {
            return [
                grid[offset + tileIndex],
                grid[offset + rowCountIndex],
                grid[offset + columnCountIndex],
            ];
        }
    }

    return [waterElevation, 0, 0];
}

export function findTileOffset(
    tileIndex: number,
    tileCount: number,
    tileData: number[],
    tileIdIndex: number,
    tileBufferIndex: number,
    tileEntrySize: number,
): number {
    for (let i = 0; i < tileCount; i++) {
        const offset = i * tileEntrySize;
        if (tileIndex === tileData[offset + tileIdIndex]) {
            return tileData[offset + tileBufferIndex];
        }
    }

    return -1;
}

export const registerHelperFunctions = (gpu: GPU): void => {
    gpu.addFunction(normalizeHeading, {
        argumentTypes: { angle: 'Float' },
        returnType: 'Float',
    });
    gpu.addFunction(deg2rad, {
        argumentTypes: { degree: 'Float' },
        returnType: 'Float',
    });
    gpu.addFunction(rad2deg, {
        argumentTypes: { degree: 'Float' },
        returnType: 'Float',
    });
    gpu.addFunction(distanceWgs84, {
        argumentTypes: {
            latitude0: 'Float',
            longitude0: 'Float',
            latitude1: 'Float',
            longitude1: 'Float',
        },
        returnType: 'Float',
    });
    gpu.addFunction(projectWgs84, {
        argumentTypes: {
            latitude: 'Float',
            longitude: 'Float',
            bearing: 'Float',
            distance: 'Float',
        },
        returnType: 'Array(2)',
    });
    gpu.addFunction(coordinate2worldIndex, {
        argumentTypes: {
            latitude: 'Float',
            longitude: 'Float',
            latStep: 'Float',
            longStep: 'Float',
        },
        returnType: 'Array(2)',
    });
    gpu.addFunction(coordinate2gridIndex, {
        argumentTypes: {
            latitude: 'Float',
            longitude: 'Float',
            row: 'Integer',
            close: 'Integer',
            latStep: 'Float',
            longStep: 'Float',
            gridRows: 'Integer',
            gridColumns: 'Integer',
        },
        returnType: 'Array(2)',
    });
    gpu.addFunction(findTileInformation, {
        /*
         * do not define input types
         * bug in GPU.js that ArrayTexture(1) is not allowed,
         * but internally defined
         */
        returnType: 'Array(3)',
    });
    gpu.addFunction(findTileOffset, {
        argumentTypes: {
            tileIndex: 'Integer',
            tileCount: 'Integer',
            tileData: 'Array',
            tileIdIndex: 'Integer',
            tileBufferIndex: 'Integer',
            tileEntrySize: 'Integer',
        },
        returnType: 'Integer',
    });
};
