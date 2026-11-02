import type { TgpuRoot } from 'typegpu';
import { setupScene } from '../../examples/rendering/jelly-slider/scene.ts';
import HoverExampleLive from './HoverExampleLive.tsx';

async function setup(root: TgpuRoot, context: GPUCanvasContext) {
  const scene = await setupScene(root, context);
  scene.qualityScale = await scene.computeOptimalQuality();

  return { onCleanup: () => scene.onCleanup() };
}

export default function JellySlider() {
  return <HoverExampleLive setup={setup} />;
}
