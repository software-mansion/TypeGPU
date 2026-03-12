import { d, common } from 'typegpu';
import { useConfigureContext, useFrame, useRoot } from '@typegpu/react';

function App() {
  const root = useRoot();
  const renderPipeline = useMemo(
    () =>
      root.createRenderPipeline({
        vertex: common.fullScreenTriangle,
        fragment: ({ uv }) => {
          'use gpu';
          return d.vec4f(uv.x, uv.y, 1, 1);
        },
      }),
    [root],
  );

  const { canvasRefCallback, ctxRef } = useConfigureContext();
  useFrame(() => {
    if (!ctxRef.current) return;

    renderPipeline.withColorAttachment({ view: ctxRef.current }).draw(3);
  });

  // TODO: Provide a time variable to the shader with useUniformValue
  // TODO: Make the gradient shift colors over time using hsvToRgb from @typegpu/color

  return (
    <main>
      <canvas ref={canvasRefCallback} width="256" height="256" />
    </main>
  );
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
