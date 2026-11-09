import { GPU, HeadlessGLKernel } from 'gpu.js';

let refreshHeadlessGlFeatures = false;

export function createTerrainGpu(mode: 'gpu' | 'cpu'): GPU {
  if (mode === 'gpu' && refreshHeadlessGlFeatures) {
    // Native cleanup also destroys GPU.js's cached capability-test context.
    // Recreate it before using the headless backend again.
    (HeadlessGLKernel as typeof HeadlessGLKernel & { setupFeatureChecks(): void }).setupFeatureChecks();
    refreshHeadlessGlFeatures = false;
  }
  if (mode === 'cpu') return new GPU({ mode });

  // Compute kernels never use depth or stencil testing.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const context = require('gl')(2, 2, { depth: false, stencil: false, preserveDrawingBuffer: true });
  if (!context) throw new Error('Unable to create the terrain GPU context');
  try {
    return new GPU({ mode, context });
  } catch (error) {
    context.getExtension('STACKGL_destroy_context').destroy();
    throw error;
  }
}
