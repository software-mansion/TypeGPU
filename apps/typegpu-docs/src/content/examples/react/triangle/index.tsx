function App() {
  // TODO: Use useRender to draw a full-screen gradient
  // TODO: Provide a time variable to the shader with useUniformValue
  // TODO: Make the gradient shift colors over time using hsvToRgb from @typegpu/color
  return <main>Hello</main>;
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
