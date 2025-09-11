<div align="center">

# @typegpu/react

🚧 **Under Construction** 🚧

</div>

# Basic usage (draft)

```ts
import { hsvToRgb } from '@typegpu/color';
import { useFrame, useRender, useUniformValue } from '@typegpu/react';

const App = (props: Props) => {
  const time = useUniformValue(d.f32, 0);
  const color = useMirroredUniform(d.vec3f, props.color);

  // Runs each frame on the CPU 🤖
  useFrame(() => {
    time.value = performance.now() / 1000;
  });

  const { ref } = useRender({
    // Runs each frame on the GPU 🌈
    fragment: ({ uv }) => {
      'kernel';
      return hsvToRgb(time.$, uv.x, uv.y) * color.$;
    },
  });

  return <canvas ref={ref} />;
};
```
