import { initWithGL } from '@typegpu/gl';
import { useRoot, useRootOrError } from '@typegpu/react';
import { type Ref, type RefObject, useEffect, useState } from 'react';
import type { TgpuRoot } from 'typegpu';
import { createPlumRenderer, type PlumRenderer } from './plum-renderer.ts';
import { createPlumRendererGL } from './plum-renderer-gl.ts';
import { SLIDE_CHANGE_EVENT } from './events.ts';
import { createPlumSim } from './plum-sim.ts';
import { createStageTracker } from './stage.ts';
import {
  type ConfigureContextOptions,
  useConfigureContext,
  useConfigureContextGL,
} from './use-configure-context.ts';

/** Fill light in light mode, so the shadowed sides of the plums aren't as dark */
const LIGHT_MODE_AMBIENT = 0.3;
/** The plums have soft, fuzzy edges, rendering them at a higher pixel ratio isn't worth it */
const MAX_PIXEL_RATIO = 2;

const contextOptions: ConfigureContextOptions = {
  alphaMode: 'premultiplied',
  // Scaling the canvases down on screens denser than `MAX_PIXEL_RATIO`
  remapSize: (width, height) => {
    const scale = Math.min(1, MAX_PIXEL_RATIO / devicePixelRatio);
    return [width * scale, height * scale];
  },
};

/** A canvas and the renderer drawing into it */
interface Layer {
  canvas: HTMLCanvasElement;
  renderer: PlumRenderer;
}

const layerOf = (
  ctxRef: RefObject<GPUCanvasContext | null>,
  createRenderer: (context: GPUCanvasContext) => PlumRenderer,
): Layer | null => {
  const context = ctxRef.current;
  return context
    ? { canvas: context.canvas as HTMLCanvasElement, renderer: createRenderer(context) }
    : null;
};

/**
 * Runs the simulation and draws it every frame, returns a cleanup function. One plum is drawn
 * on a canvas behind the page content, the others on one in front of it.
 */
function animatePlums(front: Layer, back: Layer) {
  const sim = createPlumSim(matchMedia('(prefers-reduced-motion: reduce)').matches);
  const stageTracker = createStageTracker();

  const onPointerMove = (e: PointerEvent) => sim.onPointerMove(e.clientX, e.clientY);
  const onSlideChange = () => sim.onSlideChange();
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener(SLIDE_CHANGE_EVENT, onSlideChange);

  /** Whether a layer was left empty last frame, so there's nothing to clear */
  const wasEmpty = new Map<Layer, boolean>();
  let drawn = false;
  let frameId = 0;
  let lastTime: number | undefined;
  const frame = (timestamp: number) => {
    frameId = requestAnimationFrame(frame);
    const dt = lastTime === undefined ? 0 : (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if ([front, back].some(({ canvas }) => canvas.width === 0 || canvas.height === 0)) return;
    const stage = stageTracker.measure();
    const instances = sim.step(stage, dt);
    const ambient = document.documentElement.dataset.theme === 'dark' ? 0 : LIGHT_MODE_AMBIENT;
    const { width, height } = stage.viewport;
    for (const [layer, layerInstances] of [
      [front, instances.front],
      [back, instances.back],
    ] as const) {
      const empty = layerInstances.length === 0;
      if (empty && wasEmpty.get(layer)) continue;
      wasEmpty.set(layer, empty);
      layer.renderer.render(layerInstances, [width, height], layer.canvas.width / width, ambient);
    }

    if (!drawn) {
      drawn = true;
      // Fading in once the first frame is drawn, the shaders can take a moment to compile
      front.canvas.dataset.active = 'true';
      back.canvas.dataset.active = 'true';
    }
  };
  frameId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(frameId);
    stageTracker.destroy();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener(SLIDE_CHANGE_EVENT, onSlideChange);
    front.renderer.destroy();
    back.renderer.destroy();
  };
}

function PlumsCanvases({
  frontRef,
  backRef,
}: {
  frontRef: Ref<HTMLCanvasElement>;
  backRef: Ref<HTMLCanvasElement>;
}) {
  const className =
    'pointer-events-none fixed inset-0 h-full w-full bg-transparent opacity-0 transition-opacity duration-[1.5s] ease-out data-[active=true]:opacity-100';
  return (
    <>
      {/* A negative z-index puts it under the page content, which then covers it */}
      <canvas ref={backRef} aria-hidden="true" className={`${className} -z-10`} />
      <canvas ref={frontRef} aria-hidden="true" className={`${className} z-30`} />
    </>
  );
}

function PlumsWebGPU() {
  const root = useRoot();
  const front = useConfigureContext(contextOptions);
  const back = useConfigureContext(contextOptions);

  useEffect(() => {
    const createRenderer = (context: GPUCanvasContext) => createPlumRenderer(root, context);
    const frontLayer = layerOf(front.ctxRef, createRenderer);
    const backLayer = layerOf(back.ctxRef, createRenderer);
    if (!frontLayer || !backLayer) return;
    return animatePlums(frontLayer, backLayer);
  }, [root]);

  return <PlumsCanvases frontRef={front.ref} backRef={back.ref} />;
}

/** Fallback for browsers without WebGPU, rendering the same shaders as GLSL with WebGL 2 */
function PlumsWebGL() {
  const [root, setRoot] = useState<TgpuRoot | null>(null);
  const [failed, setFailed] = useState(false);
  const fail = (error: unknown) => {
    console.warn('The plums could not be drawn with WebGL 2.', error);
    setFailed(true);
  };

  useEffect(() => {
    let glRoot: TgpuRoot;
    try {
      // One WebGL context renders offscreen, and copies each frame to the canvas it's for
      glRoot = initWithGL();
    } catch (error) {
      fail(error);
      return;
    }
    setRoot(glRoot);
    return () => glRoot.destroy();
  }, []);

  const front = useConfigureContextGL(root, contextOptions);
  const back = useConfigureContextGL(root, contextOptions);

  useEffect(() => {
    if (!root) return;
    try {
      const createRenderer = (context: GPUCanvasContext) => createPlumRendererGL(root, context);
      const frontLayer = layerOf(front.ctxRef, createRenderer);
      const backLayer = layerOf(back.ctxRef, createRenderer);
      if (!frontLayer || !backLayer) return;
      return animatePlums(frontLayer, backLayer);
    } catch (error) {
      fail(error);
    }
  }, [root]);

  if (failed) return null;
  return <PlumsCanvases frontRef={front.ref} backRef={back.ref} />;
}

function PlumsAuto() {
  const result = useRootOrError();

  if (result.status === 'rejected') {
    // No WebGPU, falling back to WebGL
    return <PlumsWebGL />;
  }

  return <PlumsWebGPU />;
}

/** The three Plum mascots, flying around the page. Add `?webgl` to the URL to force WebGL 2. */
export default function Plums() {
  const [forceWebGL] = useState(() => new URLSearchParams(location.search).has('webgl'));
  return forceWebGL ? <PlumsWebGL /> : <PlumsAuto />;
}
