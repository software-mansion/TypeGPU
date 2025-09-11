import { vec4f } from 'typegpu/data';
import { useRender } from '@typegpu/react';

function App() {
  const { ref } = useRender({
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
