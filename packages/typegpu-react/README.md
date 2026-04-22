<div align="center">

# @typegpu/react

🚧 **Under Construction** 🚧

</div>

# Basic usage

```ts
import { d, common } from 'typegpu';
import { hsvToRgb } from '@typegpu/color';
import { useFrame, useRoot, useUniformValue, useMirroredUniform, useConfigureContext } from '@typegpu/react';

const App = (props: Props) => {
  const time = useUniformValue(d.f32, 0);
  const color = useMirroredUniform(d.vec3f, props.color);

  const root = useRoot();
  const renderPipeline = useMemo(() => root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    // Runs each frame on the GPU 🌈
    fragment: ({ uv }) => {
      'use gpu';
      return hsvToRgb(time.$, uv.x, uv.y) * color.$;
    },
  }), [root, time, color]);
  
  const { canvasRefCallback, ctxRef } = useConfigureContext({ alphaMode: 'premultiplied' });

  // Runs each frame on the CPU 🤖
  useFrame(({ elapsedSeconds }) => {
    if (!ctxRef.current) return;
    
    time.value = elapsedSeconds;
    renderPipeline.withColorAttachment({ view: ctxRef.current }).draw(3);
  });

  return <canvas ref={canvasRefCallback} />;
};
```
