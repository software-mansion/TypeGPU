import { d, std } from 'typegpu';
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

function App() {
  const root = useRoot();
  const time = useUniformValue(d.f32, 0);

  const renderPipeline = useMemo(
    () =>
      root.createRenderPipeline({
        vertex: ({ $vertexIndex: vid }) => {
          'use gpu';
          const positions = [d.vec2f(0, 1.1), d.vec2f(-1, -0.7), d.vec2f(1, -0.7)];
          const rotated = rotate(positions[vid], time.$);
          return { $position: d.vec4f(rotated * 0.7, 0, 1) };
        },
        fragment: () => {
          'use gpu';
          return d.vec4f(1, 0, 0, 1);
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
