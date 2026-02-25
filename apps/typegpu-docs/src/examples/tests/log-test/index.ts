import tgpu, { d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init({
  unstable_logOptions: {
    logCountLimit: 40,
    logSizeLimit: 128,
  },
  device: {
    optionalFeatures: ['shader-f16'],
  },
});

// setup for render tests
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const mainVertex = tgpu.vertexFn({
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

const mainFragment = tgpu.fragmentFn({
  in: { pos: d.builtin.position },
  out: d.vec4f,
})(({ pos }) => {
  console.log('X:', pos.x, 'Y:', pos.y);
  return d.vec4f(0.769, 0.392, 1.0, 1);
});

// #region Example controls and cleanup

export const controls = defineControls({
  'One argument': {
    onButtonClick: () =>
      root.createGuardedComputePipeline(() => {
        'use gpu';
        console.log(d.u32(321));
      }).dispatchThreads(),
  },
  'Multiple arguments': {
    onButtonClick: () =>
      root.createGuardedComputePipeline(() => {
        'use gpu';
        console.log(1, d.vec3u(2, 3, 4), 5, 6);
      }).dispatchThreads(),
  },
  'String literals': {
    onButtonClick: () =>
      root.createGuardedComputePipeline(() => {
        'use gpu';
        console.log(2, 'plus', 3, 'equals', 5);
      }).dispatchThreads(),
  },
  'Two logs': {
    onButtonClick: () =>
      root.createGuardedComputePipeline(() => {
        'use gpu';
        console.log('First log.');
        console.log('Second log.');
      }).dispatchThreads(),
  },
  'Different types': {
    onButtonClick: () =>
      root.createGuardedComputePipeline(() => {
        'use gpu';
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
        // oxfmt-ignore
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
      }).dispatchThreads(),
  },
  'Compound types': {
    onButtonClick: () => {
      const SimpleStruct = d.struct({ vec: d.vec3u, num: d.u32 });
      const ComplexStruct = d.struct({ nested: SimpleStruct, bool: d.bool });
      const SimpleArray = d.arrayOf(d.u32, 2);
      const ComplexArray = d.arrayOf(SimpleArray, 3);

      root.createGuardedComputePipeline(() => {
        'use gpu';
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
      }).dispatchThreads();
    },
  },
  'Two threads': {
    onButtonClick: () =>
      root.createGuardedComputePipeline((x) => {
        'use gpu';
        console.log('Log from thread', x);
      }).dispatchThreads(2),
  },
  '100 dispatches': {
    onButtonClick: async () => {
      const indexUniform = root.createUniform(d.u32);
      const test = root.createGuardedComputePipeline(() => {
        'use gpu';
        console.log('Log from dispatch', indexUniform.$);
      });
      for (let i = 0; i < 100; i++) {
        indexUniform.write(i);
        test.dispatchThreads();
      }
    },
  },
  'Varying size logs': {
    onButtonClick: async () => {
      const logCountUniform = root.createUniform(d.u32);
      const test = root.createGuardedComputePipeline(() => {
        'use gpu';
        for (let i = d.u32(); i < logCountUniform.$; i++) {
          console.log('Log index', i + 1, 'out of', logCountUniform.$);
        }
      });
      logCountUniform.write(3);
      test.dispatchThreads();
      logCountUniform.write(1);
      test.dispatchThreads();
    },
  },
  'String interpolation': {
    onButtonClick: async () =>
      root.createGuardedComputePipeline(() => {
        'use gpu';
        console.log(
          'The values %d, %f and %s were interpolated in this message.',
          987,
          1.26,
          d.vec4f(1, 2, 3, 4),
        );
        console.log(
          'TypeGPU resources can be used as strings (%s) or objects (%o).',
          d.vec3f(1, 2, 3),
          d.vec3f(1, 2, 3),
          'This sentence is the fourth argument of the log.',
        );
      }).dispatchThreads(),
  },
  'Different log functionalities': {
    onButtonClick: async () =>
      root.createGuardedComputePipeline(() => {
        'use gpu';
        console.log('This message should be cleared.');
        console.clear();
        console.log('This is a log message.', 'Index:', 1);
        console.debug('This is a debug message.', 'Index:', 2);
        console.info('This is an info message.', 'Index:', 3);
        console.warn('This is a warn message.', 'Index:', 4);
        console.error('This is an error message.', 'Index:', 5);
      }).dispatchThreads(),
  },
  'Render pipeline': {
    onButtonClick: () => {
      const context = root.configureContext({
        canvas,
        alphaMode: 'premultiplied',
      });

      const pipeline = root.createRenderPipeline({
        vertex: mainVertex,
        fragment: mainFragment,
      });

      pipeline
        .withColorAttachment({ view: context })
        .draw(3);
    },
  },
  'Draw indexed': {
    onButtonClick: () => {
      const pipeline = root.createRenderPipeline({
        vertex: mainVertex,
        fragment: mainFragment,
      });

      const indexBuffer = root
        .createBuffer(d.arrayOf(d.u32, 3), [0, 1, 2])
        .$usage('index');

      pipeline
        .withIndexBuffer(indexBuffer)
        .withColorAttachment({ view: context })
        .drawIndexed(3);
    },
  },
  'Too many logs': {
    onButtonClick: () =>
      root.createGuardedComputePipeline((x) => {
        'use gpu';
        console.log('Log 1 from thread', x);
        console.log('Log 2 from thread', x);
        console.log('Log 3 from thread', x);
      }).dispatchThreads(16),
  },
});

export function onCleanup() {
  root.destroy();
}

// #endregion
