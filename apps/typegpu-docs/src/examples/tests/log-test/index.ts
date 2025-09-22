import tgpu, { prepareDispatch } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const root = await tgpu.init({
  unstable_logOptions: {
    logCountLimit: 40,
    logSizeLimit: 128,
  },
  device: {
    optionalFeatures: ['shader-f16'],
  },
});

// #region Example controls and cleanup

export const controls = {
  'One argument': {
    onButtonClick: () =>
      prepareDispatch(root, () => {
        'kernel';
        console.log(d.u32(321));
      })(),
  },
  'Multiple arguments': {
    onButtonClick: () =>
      prepareDispatch(root, () => {
        'kernel';
        console.log(d.u32(1), d.vec3u(2, 3, 4), d.u32(5), d.u32(6));
      })(),
  },
  'String literals': {
    onButtonClick: () =>
      prepareDispatch(root, () => {
        'kernel';
        console.log(d.u32(2), 'plus', d.u32(3), 'equals', d.u32(5));
      })(),
  },
  'Two logs': {
    onButtonClick: () =>
      prepareDispatch(root, () => {
        'kernel';
        console.log('First log.');
        console.log('Second log.');
      })(),
  },
  'Different types': {
    onButtonClick: () =>
      prepareDispatch(root, () => {
        'kernel';
        console.log('--- scalars ---');
        console.log(d.f32(3.14));
        console.log(d.i32(-2_000_000_000));
        console.log(d.u32(3_000_000_000));
        console.log(d.bool(true));
        console.log();
        console.log('--- vectors ---');
        console.log(d.vec2f(1.1, -2.2));
        console.log(d.vec3f(10.1, -20.2, 30.3));
        console.log(d.vec4f(100.1, -200.2, 300.3, -400.4));
        console.log();
        console.log(d.vec2i(-1, -2));
        console.log(d.vec3i(-1, -2, -3));
        console.log(d.vec4i(-1, -2, -3, -4));
        console.log();
        console.log(d.vec2u(1, 2));
        console.log(d.vec3u(1, 2, 3));
        console.log(d.vec4u(1, 2, 3, 4));
        console.log();
        console.log(d.vec2b(true, false));
        console.log(d.vec3b(true, false, true));
        console.log(d.vec4b(true, false, true, false));
        console.log();
        console.log('--- matrices ---');
        console.log(d.mat2x2f(0, 0.25, 0.5, 0.75));
        console.log(d.mat3x3f(0, 0.25, 0.5, 1, 1.25, 1.5, 2, 2.25, 2.5));
        // deno-fmt-ignore
        console.log(d.mat4x4f(0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75));
        console.log();
        if (std.extensionEnabled('f16')) {
          console.log('--- f16 ---');
          console.log(d.f16(3.14));
          console.log(d.vec2h(1.1, -2.2));
          console.log(d.vec3h(10.1, -20.2, 30.3));
          console.log(d.vec4h(100.1, -200.2, 300.3, -400.4));
        } else {
          console.log("The 'shader-f16' flag is not enabled.");
        }
      })(),
  },
  'Compound types': {
    onButtonClick: () => {
      const SimpleStruct = d.struct({ vec: d.vec3u, num: d.u32 });
      const ComplexStruct = d.struct({ nested: SimpleStruct, bool: d.bool });
      const SimpleArray = d.arrayOf(d.u32, 2);
      const ComplexArray = d.arrayOf(SimpleArray, 3);

      prepareDispatch(root, () => {
        'kernel';
        const simpleStruct = SimpleStruct({ vec: d.vec3u(1, 2, 3), num: 4 });
        console.log(simpleStruct);

        const complexStruct = ComplexStruct({
          nested: simpleStruct,
          bool: true,
        });
        console.log(complexStruct);

        const simpleArray = SimpleArray([1, 2]);
        console.log(simpleArray);

        const complexArray = ComplexArray([[3, 4], [5, 6], [7, 8]]);
        console.log(complexArray);
      })();
    },
  },
  'Two threads': {
    onButtonClick: () =>
      prepareDispatch(root, (x) => {
        'kernel';
        console.log('Log from thread', x);
      })(2),
  },
  '100 dispatches': {
    onButtonClick: async () => {
      const indexUniform = root.createUniform(d.u32);
      const dispatch = prepareDispatch(root, () => {
        'kernel';
        console.log('Log from dispatch', indexUniform.$);
      });
      for (let i = 0; i < 100; i++) {
        indexUniform.write(i);
        dispatch();
        console.log(`dispatched ${i}`);
      }
    },
  },
  'Varying size logs': {
    onButtonClick: async () => {
      const logCountUniform = root.createUniform(d.u32);
      const dispatch = prepareDispatch(root, () => {
        'kernel';
        for (let i = d.u32(); i < logCountUniform.$; i++) {
          console.log('Log index', d.u32(i) + 1, 'out of', logCountUniform.$);
        }
      });
      logCountUniform.write(3);
      dispatch();
      logCountUniform.write(1);
      dispatch();
    },
  },
  'Render pipeline': {
    onButtonClick: () => {
      const mainVertex = tgpu['~unstable'].vertexFn({
        in: { vertexIndex: d.builtin.vertexIndex },
        out: { pos: d.builtin.position },
      })((input) => {
        const positions = [
          d.vec2f(0, 0.5),
          d.vec2f(-0.5, -0.5),
          d.vec2f(0.5, -0.5),
        ];

        return { pos: d.vec4f(positions[input.vertexIndex], 0, 1) };
      });

      const mainFragment = tgpu['~unstable'].fragmentFn({
        in: { pos: d.builtin.position },
        out: d.vec4f,
      })(({ pos }) => {
        console.log('X:', d.u32(pos.x), 'Y:', d.u32(pos.y));
        return d.vec4f(0.769, 0.392, 1.0, 1);
      });

      const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const context = canvas.getContext('webgpu') as GPUCanvasContext;

      context.configure({
        device: root.device,
        format: presentationFormat,
        alphaMode: 'premultiplied',
      });

      const pipeline = root['~unstable']
        .withVertex(mainVertex, {})
        .withFragment(mainFragment, { format: presentationFormat })
        .createPipeline();

      pipeline
        .withColorAttachment({
          view: context.getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 0],
          loadOp: 'clear',
          storeOp: 'store',
        })
        .draw(3);
    },
  },
  'Too many logs': {
    onButtonClick: () =>
      prepareDispatch(root, (x) => {
        'kernel';
        console.log('Log 1 from thread', x);
        console.log('Log 2 from thread', x);
        console.log('Log 3 from thread', x);
      })(16),
  },
  'Too much data': {
    onButtonClick: () => {
      const dispatch = prepareDispatch(root, () => {
        'kernel';
        console.log(d.mat4x4f(), d.mat4x4f(), 1);
      });
      try {
        dispatch();
      } catch (err) {
        console.log(err);
      }
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
