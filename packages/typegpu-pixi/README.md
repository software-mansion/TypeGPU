<div align="center">

# @typegpu/pixi

</div>

A helper library for using TypeGPU with [PixiJS](https://pixijs.com) and [PixiJS 3D](https://pixijs.com/3d).
Write filters, material shader bits and post effects as TypeGPU functions, and get WGSL for PixiJS's WebGPU renderer
and GLSL for its WebGL renderer from the same code. `getRoot` gives you a TypeGPU root on the device PixiJS draws with.

```ts
import * as tp from '@typegpu/pixi';
import { d, std } from 'typegpu';

const wobbleUniforms = tp.uniforms({ time: d.f32, strength: d.f32 });

// A PixiJS filter, written as a TypeGPU function
const wobble = tp.createFilter(app.renderer, {
  uniforms: wobbleUniforms,
  fragment: ({ uv }) => {
    'use gpu';
    const offset = std.sin(uv.y * 40 + wobbleUniforms.$.time) * wobbleUniforms.$.strength;
    return tp.sampleInput(uv + d.vec2f(offset, 0));
  },
});

sprite.filters = [wobble];
wobbleUniforms.write(wobble, { strength: 0.01 });
```

```ts
import { Material3D } from '@pixi/3d';
import * as p3d from '@typegpu/pixi/3d';
import { d, std } from 'typegpu';

const contourUniforms = p3d.uniforms({ lowColor: d.vec3f, highColor: d.vec3f, frequency: d.f32 });

// A PixiJS 3D shader bit, which paints a material in bands of two colours by height
const contourBit = p3d.shaderBit({
  name: 'contour',
  uniforms: contourUniforms,
  fragment: {
    material: () => {
      'use gpu';
      const wave = std.sin(p3d.fragment.worldPosition.$.y * contourUniforms.$.frequency - p3d.time.$ * 2);
      const color = std.mix(contourUniforms.$.lowColor, contourUniforms.$.highColor, std.step(0, wave));
      p3d.fragment.albedo.$ *= color;
    },
  },
});

const ground = new Material3D({ roughness: 0.6, extraBits: [contourBit] });
contourUniforms.write(ground, { lowColor: d.vec3f(0.03, 0.2, 0.03), highColor: d.vec3f(1), frequency: 4 });
```

Read more in the [documentation](https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-pixi/).

## TypeGPU is created by Software Mansion

[![swm](https://logo.swmansion.com/logo?color=white&variant=desktop&width=150&tag=typegpu-github 'Software Mansion')](https://swmansion.com)

Since 2012 [Software Mansion](https://swmansion.com) is a software agency with
experience in building web and mobile apps. We are Core React Native
Contributors and experts in dealing with all kinds of React Native issues. We
can help you build your next dream product –
[Hire us](https://swmansion.com/contact/projects?utm_source=typegpu&utm_medium=readme).
