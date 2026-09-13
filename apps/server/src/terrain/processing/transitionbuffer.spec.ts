import { NavigationDisplayRenderer } from './navigationdisplayrenderer';
import { VerticalDisplayRenderer } from './verticaldisplayrenderer';

// Transition frames reuse two buffers instead of allocating one per 40ms tick.
// The rule that makes that safe: the buffer handed out must never be the one
// renderingData.lastFrame is currently pointing at, because the transition reads
// lastFrame while filling its output. Break this and frames silently corrupt.
describe.each([
  ['NavigationDisplayRenderer', NavigationDisplayRenderer],
  ['VerticalDisplayRenderer', VerticalDisplayRenderer],
])('%s transition buffers', (_name, Renderer) => {
  const makeRenderer = () => {
    const renderer = Object.create(Renderer.prototype);
    renderer.renderingData = { lastFrame: null };
    renderer.transitionBuffers = [null, null];
    return renderer;
  };

  const acquire = (renderer: any, length: number): Uint8ClampedArray =>
    renderer.acquireTransitionBuffer(length);

  it('never hands back the buffer lastFrame points at', () => {
    const renderer = makeRenderer();

    const first = acquire(renderer, 64);
    renderer.renderingData.lastFrame = first;

    const second = acquire(renderer, 64);
    expect(second).not.toBe(first);

    // end of transition: lastFrame = currentFrame, so the next tick must flip back
    renderer.renderingData.lastFrame = second;
    expect(acquire(renderer, 64)).toBe(first);
  });

  it('reuses the same buffer while lastFrame is unchanged', () => {
    const renderer = makeRenderer();

    const first = acquire(renderer, 64);
    expect(acquire(renderer, 64)).toBe(first);
    expect(acquire(renderer, 64)).toBe(first);
  });

  it('reallocates when the frame size changes', () => {
    const renderer = makeRenderer();

    const small = acquire(renderer, 64);
    const large = acquire(renderer, 128);

    expect(large).not.toBe(small);
    expect(large.length).toBe(128);
  });
});
