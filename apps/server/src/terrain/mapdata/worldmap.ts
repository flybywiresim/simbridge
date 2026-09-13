import { PositionData, GridDefinition, GridLookupData } from '../types';
import { ElevationGrid } from '../types/elevationgrid';
import { TerrainMap } from '../fileformat/terrainmap';
import { Tile } from '../fileformat/tile';
import { projectWgs84 } from '../processing/gpu/helper';
import { TileManager } from './tilemanager';
import { TileWorkerPool } from '../processing/tileworkerpool';
import { TileSource } from '../fileformat/tilesource';

const tilePool = new TileWorkerPool();

export class Worldmap {
  public GridData: GridDefinition = {
    rows: 0,
    columns: 0,
    latitudeStep: 0,
    longitudeStep: 0,
  };

  public TileManager: TileManager = null;

  // pilot terrain awareness only needs ~50-100nm ahead
  public VisibilityRange: number = 100;

  constructor(
    private terrainData: TerrainMap,
    private tileSource: TileSource | null = null,
  ) {
    this.TileManager = new TileManager(terrainData);

    // create the grid-metadata
    this.GridData.rows = this.TileManager.grid.length;
    this.GridData.columns = this.TileManager.grid[0].length;
    this.GridData.latitudeStep = this.terrainData.AngularSteps.latitude;
    this.GridData.longitudeStep = this.terrainData.AngularSteps.longitude;
  }

  public resetInternalData(): void {
    this.TileManager.grid.forEach((row) => {
      row.forEach((column) => {
        column.elevationmap = undefined;
      });
    });
  }

  // saves ~300MB (231MB terrain.map + ~70MB decompressed tiles)
  public clearTerrainData(): void {
    this.TileManager.clearAllElevationMaps();
    this.terrainData = null;
  }

  public createGridLookupTable(
    position: PositionData,
    maxWidth: number,
    maxHeight: number,
    defaultTileSize: number,
  ): GridLookupData {
    const south = projectWgs84(position.latitude, position.longitude, 180, this.VisibilityRange * 1852)[0];
    const southwest = projectWgs84(position.latitude, position.longitude, 225, this.VisibilityRange * 1852);
    const west = projectWgs84(position.latitude, position.longitude, 270, this.VisibilityRange * 1852)[1];
    const north = projectWgs84(position.latitude, position.longitude, 0, this.VisibilityRange * 1852)[0];
    const east = projectWgs84(position.latitude, position.longitude, 90, this.VisibilityRange * 1852)[1];
    const northeast = projectWgs84(position.latitude, position.longitude, 45, this.VisibilityRange * 1852);

    let southwestLat = Math.min(south, southwest[0]);
    let northeastLat = Math.max(north, northeast[0]);
    let southwestLong = Math.min(west, southwest[1]);
    let northeastLong = Math.min(east, northeast[1]);

    // handle the 180 degree wrap around for the western coordinate
    if (west * southwest[1] < 0) {
      southwestLong = Math.max(west, southwest[1]);
    }
    // handle the 180 degree wrap around for the eastern coordinate
    if (east * northeast[1] < 0) {
      northeastLong = Math.max(east, northeast[1]);
    }

    const southwestGrid = this.worldMapIndices(southwestLat, southwestLong);
    const northeastGrid = this.worldMapIndices(northeastLat, northeastLong);

    let rowCount = northeastGrid.row - southwestGrid.row;
    let rowDirection = 1;
    if (southwestLat >= position.latitude) {
      // we are at the south pole
      rowCount = southwestGrid.row + northeastGrid.row;
      rowDirection = -1;
    } else if (northeastLat <= position.latitude) {
      // we are at the north pole
      rowCount = this.TileManager.grid.length - southwestGrid.row + this.TileManager.grid.length - northeastGrid.row;
    }
    rowCount += 1;

    let columnCount = northeastGrid.column - southwestGrid.column;
    if (northeastLong < southwestLong) {
      // wrap around at 180
      columnCount = this.TileManager.grid[0].length - southwestGrid.column + northeastGrid.column;
    }
    columnCount += 1;

    // create the look up table and sort from north->south and west->east
    const grid = new Array(rowCount);
    for (let y = 0; y < rowCount; ++y) {
      let row = southwestGrid.row + rowDirection * y;
      // ensure that the row index is not outside of bounds
      if (row < 0) row = Math.abs(row);
      if (row >= this.TileManager.grid.length) row -= this.TileManager.grid.length;

      grid[rowCount - 1 - y] = new Array(columnCount);
      for (let x = 0; x < columnCount; x++) {
        const column = (southwestGrid.column + x) % this.TileManager.grid[0].length;
        grid[rowCount - 1 - y][x] = { row, column };
      }
    }

    // find the minimum dimensions per tile
    let minWidthPerTile = 5000;
    let minHeightPerTile = 5000;
    grid.forEach((row) => {
      row.forEach((cellIdx) => {
        const cell = this.TileManager.grid[cellIdx.row][cellIdx.column];
        if (cell.tileIndex !== -1) {
          const tile = this.terrainData.Tiles[cell.tileIndex];
          minWidthPerTile = Math.min(tile.GridDimension.columns, minWidthPerTile);
          minHeightPerTile = Math.min(tile.GridDimension.rows, minHeightPerTile);
        }
      });
    });
    if (minWidthPerTile === 5000) minWidthPerTile = defaultTileSize;
    if (minHeightPerTile === 5000) minHeightPerTile = defaultTileSize;

    const mapHeight = minHeightPerTile * grid.length;
    const mapWidth = minWidthPerTile * grid[0].length;

    // delete rows if necessary (shared clipping between top and bottom)
    if (mapHeight > maxHeight) {
      const clippingTileCount = Math.ceil((mapHeight - maxHeight) / minHeightPerTile);
      const topClippingCount = Math.ceil(clippingTileCount / 2);
      const bottomClippingCount = Math.floor(clippingTileCount / 2);

      for (let i = 0; i < topClippingCount; ++i) grid.shift();
      for (let i = 0; i < bottomClippingCount; ++i) grid.pop();

      northeastLat -= this.terrainData.AngularSteps.latitude * topClippingCount;
      southwestLat += this.terrainData.AngularSteps.latitude * bottomClippingCount;
    }

    // delete columns as necessary (shared clipping between left and right)
    if (mapWidth > maxWidth) {
      const clippingTileCount = Math.ceil((mapWidth - maxWidth) / minWidthPerTile);
      const startTileClipping = Math.ceil(clippingTileCount / 2);
      const endTileClipping = Math.floor(clippingTileCount / 2);

      grid.forEach((row) => {
        for (let i = 0; i < startTileClipping; ++i) row.shift();
        for (let i = 0; i < endTileClipping; ++i) row.pop();
      });

      southwestLong += this.terrainData.AngularSteps.longitude * startTileClipping;
      northeastLong -= this.terrainData.AngularSteps.longitude * endTileClipping;

      // ensure correct updates at -180.0, 180.0 degree wrap around
      if (southwestLong >= 180.0) southwestLong -= 360.0;
      if (northeastLong < -180.0) northeastLong += 360.0;
    }

    return {
      southwest: { latitude: southwestLat, longitude: southwestLong },
      northeast: { latitude: northeastLat, longitude: northeastLong },
      grid,
      minWidthPerTile,
      minHeightPerTile,
    };
  }

  public async updatePosition(relevantTiles: { row: number; column: number }[][]): Promise<boolean> {
    // collect all tiles that need loading
    const tilesToLoad: { tile: Tile; row: number; column: number }[] = [];
    relevantTiles.forEach((row) => {
      row.forEach((cell) => {
        const cellData = this.TileManager.grid[cell.row][cell.column];
        if (
          cellData.tileIndex !== -1 &&
          (cellData.elevationmap === undefined || cellData.elevationmap.ElevationMap === undefined)
        ) {
          tilesToLoad.push({
            tile: this.terrainData.Tiles[cellData.tileIndex],
            row: cell.row,
            column: cell.column,
          });
        }
      });
    });

    if (tilesToLoad.length === 0) return false;

    // CompressedData is released once the terrain.map buffer is dropped, so payloads come
    // back from disk here — a few hundred KB per rebuild instead of 231MB kept resident
    const payloads = await Promise.all(
      tilesToLoad.map((entry) =>
        entry.tile.CompressedData !== null
          ? Promise.resolve(entry.tile.CompressedData)
          : this.tileSource !== null
            ? this.tileSource.read(entry.tile)
            : Promise.resolve(null),
      ),
    );

    const requests: { tile: Tile; row: number; column: number }[] = [];
    const buffers: Buffer[] = [];
    for (let i = 0; i < tilesToLoad.length; i++) {
      if (payloads[i] !== null && payloads[i].byteLength > 0) {
        requests.push(tilesToLoad[i]);
        buffers.push(payloads[i]);
      }
    }
    if (buffers.length === 0) return false;

    // decompress all tiles in parallel via OS thread pool
    const decompressed = await tilePool.decompress(buffers);

    let loadedTiles = 0;
    for (let i = 0; i < decompressed.length; i++) {
      // pair by id — never by array position
      const request = requests[decompressed[i].id];
      if (request !== undefined && decompressed[i].data !== null) {
        const tile = request.tile;
        const grid = tile.GridDimension;
        const elevationGrid = new ElevationGrid(
          tile.Southwest,
          {
            latitude: tile.Southwest.latitude + this.terrainData.AngularSteps.latitude,
            longitude: tile.Southwest.longitude + this.terrainData.AngularSteps.longitude,
          },
          grid.columns,
          grid.rows,
          decompressed[i].data,
        );
        this.TileManager.setElevationMap({ row: request.row, column: request.column }, elevationGrid);
        loadedTiles += 1;
      }
    }

    return loadedTiles !== 0;
  }

  public worldMapIndices(latitude: number, longitude: number): { row: number; column: number } | undefined {
    const row = Math.floor((latitude + 90) / this.GridData.latitudeStep);
    const column = Math.floor((longitude + 180) / this.GridData.longitudeStep);

    if (row < 0 || row >= this.GridData.rows || column < 0 || column >= this.GridData.columns) {
      return undefined;
    }

    return { row, column };
  }

  public static validTile(
    terrainData: TerrainMap,
    grid: {
      southwest: { latitude: number; longitude: number };
      tileIndex: number;
      elevationmap: undefined | ElevationGrid;
    }[][],
    index: { row: number; column: number },
  ): boolean {
    if (grid.length <= index.row || index.row < 0 || grid[index.row].length <= index.column || index.column < 0) {
      return false;
    }

    return (
      grid[index.row][index.column].tileIndex >= 0 && grid[index.row][index.column].tileIndex < terrainData.Tiles.length
    );
  }

  public getSouthwestCoordinateOfTile(latitude: number, longitude: number): { latitude: number; longitude: number } {
    const index = this.worldMapIndices(latitude, longitude);
    if (index === undefined) {
      return undefined;
    }

    return {
      latitude: index.row * this.GridData.latitudeStep - 90.0,
      longitude: index.column * this.GridData.longitudeStep - 180.0,
    };
  }
}
