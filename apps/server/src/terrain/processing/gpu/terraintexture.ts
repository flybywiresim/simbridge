import { CPUKernel, GPU, IKernelRunShortcut, Texture } from 'gpu.js';

export type TerrainElevationData = Texture | Float32Array[];

// GPU.js exposes these fields at runtime, but omits them from its Texture typings.
interface PackedTexture extends Texture {
  texture: WebGLTexture;
  context: WebGLRenderingContext;
  size: number[];
  dimensions: number[];
  output: number[];
}

/**
 * Owns one RGBA8 texture containing two signed 16-bit elevations per texel.
 * GPU consumers must decode the normalized byte channels with decodeTerrainElevation;
 * CPU consumers receive ordinary elevation rows. No full-size upload copy is retained.
 */
export class TerrainTexture {
  private owner: IKernelRunShortcut = null;

  private texture: PackedTexture = null;

  private storageSize: number[] = [0, 0];

  constructor(private readonly gpu: GPU) {}

  public upload(data: Int16Array, width: number, height: number): TerrainElevationData {
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      data.length !== width * height
    ) {
      throw new Error('Invalid terrain texture dimensions');
    }
    if (this.gpu.Kernel === CPUKernel) {
      return Array.from({ length: height }, (_, y) => Float32Array.from(data.subarray(y * width, (y + 1) * width)));
    }

    const gl = this.gpu.context as WebGLRenderingContext;
    const pixelCount = Math.ceil(data.length / 2);
    const textureWidth = Math.ceil(Math.sqrt(pixelCount));
    const textureHeight = Math.ceil(pixelCount / textureWidth);
    if (Math.max(textureWidth, textureHeight) > gl.getParameter(gl.MAX_TEXTURE_SIZE)) {
      throw new Error('Terrain texture exceeds the GPU texture size limit');
    }

    if (!this.owner) {
      // Let GPU.js own a packed 2D Texture for sampling and destruction.
      // Run this tiny, argument-free kernel only once; later uploads write its
      // texture directly. The default drawing buffer stays small.
      this.owner = this.gpu.createKernel(
        function () {
          return 0;
        },
        {
          output: [1, 1],
          precision: 'single',
          optimizeFloatMemory: true,
          pipeline: true,
          immutable: false,
        },
      );
      this.texture = this.owner() as PackedTexture;
      if (!(this.texture instanceof Texture)) {
        this.reset();
        throw new Error('Terrain requires a GPU float texture');
      }
    }

    const texture = this.texture;
    const previousBinding = gl.getParameter(gl.TEXTURE_BINDING_2D);
    const previousFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL);
    try {
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (this.storageSize[0] !== textureWidth || this.storageSize[1] !== textureHeight) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureWidth, textureHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }

      // Two signed elevations per RGBA8 texel, low byte first. On the little-endian
      // hosts this runs on, the samples already have that byte layout: upload
      // views of them in ~1 MiB steps without copying.
      const rowBytes = textureWidth * 4;
      const chunkRows = Math.max(1, Math.floor((1024 * 1024) / rowBytes));
      const uploadRows = (row: number, rows: number, pixels: Uint8Array) =>
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, row, textureWidth, rows, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const fullRows = Math.floor(bytes.length / rowBytes);
      for (let row = 0; row < fullRows; row += chunkRows) {
        const rows = Math.min(chunkRows, fullRows - row);
        uploadRows(row, rows, bytes.subarray(row * rowBytes, (row + rows) * rowBytes));
      }
      // Only a partial last row needs zero padding.
      if (fullRows < textureHeight) {
        const lastRow = new Uint8Array(rowBytes);
        lastRow.set(bytes.subarray(fullRows * rowBytes));
        uploadRows(fullRows, 1, lastRow);
      }
      this.storageSize = [textureWidth, textureHeight];
      texture.size = [textureWidth, textureHeight];
      // GPU.js exposes normalized byte channels as scalar samples. Only the
      // terrain sampling helper decodes these back into signed elevations.
      texture.dimensions = [width * 2, height, 1];
      texture.output = [width * 2, height];
      return texture;
    } finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip);
      gl.bindTexture(gl.TEXTURE_2D, previousBinding);
    }
  }

  public reset(): void {
    if (this.owner) this.owner.destroy();
    this.owner = null;
    this.texture = null;
    this.storageSize = [0, 0];
  }
}
