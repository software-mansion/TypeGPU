import tgpu, { d, std } from 'typegpu';
import { hexToOklab, oklabToRgb } from '@typegpu/color';
import { useConfigureContext, useFrame, useRoot, useUniformValue } from '@typegpu/react';
import { useMemo } from 'react';

function rotate(v: d.v2f, angle: number): d.v2f {
  'use gpu';
  const pos = d.vec2f(
    v.x * std.cos(angle) - v.y * std.sin(angle),
    v.x * std.sin(angle) + v.y * std.cos(angle),
  );

  return pos;
}

const purple = hexToOklab('#c463ff');
const blue = hexToOklab('#22ffff');

function getGradientColor(ratio: number) {
  'use gpu';
  return oklabToRgb(std.mix(purple, blue, ratio));
}

const positions = tgpu.const(d.arrayOf(d.vec2f, 3), [
  d.vec2f(0, 1),
  rotate(d.vec2f(0, 1), (Math.PI * 2) / 3),
  rotate(d.vec2f(0, 1), (Math.PI * 4) / 3),
]);

function App() {
  const root = useRoot();
  const time = useUniformValue(d.f32, 0);

  const renderPipeline = useMemo(
    () =>
      root.createRenderPipeline({
        vertex: ({ $vertexIndex: vid }) => {
          'use gpu';
          const local = positions.$[vid];
          const rotated = rotate(local, time.$ * 0.1);
          return {
            $position: d.vec4f(rotated * 0.7, 0, 1),
            dist0: std.length(local - positions.$[0]),
            dist1: std.length(local - positions.$[1]),
            dist2: std.length(local - positions.$[2]),
          };
        },
        fragment: ({ dist0, dist1, dist2 }) => {
          'use gpu';
          const dist = 1 / (1.4 - std.min(dist0, dist1, dist2));
          const albedo = getGradientColor(std.fract(dist * 2 - time.$) * 2 - 1 + std.cos(time.$));
          return d.vec4f(albedo, 1);
        },
      }),
    [root, time],
  );

  const { canvasRefCallback, ctxRef } = useConfigureContext();
  useFrame(({ elapsedSeconds }) => {
    if (!ctxRef.current) return;

    time.value = elapsedSeconds;
    renderPipeline.withColorAttachment({ view: ctxRef.current }).draw(3);
  });

  return <canvas ref={canvasRefCallback} className="aspect-square h-full max-h-[100vw]" />;
}

// #region Example controls and cleanup

import { createRoot } from 'react-dom/client';
const reactRoot = createRoot(document.getElementById('example-app') as HTMLDivElement);
reactRoot.render(<App />);

export function onCleanup() {
  setTimeout(() => reactRoot.unmount(), 0);
}

// #endregion
