import { tgpu } from 'typegpu';
import { setupScene } from './scene.ts';

const root = await tgpu.init({ device: { optionalFeatures: ['shader-f16'] } });

const context = root.configureContext({
  canvas: document.querySelector('canvas') as HTMLCanvasElement,
  alphaMode: 'premultiplied',
});

const scene = await setupScene(root, context);

// #region Cleanup

const handle = setInterval(() => {
  scene.randomize();
}, 1000);

export function onCleanup() {
  root.destroy();
  scene.onCleanup();

  clearInterval(handle);
}

// #endregion
