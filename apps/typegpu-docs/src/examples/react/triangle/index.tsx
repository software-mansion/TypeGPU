import * as d from 'typegpu/data';
import { useFrame, useRender, useUniformValue } from '@typegpu/react';
import { hsvToRgb } from '@typegpu/color';

function App() {
  const time = useUniformValue(d.f32, 0);

  useFrame(() => {
    time.value = performance.now() / 1000;
  });

  const { ref } = useRender({
    vertex: ({ vertexIndex }) => {
      'kernel';
      const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
      const uv = [d.vec2f(0, 1), d.vec2f(2, 1), d.vec2f(0, -1)];

      return {
        pos: d.vec4f(pos[vertexIndex] as d.v2f, 0, 1),
        uv: uv[vertexIndex] as d.v2f,
      };
    },
    fragment: () => {
      'kernel';
      const t = time.$;
      const rgb = hsvToRgb(d.vec3f(t * 0.5, 1, 1));
      return d.vec4f(rgb, 1);
    },
  });

  return (
    <main>
      <canvas ref={ref} width='256' height='256' />
    </main>
  );
}

// #region Example controls and cleanup

import { createRoot } from 'react-dom/client';
const reactRoot = createRoot(
  document.getElementById('example-app') as HTMLDivElement,
);
reactRoot.render(<App />);

export function onCleanup() {
  setTimeout(() => reactRoot.unmount(), 0);
}

// #endregion
