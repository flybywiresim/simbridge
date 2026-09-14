import { FileHandle, open } from 'fs/promises';
import { Tile } from './tile';

/*
 * Reads tile payloads from terrain.map on demand.
 *
 * Every Tile.CompressedData used to be a subarray view over the ~231MB file buffer, so the
 * whole file stayed resident for the lifetime of the terrain worker in order to serve the
 * handful of tiles around the aircraft. Measured against the shipped file: 193MB of payload
 * spread over 20,575 tiles, ~9.4KB each, and a world map rebuild loads between 9 and 56 of
 * them. That is a few hundred KB of reads per rebuild — served from the OS page cache in
 * practice — against 231MB of permanently resident memory.
 *
 * Reads happen on the terrain worker thread, which has fs available at module scope. An
 * earlier attempt at releasing this buffer failed because it tried a dynamic
 * `await import('fs/promises')` inside a tile worker thread, where it never resolved.
 */
export class TileSource {
  private handle: FileHandle | null = null;

  constructor(private readonly path: string) {}

  public async openFile(): Promise<void> {
    if (this.handle === null) {
      this.handle = await open(this.path, 'r');
    }
  }

  public async close(): Promise<void> {
    const handle = this.handle;
    this.handle = null;
    if (handle !== null) await handle.close();
  }

  public get isOpen(): boolean {
    return this.handle !== null;
  }

  // null rather than throwing: a tile that cannot be read is treated exactly like one that
  // fails to decompress, i.e. the cell keeps no elevation map and renders as unknown
  public async read(tile: Tile): Promise<Buffer | null> {
    if (this.handle === null || tile.BufferSize <= 0) return null;

    try {
      const buffer = Buffer.allocUnsafe(tile.BufferSize);
      const { bytesRead } = await this.handle.read(buffer, 0, tile.BufferSize, tile.BufferOffset);
      return bytesRead === tile.BufferSize ? buffer : null;
    } catch {
      return null;
    }
  }
}
