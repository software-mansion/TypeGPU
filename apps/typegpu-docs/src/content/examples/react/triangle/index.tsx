import * as d from 'typegpu/data';
import { vec4f } from 'typegpu/data';
import { useRender } from '@typegpu/react';

function App() {
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
    fragment: ({ uv }) => {
      'kernel';
      return vec4f(uv.x, uv.y, 1, 1);
    },
  });

  // TODO: Provide a time variable to the shader with useUniformValue
  // TODO: Make the gradient shift colors over time using hsvToRgb from @typegpu/color

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
  reactRoot.unmount();
}

// #endregion
