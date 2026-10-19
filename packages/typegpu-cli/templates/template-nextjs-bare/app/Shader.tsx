'use client';

import React, { useMemo } from 'react';
import { useConfigureContext, useFrame, useRoot } from '@typegpu/react';
import { common, d } from 'typegpu';

export default function Shader({ className }: { className?: string }) {
  const { ref, ctxRef } = useConfigureContext({ autoResize: true, alphaMode: 'premultiplied' });

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

  useFrame(() => {
    if (!ctxRef.current) return;
    renderPipeline.withColorAttachment({ view: ctxRef.current }).draw(3);
  });

  return <canvas ref={ref} className={className} />;
}
