import { readFileSync } from 'fs';
import { join } from 'path';

/*
 * gpu.js returns the kernel's OWN output texture when a kernel is created with
 * immutable:false (gl/kernel.js renderTexture(): `this.immutable ? clone() : this.texture`).
 * Calling .delete() on that value destroys the kernel's live output texture; the kernel
 * never rebuilds it, so every later run draws into a dead texture and reads back zeros.
 *
 * This looks exactly like a leak fix, which is how it got introduced: the ND rendered
 * correctly for one cycle and was solid green from then on, because the world map read
 * 0ft everywhere and the flat-earth branch pushed lowDensityGreen to 0.
 *
 * Guarding it as source assertions rather than behaviour because reproducing it needs a
 * real GL context. If a kernel is ever switched to immutable:true, delete() becomes
 * correct for that kernel and this test should be updated deliberately, not silently.
 */
describe('gpu.js kernel-owned textures are not deleted by callers', () => {
  const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');

  const maphandler = read('maphandler.ts');
  const ndRenderer = read('navigationdisplayrenderer.ts');

  // strip block and line comments so the explanatory comments do not match
  const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('keeps the world map upload kernel immutable:false', () => {
    expect(maphandler).toMatch(/uploadWorldMapToGPU\s*=\s*this\.gpu\.createKernel\(/);
    expect(maphandler).toMatch(/immutable:\s*false/);
  });

  it('never calls delete() on cachedElevationData.gpuData', () => {
    expect(code(maphandler)).not.toMatch(/gpuData(\?)?\.delete\s*\(/);
  });

  it('never calls delete() on pixelPattern', () => {
    expect(code(ndRenderer)).not.toMatch(/pixelPattern(\?)?\.delete\s*\(/);
  });

  it('still releases the kernels themselves on shutdown', () => {
    expect(code(maphandler)).toMatch(/uploadWorldMapToGPU\.destroy\(\)/);
    expect(code(ndRenderer)).toMatch(/patternUpload\.destroy\(\)/);
  });
});
