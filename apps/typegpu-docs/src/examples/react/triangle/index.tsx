import * as d from 'typegpu/data';
import {
  useFrame,
  useMirroredUniform,
  useRender,
  useUniformValue,
} from '@typegpu/react';
import { hsvToRgb } from '@typegpu/color';

// TODO: We can come up with a more sophisticated example later
function ColorBox(props: { color: d.v3f }) {
  const color = useMirroredUniform(d.vec3f, props.color);

  const { ref } = useRender({
    fragment: () => {
      'kernel';
      return d.vec4f(color.$, 1);
    },
  });

  return (
    <canvas
      ref={ref}
      width='32'
      height='32'
      style={{ border: '2px black solid' }}
    />
  );
}

let randomizeColor: () => void;

function App() {
  const [currentColor, setCurrentColor] = useState(d.vec3f(1, 0, 0));
  const time = useUniformValue(d.f32, 0);

  randomizeColor = () => {
    setCurrentColor(d.vec3f(Math.random(), Math.random(), Math.random()));
  };

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
    <main style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
      <canvas ref={ref} width='256' height='256' />
      <ColorBox color={currentColor} />
    </main>
  );
}

// #region Example controls and cleanup

import { createRoot } from 'react-dom/client';
import { useState } from 'react';
const reactRoot = createRoot(
  document.getElementById('example-app') as HTMLDivElement,
);
reactRoot.render(<App />);

export const controls = {
  'Randomize box color': {
    onButtonClick: () => {
      randomizeColor();
    },
  },
};

export function onCleanup() {
  setTimeout(() => reactRoot.unmount(), 0);
}

// #endregion
