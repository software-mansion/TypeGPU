import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { Canvas, Pass } from '@typegpu/react';

const meshLayout = tgpu.bindGroupLayout({
  modelMatrix: { uniform: d.mat4x4f },
  albedo: { uniform: d.vec3f },
  tint: { uniform: d.vec3f },
});

const vertex = ({ pos }: { pos: d.v3f }) => {
  'kernel';
  return meshLayout.$.modelMatrix.mul(d.vec4f(pos, 1));
};

const fragment = () => {
  'kernel';
  return d.vec4f(meshLayout.$.tint, 1);
};

export function Monkey({ albedo, pos }: { albedo: d.v3f, pos: d.v3f }) {
  // const monkeyMesh = useMonkeyMesh();
  // const modelMatrix = useMemo(() => mat4.translation(pos, d.mat4x4f()), []);
  
  // Optional bindings
  // const bindings = useMemo(() => ([
  //   [fooSlot, 123],
  //   [(cfg: Configurable) => /* ... */],
  //   // ...
  // ]), []);
  
  return (
    // <Config bindings={bindings}>
    //   <RenderPipeline vertex={vertex} fragment={fragment} attributes={monkeyMesh.layout.attrib}>
    //     {/* things provided after the pipeline is created */}
        
    //     {/* the entries are passed into the shader as automatically created resources */}
    //     <BindGroup layout={meshLayout} entries={{ modelMatrix, albedo }} />
    //     {/* monkeyMesh has 'layout' and 'buffer' properties, which fit this component */}
    //     <VertexBuffer {...monkeyMesh} />
    //   </RenderPipeline>
    // </Config>
    <div style={{ width: "200px", height: "200px", backgroundColor: `rgb(${albedo.x * 255}, ${albedo.y * 255}, ${albedo.z * 255})` }}>Monkey at {`(${pos.x}, ${pos.y}, ${pos.z})`}</div>
  );
}

export function App() {
  return (
    <Canvas>
      <Pass schedule="frame">
        <Monkey pos={d.vec3f(0, 0, 0)} albedo={d.vec3f(1, 0, 0)} />
        <Monkey pos={d.vec3f(1, 0, 0)} albedo={d.vec3f(0, 0, 1)} />
        {/* ... */}
      </Pass>
    </Canvas>
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
