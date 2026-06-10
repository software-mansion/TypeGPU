'use client';

import { useRoot, useConfigureContext, useFrame } from '@typegpu/react';
import { useMemo } from 'react';
import { common, d } from 'typegpu';

export function Shader() {
  const root = useRoot();
  const renderPipeline = useMemo(
    () =>
      root.createRenderPipeline({
        vertex: common.fullScreenTriangle,
        fragment: ({ uv }) => {
          'use gpu';
          return d.vec4f(0.55, uv, 1);
        },
      }),
    [root],
  );

  const { ref, ctxRef } = useConfigureContext({ autoResize: true, alphaMode: 'premultiplied' });

  useFrame(() => {
    if (!ctxRef.current) return;

    renderPipeline.withColorAttachment({ view: ctxRef.current }).draw(3);
  });

  return <canvas ref={ref} style={{ display: 'block', width: '100vw', height: '100vh' }} />;
}
