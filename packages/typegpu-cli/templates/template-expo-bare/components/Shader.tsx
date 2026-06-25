import React, { useMemo } from 'react';
import { common, d } from 'typegpu';
import { useWindowDimensions } from 'react-native';
import { Canvas } from 'react-native-webgpu';
import { useConfigureContext, useFrame, useRoot } from '@typegpu/react';

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

  const { ref, ctxRef } = useConfigureContext({
    alphaMode: 'premultiplied',
  });

  useFrame(() => {
    if (!ctxRef.current) return;
    renderPipeline.withColorAttachment({ view: ctxRef.current }).draw(3);
    ctxRef.current.present?.();
  });

  const { width, height } = useWindowDimensions();

  return (
    <Canvas
      ref={ref}
      style={{
        width: width > height ? undefined : '100%',
        height: width > height ? '100%' : undefined,
        aspectRatio: 1,
      }}
      transparent
    />
  );
}
