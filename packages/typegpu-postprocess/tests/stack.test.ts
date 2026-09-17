import { expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d, type TgpuRoot } from 'typegpu';
import * as post from '@typegpu/postprocess';

function outputFor(root: TgpuRoot, stack: post.PostprocessStack) {
  const size = stack.outputSize;
  if (size === 'adapt') {
    throw new Error('Choose an output size for adaptive stacks.');
  }
  return root
    .createTexture({ size: [size[0], size[1]], format: 'rgba16float' })
    .$usage('render', 'sampled');
}
function renderOnce(root: TgpuRoot, stack: post.PostprocessStack) {
  stack.render({ output: outputFor(root, stack) });
}
const double = post.oneToOnePass((color) => {
  'use gpu';
  return color * 2;
});

it('fuses color transforms into the final stage of a blur', ({
  root,
  device,
  renderPassEncoder,
}) => {
  const input = root.createTexture({ size: [8, 6], format: 'rgba16float' }).$usage('sampled');
  const stackLayout = post.createStackLayout([
    post.separableGaussianBlur(),
    double,
    post.acesToneMapping(),
  ]);
  expect(stackLayout.passCount).toBe(2);
  const stack = stackLayout.instantiate({ root, input });
  const output = outputFor(root, stack);
  stack.render({ output });
  expect(renderPassEncoder.draw).toHaveBeenCalledTimes(2);
  const shaders = vi
    .mocked(root.device.createShaderModule)
    .mock.calls.map(([descriptor]) => descriptor.code);
  expect(shaders[0]).not.toContain('2.51');
  expect(shaders[1]).toContain('2.51');
  const count = device.mock.createTexture.mock.calls.length;
  stack.render({ output });
  expect(device.mock.createTexture.mock.calls).toHaveLength(count);
  expect(device.mock.createRenderPipeline).toHaveBeenCalledTimes(2);
  const inputGpu = root.unwrap(input);
  const outputGpu = root.unwrap(output);
  stack.destroy();
  stack.destroy();
  expect(inputGpu.destroy).not.toHaveBeenCalled();
  expect(outputGpu.destroy).not.toHaveBeenCalled();
  expect(() => stack.render({ output })).toThrow('destroyed');
  expect(() => {
    stack.input = input;
  }).toThrow('destroyed');
});

it('rebinds new input and resizes only affected intermediates without recompiling', ({
  root,
  device,
}) => {
  const makeInput = (width: number) =>
    root.createTexture({ size: [width, 6], format: 'rgba16float' }).$usage('sampled');
  const first = makeInput(8);
  const second = makeInput(8);
  const stack = post
    .createStackLayout([post.separableBoxBlur(), post.resampleNearest({ size: [4, 3] })])
    .instantiate({ root, input: first });
  const output = outputFor(root, stack);
  stack.render({ output });
  const groups = device.mock.createBindGroup.mock.calls.length;
  const textures = device.mock.createTexture.mock.calls.length;
  stack.input = second;
  stack.render({ output });
  expect(device.mock.createBindGroup.mock.calls.length).toBe(groups + 1);
  expect(device.mock.createTexture.mock.calls.length).toBe(textures + 1); // New caller input only.
  stack.input = makeInput(16);
  expect(stack.outputSize).toEqual([4, 3]);
  stack.render({ output });
  expect(device.mock.createRenderPipeline).toHaveBeenCalledTimes(3);
  expect(device.mock.createTexture.mock.calls.length).toBe(textures + 4); // Input and two resized intermediates.
});

it('reports new output dimensions immediately and rejects mismatches before drawing', ({
  root,
  renderPassEncoder,
}) => {
  const input = root.createTexture({ size: [8, 6], format: 'rgba16float' }).$usage('sampled');
  const stack = post.createStackLayout([double]).instantiate({ root, input });
  const output = outputFor(root, stack);
  stack.input = root.createTexture({ size: [4, 2], format: 'rgba16float' }).$usage('sampled');
  expect(stack.outputSize).toEqual([4, 2]);
  expect(() => stack.render({ output })).toThrow('output size');
  expect(renderPassEncoder.draw).not.toHaveBeenCalled();
  renderOnce(root, stack);
});

it('copies empty stacks and records into caller encoders without submitting', ({
  root,
  device,
}) => {
  const input = root
    .createTexture({ size: [4, 4], format: 'rgba16float' })
    .$usage('sampled', 'render');
  const stack = post.createStackLayout([]).instantiate({ root, input });
  const output = outputFor(root, stack);
  const encoder = root['~unstable'].createCommandEncoder();
  expect(() => stack.render({ output: input })).toThrow('distinct');
  stack.render({ output, encoder });
  expect(device.queue.submit).not.toHaveBeenCalled();
  encoder.submit();
  expect(device.queue.submit).toHaveBeenCalledTimes(1);
});

for (const resample of [post.resampleNearest, post.resampleBilinear, post.resampleBicubic]) {
  it(`${resample.name} supports fixed and adaptive output sizing`, ({ root, device }) => {
    const input = root.createTexture({ size: [8, 6], format: 'rgba16float' }).$usage('sampled');
    const fixed = post.createStackLayout([resample({ size: [3, 2] })]).instantiate({ root, input });
    expect(fixed.outputSize).toEqual([3, 2]);
    renderOnce(root, fixed);
    const adaptive = post
      .createStackLayout([resample({ size: 'adapt' })])
      .instantiate({ root, input });
    expect(adaptive.outputSize).toBe('adapt');
    for (const size of [
      [2, 3],
      [12, 9],
    ] as const) {
      adaptive.render({
        output: root.createTexture({ size: [...size], format: 'rgba8unorm' }).$usage('render'),
      });
    }
    expect(device.mock.createRenderPipeline).toHaveBeenCalledTimes(2);
    expect(() => post.createStackLayout([resample({ size: 'adapt' }), double])).toThrow(
      'last pass',
    );
  });
}

it('imports external frames, refreshes their bindings, and handles input type changes', ({
  root,
  device,
}) => {
  const frame = () => device.importExternalTexture({ source: {} as HTMLVideoElement });
  const stack = post
    .createStackLayout([double])
    .instantiate({ root, input: { texture: frame(), size: [8, 6] } });
  const output = outputFor(root, stack);
  expect(stack.passCount).toBe(2);
  stack.render({ output });
  const pipelines = device.mock.createRenderPipeline.mock.calls.length;
  const textures = device.mock.createTexture.mock.calls.length;
  const groups = device.mock.createBindGroup.mock.calls.length;
  stack.input = { texture: frame(), size: [8, 6] };
  stack.render({ output });
  expect(device.mock.createBindGroup.mock.calls.length).toBe(groups + 1);
  expect(device.mock.createRenderPipeline.mock.calls.length).toBe(pipelines);
  expect(device.mock.createTexture.mock.calls.length).toBe(textures);
  stack.input = root.createTexture({ size: [8, 6], format: 'rgba16float' }).$usage('sampled');
  expect(stack.passCount).toBe(1);
  stack.render({ output });
  expect(device.mock.createRenderPipeline.mock.calls.length).toBe(pipelines);
});

it('validates dimensions and rejects unsupported textures', ({ root }) => {
  const input = root.createTexture({ size: [8, 6], format: 'rgba16float' }).$usage('sampled');
  expect(() =>
    post.createStackLayout([post.resampleNearest({ size: [0, 2] })]).instantiate({ root, input }),
  ).toThrow('dimensions');
  const integer = root.createTexture({ size: [8, 6], format: 'rgba8uint' }).$usage('sampled');
  const stack = post.createStackLayout([]).instantiate({ root, input });
  expect(() => {
    stack.input = integer;
  }).toThrow('float-sampled');
  expect(stack.input).toBe(input);
  expect(stack.outputSize).toEqual([8, 6]);
});

it('validates blur and exposure options', () => {
  for (const radius of [-1, 1.5, NaN, Infinity, 65]) {
    for (const makeBlur of [
      post.bokehBlur,
      post.singlePassBoxBlur,
      post.separableBoxBlur,
      post.singlePassGaussianBlur,
      post.separableGaussianBlur,
    ]) {
      expect(() => makeBlur({ radius })).toThrow('radius');
    }
  }
  for (const sigma of [0, -1, NaN, Infinity]) {
    expect(() => post.singlePassGaussianBlur({ sigma })).toThrow('sigma');
    expect(() => post.separableGaussianBlur({ sigma })).toThrow('sigma');
  }
  expect(() => post.exposureToneMapping(-1)).toThrow('Exposure');
});

it('tone curves preserve alpha and have expected numerical values', () => {
  expect(post.reinhardToneMapping().callback(d.vec4f(0, 1, 3, 0.25))).toEqual(
    d.vec4f(0, 0.5, 0.75, 0.25),
  );
  const aces = post.acesToneMapping().callback(d.vec4f(0, 1, 100, 0.5));
  expect(aces.x).toBe(0);
  expect(aces.y).toBeCloseTo(0.803797);
  expect(aces.z).toBe(1);
  expect(aces.a).toBe(0.5);
  expect(post.exposureToneMapping(0).callback(d.vec4f(1, 2, 3, 0.75))).toEqual(
    d.vec4f(0, 0, 0, 0.75),
  );
});

for (const makeBlur of [
  post.bokehBlur,
  post.singlePassGaussianBlur,
  post.separableGaussianBlur,
  post.singlePassBoxBlur,
  post.separableBoxBlur,
]) {
  for (const gpuCallback of [false, true]) {
    it(`${makeBlur.name} reads a nested uniform via a ${gpuCallback ? 'GPU' : 'plain'} callback without rebuilding`, ({
      root,
      device,
    }) => {
      const settings = root.createUniform(
        d.struct({ effects: d.struct({ blur: d.struct({ radius: d.i32 }) }) }),
        {
          effects: { blur: { radius: 2 } },
        },
      );
      const radius = gpuCallback
        ? () => {
            'use gpu';
            return settings.$.effects.blur.radius;
          }
        : () => settings.$.effects.blur.radius;
      const input = root.createTexture({ size: [8, 6], format: 'rgba16float' }).$usage('sampled');
      const renderer = post
        .createStackLayout([
          makeBlur({
            radius,
          }),
        ])
        .instantiate({ root, input });
      const output = outputFor(root, renderer);
      renderer.render({ output });
      const shaders = vi
        .mocked(root.device.createShaderModule)
        .mock.calls.map(([descriptor]) => descriptor.code);
      for (const shader of shaders) {
        expect(shader).toContain('var<uniform>');
        expect(shader).toContain('.effects.blur.radius');
      }
      const pipelineCount = device.mock.createRenderPipeline.mock.calls.length;
      const textureCount = device.mock.createTexture.mock.calls.length;
      settings.patch({ effects: { blur: { radius: 5 } } });
      renderer.render({ output });
      expect(device.mock.createShaderModule.mock.calls).toHaveLength(shaders.length);
      expect(device.mock.createRenderPipeline.mock.calls).toHaveLength(pipelineCount);
      expect(device.mock.createTexture.mock.calls).toHaveLength(textureCount);
    });
  }
}

it('accepts a uniform directly or a callback reading an accessor, while constants need no uniform', ({
  root,
  device,
}) => {
  const input = root.createTexture({ size: [4, 4], format: 'rgba16float' }).$usage('sampled');
  const uniform = root.createUniform(d.i32, 3);
  const radiusAccess = tgpu.accessor(d.i32, uniform);
  renderOnce(
    root,
    post
      .createStackLayout([post.separableGaussianBlur({ radius: uniform })])
      .instantiate({ root, input }),
  );
  renderOnce(
    root,
    post
      .createStackLayout([
        post.singlePassBoxBlur({
          radius: () => radiusAccess.$,
        }),
      ])
      .instantiate({ root, input }),
  );
  device.mock.createShaderModule.mockClear();
  renderOnce(
    root,
    post
      .createStackLayout([post.singlePassGaussianBlur({ radius: 3 })])
      .instantiate({ root, input }),
  );
  const code = vi
    .mocked(root.device.createShaderModule)
    .mock.calls.map(([descriptor]) => descriptor.code)
    .join('\n');
  expect(code).not.toContain('var<uniform>');
  expect(code).toContain('const radius = 3i;');
});

it('snapshots external dimensions and updates output size on frame-size changes', ({
  root,
  device,
}) => {
  const dimensions: [number, number] = [8, 6];
  const texture = device.importExternalTexture({ source: {} as HTMLVideoElement });
  const stack = post
    .createStackLayout([])
    .instantiate({ root, input: { texture, size: dimensions } });
  const output = outputFor(root, stack);
  stack.render({ output });
  dimensions[0] = 16;
  expect(stack.outputSize).toEqual([8, 6]);
  stack.input = { texture, size: dimensions };
  expect(stack.outputSize).toEqual([16, 6]);
  expect(() => stack.render({ output })).toThrow('output size');
  renderOnce(root, stack);
  expect(device.mock.createRenderPipeline).toHaveBeenCalledTimes(2);
});

it('caches final pipelines by output format and accepts resampler shorthand', ({
  root,
  device,
}) => {
  const input = root.createTexture({ size: [4, 4], format: 'rgba16float' }).$usage('sampled');
  const stack = post
    .createStackLayout([post.resampleBilinear('adapt')])
    .instantiate({ root, input });
  for (const format of ['rgba8unorm', 'rgba16float', 'rgba8unorm'] as const) {
    stack.render({ output: root.createTexture({ size: [8, 8], format }).$usage('render') });
  }
  expect(device.mock.createRenderPipeline).toHaveBeenCalledTimes(2);
  expect(
    post.createStackLayout([post.resampleBicubic([2, 3])]).instantiate({ root, input }).outputSize,
  ).toEqual([2, 3]);
});

it('bokeh specializes a constant radius and fuses following tone mapping into one draw', ({
  root,
  device,
  renderPassEncoder,
}) => {
  const input = root.createTexture({ size: [8, 6], format: 'rgba16float' }).$usage('sampled');
  const stackLayout = post.createStackLayout([
    post.bokehBlur({ radius: 3 }),
    post.acesToneMapping(),
  ]);
  expect(stackLayout.passCount).toBe(1);
  const stack = stackLayout.instantiate({ root, input });
  renderOnce(root, stack);
  expect(renderPassEncoder.draw).toHaveBeenCalledTimes(1);
  const code = vi.mocked(device.createShaderModule).mock.calls[0]?.[0].code;
  expect(code).toContain('const radius = 3i;');
  expect(code).not.toContain('var<uniform>');
  expect(code).toContain('2.51');
});
