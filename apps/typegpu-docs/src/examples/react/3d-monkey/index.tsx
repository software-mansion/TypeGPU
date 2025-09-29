import { useEffect, useState } from 'react';
import {
  useFrame,
  useMirroredUniform,
  useRoot,
  useUniformValue,
} from '@typegpu/react';
import * as d from 'typegpu/data';
import * as m from 'wgpu-matrix';
import { loadModel, type Model } from './load-model.ts';
import { Uniforms } from './schemas.ts';
import { MonkeyRenderer } from './monkey-renderer.tsx';

let changeMonkeyColor: () => void;

function App() {
  const root = useRoot();
  const [model, setModel] = useState<Model | null>(null);
  const [currentModelColor, setCurrentModelColor] = useState(
    d.vec3f(1.0, 0.5, 0.2),
  ); // initial color - orange

  changeMonkeyColor = () => {
    setCurrentModelColor(d.vec3f(Math.random(), Math.random(), Math.random()));
  };

  const time = useUniformValue(d.f32, 0);
  const modelColor = useMirroredUniform(d.vec3f, currentModelColor);
  const uniforms = useUniformValue(Uniforms);

  // Model loading
  useEffect(() => {
    loadModel(root, '/TypeGPU/assets/3d-monkey/monkey.obj').then(setModel);
  }, [root]);

  // Animation loop
  useFrame(() => {
    time.value = performance.now() / 1000;
    const modelMatrix = m.mat4.rotationY(time.value, d.mat4x4f());
    m.mat4.scale(modelMatrix, [0.5, 0.5, 0.5], modelMatrix);

    const viewMatrix = m.mat4.lookAt([0, 0, -3], [0, 0, 0], [0, 1, 0]);
    const projectionMatrix = m.mat4.perspective(Math.PI / 4, 16 / 9, 0.1, 100);
    const viewProjectionMatrix = m.mat4.multiply(
      projectionMatrix,
      viewMatrix,
      d.mat4x4f(),
    );

    uniforms.value = { modelMatrix, viewProjectionMatrix };
  });

  return (
    <div>
      {model
        ? (
          <MonkeyRenderer
            model={model}
            uniforms={uniforms}
            modelColor={modelColor}
          />
        )
        : <div>Loading...</div>}
    </div>
  );
}

// #region Example controls and cleanup

import { createRoot } from 'react-dom/client';

const reactRoot = createRoot(
  document.getElementById('example-app') as HTMLDivElement,
);
reactRoot.render(<App />);

export const controls = {
  'Monkey color': {
    onButtonClick: () => {
      changeMonkeyColor();
    },
  },
};

export function onCleanup() {
  setTimeout(() => reactRoot.unmount(), 0);
}

// #endregion
