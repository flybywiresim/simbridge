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

/** Owns one packed terrain texture, without an upload kernel's full-size input copy. */
export class TerrainTexture {
  private owner: IKernelRunShortcut = null;

  private texture: PackedTexture = null;

  constructor(private readonly gpu: GPU) {}

  public upload(data: Float32Array, width: number, height: number): TerrainElevationData {
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
      return Array.from({ length: height }, (_, y) => data.subarray(y * width, (y + 1) * width));
    }

    const gl = this.gpu.context as WebGLRenderingContext;
    const pixelCount = Math.ceil(data.length / 4);
    const textureWidth = Math.ceil(Math.sqrt(pixelCount));
    const textureHeight = Math.ceil(pixelCount / textureWidth);
    if (Math.max(textureWidth, textureHeight) > gl.getParameter(gl.MAX_TEXTURE_SIZE)) {
      throw new Error('Terrain texture exceeds the GPU texture size limit');
    }

    if (!this.owner) {
      // Let GPU.js own a real packed 2D Texture, including readback and destruction.
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
      if (texture.size[0] !== textureWidth || texture.size[1] !== textureHeight) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureWidth, textureHeight, 0, gl.RGBA, gl.FLOAT, null);
      }

      // Upload full rows from the CPU cache; only the final partial row needs
      // padding. Avoid a terrain-sized staging array on the CPU as well.
      const rowLength = textureWidth * 4;
      const fullRows = Math.floor(data.length / rowLength);
      const fullLength = fullRows * rowLength;
      if (fullRows > 0) {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          textureWidth,
          fullRows,
          gl.RGBA,
          gl.FLOAT,
          data.subarray(0, fullLength),
        );
      }
      if (fullLength < data.length) {
        const tail = new Float32Array(Math.ceil((data.length - fullLength) / 4) * 4);
        tail.set(data.subarray(fullLength));
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, fullRows, tail.length / 4, 1, gl.RGBA, gl.FLOAT, tail);
      }
      texture.size = [textureWidth, textureHeight];
      texture.dimensions = [width, height, 1];
      texture.output = [width, height];
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
  }
}
