<div align="center">

# @typegpu/react

</div>

[Getting Started / Documentation](https://typegpu.com/ecosystem/typegpu-react)

# Basic usage

```ts
import { d, common } from 'typegpu';
import { hsvToRgb } from '@typegpu/color';
import { useFrame, useRoot, useUniform, useMirroredUniform, useConfigureContext } from '@typegpu/react';

const App = (props: Props) => {
  const time = useUniform(d.f32);
  const color = useMirroredUniform(d.vec3f, props.color);

  const root = useRoot();
  const renderPipeline = useMemo(
    () =>
      root.createRenderPipeline({
        vertex: common.fullScreenTriangle,
        // Executed per pixel on the GPU 🌈
        fragment: ({ uv }) => {
          'use gpu';
          return hsvToRgb(time.$, uv.x, uv.y) * color.$;
        },
      }),
    [root, time, color]
  );
  
  const { ref, ctxRef } = useConfigureContext();

  // Runs each frame on the CPU 🤖
  useFrame(({ elapsedSeconds }) => {
    if (!ctxRef.current) return;
    
    time.write(elapsedSeconds);
    
    renderPipeline.withColorAttachment({ view: ctxRef.current }).draw(3);
  });

  return <canvas ref={ref} className="absolute inset-0" />;
};
```

# React Native

The `@typegpu/react/react-native-worklets` entrypoint lets per-frame GPU work run on the UI thread.
TypeGPU resources captured by worklets are transferred between runtimes automatically.
See the [React Native Worklets guide](https://typegpu.com/integration/react-native/worklets).

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).
