import { tgpu, common, d } from 'typegpu';
import { Renderer } from './renderer.ts';
import { setupFirstPersonCamera } from '../../common/setup-first-person-camera.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const renderer = new Renderer(root, context);

const autoResizer = common.attachAutoResizer({
  root,
  canvas,
  onResize() {
    const { width, height } = canvas;
    renderer.resize(width, height);
  },
});

const { cleanupCamera, updatePosition } = setupFirstPersonCamera(
  canvas,
  { initPos: d.vec3f(-25, 15, 25), target: d.vec3f(0, 5, 0), speed: d.vec3f(0.01, 0.1, 1) },
  (update) => {
    renderer.updateCamera(update);
  },
);

let frameId = requestAnimationFrame(frame);
function frame(time: number) {
  updatePosition();
  renderer.render(time);
  frameId = requestAnimationFrame(frame);
}

export function onCleanup() {
  cancelAnimationFrame(frameId);
  autoResizer.detach();
  cleanupCamera();
  root.destroy();
}
