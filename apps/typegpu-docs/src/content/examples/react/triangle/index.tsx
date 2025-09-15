import * as d from 'typegpu/data';
import { useFrame, useRender, useUniformValue } from '@typegpu/react';
import { hsvToRgb } from '@typegpu/color';

function App() {
  const time = useUniformValue(d.f32, 0);

  useFrame(() => {
    time.value = performance.now() / 1000;
  });

  const { ref } = useRender({
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
