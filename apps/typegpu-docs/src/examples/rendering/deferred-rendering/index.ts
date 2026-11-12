import { tgpu, common } from 'typegpu';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const autoResizer = common.attachAutoResizer({
  root,
  canvas,
  onResize() {},
});

export function onCleanup() {
  autoResizer.detach();
  root.destroy();
}

// #endregion
