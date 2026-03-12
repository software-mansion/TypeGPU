import { d, common, std } from 'typegpu';
import { useConfigureContext, useFrame, useRoot, useUniformValue } from '@typegpu/react';
import { hexToRgb, oklabToRgb, hexToOklab, rgbToOklab } from '@typegpu/color';

function App() {
  const root = useRoot();
  const time = useUniformValue(d.f32, 0);

  const renderPipeline = useMemo(
    () =>
      root.createRenderPipeline({
        vertex: common.fullScreenTriangle,
        fragment: ({ uv }) => {
          'use gpu';
          const fromStart = hexToOklab('#ff0000');
          const fromEnd = rgbToOklab(hexToRgb('#0000ff'));
          const from = std.mix(fromStart, fromEnd, std.sin(time.$) * 0.5 + 0.5);

          const toStart = rgbToOklab(hexToRgb('#00ff00'));
          const toEnd = rgbToOklab(hexToRgb('#ff00ff'));
          const to = std.mix(toStart, toEnd, std.cos(time.$ * 1.5) * 0.5 + 0.5);

          const mixed = std.mix(from, to, (uv.x * 2 - 1) * 0.5 + std.sin(time.$ + uv.y * 3) * 0.5);

          return d.vec4f(oklabToRgb(mixed), 1);
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
import { useMemo } from 'react';
const reactRoot = createRoot(document.getElementById('example-app') as HTMLDivElement);
reactRoot.render(<App />);

export function onCleanup() {
  setTimeout(() => reactRoot.unmount(), 0);
}

// #endregion
