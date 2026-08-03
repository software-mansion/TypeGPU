import { tgpu, d, std } from 'typegpu';

import { setupScene } from './scene.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init({
  device: {
    optionalFeatures: ['timestamp-query'],
  },
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const scene = await setupScene(root, context);

const resizeObserver = new ResizeObserver(() => scene.onResize());
resizeObserver.observe(canvas);

// #region Example controls and cleanup

let attributionDismissed = false;
const attributionElement = document.getElementById('attribution') as HTMLDivElement;

function dismissAttribution() {
  if (!attributionDismissed && attributionElement) {
    attributionElement.style.opacity = '0';
    attributionElement.style.pointerEvents = 'none';
    attributionDismissed = true;
  }
}

canvas.addEventListener('mousedown', dismissAttribution, { once: true });
canvas.addEventListener('touchstart', dismissAttribution, { once: true });
canvas.addEventListener('wheel', dismissAttribution, { once: true });

export const controls = defineControls({
  Quality: {
    initial: 'Auto',
    options: ['Auto', 'Very Low', 'Low', 'Medium', 'High', 'Ultra'],
    onSelectChange: (value) => {
      if (value === 'Auto') {
        void scene.computeOptimalQuality().then((scale) => {
          scene.qualityScale = scale;
          console.log(`Auto-selected quality scale: ${scale.toFixed(2)}`);
          scene.onResize();
        });
        return;
      }

      const qualityMap: { [key: string]: number } = {
        'Very Low': 0.3,
        Low: 0.5,
        Medium: 0.7,
        High: 0.85,
        Ultra: 1.0,
      };

      scene.qualityScale = qualityMap[value] || 0.5;
      scene.onResize();
    },
  },
  'Light dir': {
    initial: 0,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (v) => {
      const dir1 = std.normalize(d.vec3f(0.18, -0.3, 0.64));
      const dir2 = std.normalize(d.vec3f(-0.5, -0.14, -0.8));
      const finalDir = std.normalize(std.mix(dir1, dir2, v));
      scene.lightDirection = finalDir;
    },
  },
  'Jelly Color': {
    initial: d.vec3f(1.0, 0.45, 0.075),
    onColorChange: (c) => {
      scene.jellyColor = d.vec4f(c, 1.0);
    },
  },
  Blur: {
    initial: false,
    onToggleChange: (v) => {
      scene.blurEnabled = v;
    },
  },
});

export function onCleanup() {
  scene.onCleanup();
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
