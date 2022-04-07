import { NDViewDto } from '../dto/ndview.dto';
import { Worldmap } from '../manager/worldmap';
import { PositionDto } from '../dto/position.dto';
import { WGS84 } from './wgs84';

const sharp = require('sharp');

export class NDRenderer {
    private worldmap: Worldmap | undefined = undefined;

    public ViewConfig: NDViewDto | undefined = undefined;

    constructor(map: Worldmap) {
        this.worldmap = map;
    }

    public configureView(config: NDViewDto): void {
        this.ViewConfig = config;
    }

    private static colorize(elevation: number, altitude: number): { r: number, g: number, b: number } {
        const delta = elevation - altitude;
        let r = 0;
        let g = 0;
        let b = 0;

        if (elevation === 0 || delta < -2000) {
            r = 0; g = 0; b = 0;
        } else if (delta < -1000) {
            r = 119; g = 221; b = 119;
        } else if (delta < 500) {
            r = 0; g = 77; b = 0;
        } else if (delta < 1000) {
            r = 255; g = 255; b = 223;
        } else if (delta < 2000) {
            r = 255; g = 228; b = 80;
        } else {
            r = 254; g = 57; b = 57;
        }

        return { r, g, b };
    }

    public async render(position: PositionDto): Promise<{ buffer: SharedArrayBuffer, rows: number, columns: number }> {
        if (this.worldmap.Terraindata === undefined) {
            return { buffer: undefined, rows: 0, columns: 0 };
        }

        const start = new Date().getTime();

        const radius = Math.round((this.ViewConfig.viewRadius * 1852) / this.ViewConfig.meterPerPixel + 0.5);
        const size = radius * 2;
        const buffer = new Uint8ClampedArray(size * size * 3);
        buffer.fill(0, 0, size * size * 3);

        const viewSouthwest = WGS84.project(position.latitude, position.longitude, this.ViewConfig.viewRadius * 1852, 225);
        const viewNortheast = WGS84.project(position.latitude, position.longitude, this.ViewConfig.viewRadius * 1852, 45);
        const latitudeStep = (viewNortheast.latitude - viewSouthwest.latitude) / size;
        const longitudeStep = (viewNortheast.longitude - viewSouthwest.longitude) / size;

        let color: { r: number, g: number, b: number } = { r: 0, g: 0, b: 0 };
        const coordinate = { latitude: viewNortheast.latitude, longitude: viewSouthwest.longitude };
        for (let y = 0; y < size; ++y) {
            for (let x = 0; x < size; ++x) {
                const distance = Math.sqrt((x - radius) ** 2 + (y - radius) ** 2);
                if (distance - 1 > radius) {
                    coordinate.longitude += longitudeStep;
                    continue;
                }

                const worldIndex = this.worldmap.worldMapIndices(coordinate.latitude, coordinate.longitude);

                if (this.worldmap.Grid[worldIndex.row][worldIndex.column].tileIndex === -1 || this.worldmap.Grid[worldIndex.row][worldIndex.column].elevationmap === undefined) {
                    color = NDRenderer.colorize(0, 0);
                } else {
                    const { row, column } = this.worldmap.Grid[worldIndex.row][worldIndex.column].elevationmap.worldToGridIndices(coordinate);
                    const gridBuffer = new Int32Array(this.worldmap.Grid[worldIndex.row][worldIndex.column].elevationmap.Grid);
                    color = NDRenderer.colorize(gridBuffer[this.worldmap.Grid[worldIndex.row][worldIndex.column].elevationmap.Columns * row + column], position.altitude);
                }

                buffer[(y * size + x) * 3 + 0] = color.r;
                buffer[(y * size + x) * 3 + 1] = color.g;
                buffer[(y * size + x) * 3 + 2] = color.b;

                coordinate.longitude += longitudeStep;
            }

            coordinate.longitude = viewSouthwest.longitude;
            coordinate.latitude += latitudeStep;
        }

        const rotatedRaw = await sharp(new Uint8ClampedArray(buffer), { raw: { width: size, height: size, channels: 3 } })
            .rotate(this.ViewConfig.rotateAroundHeading === true ? -1 * position.heading : 0)
            .raw()
            .toBuffer({ resolveWithObject: true });
        const offset = Math.round((rotatedRaw.info.width - size) / 2);

        const { data, info } = await sharp(new Uint8ClampedArray(rotatedRaw.data.buffer), { raw: { width: rotatedRaw.info.width, height: rotatedRaw.info.height, channels: 3 } })
            .extract({ width: size, height: this.ViewConfig.semicircleRequired === true ? Math.round(size / 2) : size, left: offset, top: offset })
            .raw()
            .toBuffer({ resolveWithObject: true });

        const retval = new SharedArrayBuffer(info.width * info.height * 3);
        const dest = new Uint8ClampedArray(retval);
        dest.set(new Uint8ClampedArray(data.buffer), 0);

        const delta = new Date().getTime() - start;
        console.log(`Created ND map in ${delta / 1000} seconds`);

        return { buffer: retval, rows: info.height, columns: info.width };
    }
}
