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

export async function destroyTerrainGpu(gpu: GPU): Promise<void> {
  const headless = gpu.Kernel === HeadlessGLKernel;
  try {
    if (headless && gpu.context) gpu.context.finish();
    await gpu.destroy();
  } finally {
    if (headless) {
      refreshHeadlessGlFeatures = true;
      // Terrain must remain the sole owner of headless-GL contexts in this process.
      // GPU.destroy() releases its context, but headless-GL retains the shared EGL
      // display and surfaces. Its native cleanup (also used at process exit) calls
      // eglTerminate, releasing that remaining VRAM as well as the probe context.
      // This internal API is isolated here so dependency upgrades can be checked.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { NativeWebGL } = require('gl/src/javascript/native-gl');
      NativeWebGL.cleanup();
    }
  }
}
