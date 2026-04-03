import { useMemo } from 'react';
import { d, common, std } from 'typegpu';
import { useConfigureContext, useFrame, useRoot, useUniform } from '@typegpu/react';
import { oklabToRgb, hexToOklab } from '@typegpu/color';

function App() {
  const root = useRoot();
  const time = useUniform(d.f32);

  const renderPipeline = useMemo(
    () =>
      root.createRenderPipeline({
        vertex: common.fullScreenTriangle,
        fragment: ({ uv }) => {
          'use gpu';
          const fromStart = hexToOklab('#ff0000');
          const fromEnd = hexToOklab('#0000ff');
          const from = std.mix(fromStart, fromEnd, std.sin(time.$) * 0.5 + 0.5);

          const toStart = hexToOklab('#00ff00');
          const toEnd = hexToOklab('#ff00ff');
          const to = std.mix(toStart, toEnd, std.cos(time.$ * 1.5) * 0.5 + 0.5);

          const mixed = std.mix(from, to, (uv.x * 2 - 1) * 0.5 + std.sin(time.$ + uv.y * 3) * 0.5);

          return d.vec4f(oklabToRgb(mixed), 1);
        },
      }),
    [root, time],
  );

  const { ref, ctxRef } = useConfigureContext({ alphaMode: 'premultiplied' });
  useFrame(({ elapsedSeconds }) => {
    if (!ctxRef.current) return;

    time.write(elapsedSeconds);
    renderPipeline.withColorAttachment({ view: ctxRef.current }).draw(3);
  });

  return <canvas ref={ref} className="aspect-square h-full max-h-[100vw]" />;
}

// #region Example controls and cleanup

import { createRoot } from 'react-dom/client';
const reactRoot = createRoot(document.getElementById('example-app') as HTMLDivElement);
reactRoot.render(<App />);

export function onCleanup() {
  setTimeout(() => reactRoot.unmount(), 0);
}

// #endregion
