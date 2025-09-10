<div align="center">

# @typegpu/react

🚧 **Under Construction** 🚧

</div>

# Basic usage (draft)

```ts
import { hsvToRgb } from '@typegpu/color';
import { useFrame, useRender, useUniformValue } from '@typegpu/react';

const App = () => {
  const time = useUniformValue(0);

  // Runs each frame on the CPU 🤖
  useFrame(() => {
    time.value = performance.now() / 1000;
  });

  const { ref } = useRender({
    // Runs each frame on the GPU 🌈
    fragment: () => {
      'kernel';
      return hsvToRgb(time.value, 1, 1);
    },
  });

  return <canvas ref={ref} />;
};
```
