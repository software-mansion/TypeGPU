/*
{
  "title": "Momentum Fluid Simulation"
}
*/

import { addElement, onFrame } from '@wigsill/example-toolkit';
import {
  type AnyWgslData,
  type WgslBindable,
  type WgslBuffer,
  arrayOf,
  createRuntime,
  f32,
  struct,
  u32,
  vec2f,
  vec4f,
  wgsl,
} from 'wigsill';

type ReadableBuffer<T extends AnyWgslData> =
  | WgslBuffer<T, 'readonly_storage'>
  | WgslBuffer<T, 'readonly_storage' | 'uniform'>
  | WgslBuffer<T, 'readonly_storage' | 'mutable_storage'>
  | WgslBuffer<T, 'readonly_storage' | 'uniform' | 'mutable_storage'>;

type MutableBuffer<T extends AnyWgslData> =
  | WgslBuffer<T, 'mutable_storage'>
  | WgslBuffer<T, 'mutable_storage' | 'uniform'>
  | WgslBuffer<T, 'mutable_storage' | 'readonly_storage'>
  | WgslBuffer<T, 'mutable_storage' | 'uniform' | 'readonly_storage'>;

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const runtime = await createRuntime();
const device = runtime.device;

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const VertexOutputStruct = struct({
  '@builtin(position) pos': vec4f,
  '@location(0) uv': vec2f,
});

const MAX_GRID_SIZE = 1024;

type GridData = typeof GridData;
const GridData = arrayOf(f32, MAX_GRID_SIZE ** 2);

let gridSize = 8;
const gridSizeBuffer = wgsl.buffer(u32).$allowUniform();
const gridSizeData = gridSizeBuffer.asUniform();

const gridAlphaBuffer = wgsl
  .buffer(GridData)
  .$allowMutableStorage()
  .$allowReadonlyStorage();

const gridBetaBuffer = wgsl
  .buffer(GridData)
  .$allowMutableStorage()
  .$allowReadonlyStorage();

const inputGridSlot = wgsl.slot<WgslBindable<GridData, 'readonly_storage'>>();
const outputGridSlot = wgsl.slot<WgslBindable<GridData, 'mutable_storage'>>();

const mainCompute = wgsl.fn()`() {
  ${outputGridSlot}[0] = 1.0;
  ${outputGridSlot}[10] = 1.0;
}`.$name('main_compute');

const mainFragment = wgsl.fn()`(index: u32) -> vec4f {
  let value: f32 = ${inputGridSlot}[index];
  return vec4f(value, f32(index) / f32(${gridSizeData}) / f32(${gridSizeData}), 0.0, 1.0);
}`.$name('main_fragment');

function makePipelines(
  inputGridBuffer: ReadableBuffer<GridData>,
  outputGridBuffer: MutableBuffer<GridData>,
) {
  const mainComputeWithIO = mainCompute
    .with(inputGridSlot, inputGridBuffer.asReadonlyStorage())
    .with(outputGridSlot, outputGridBuffer.asStorage());

  const mainFragmentWithInput = mainFragment.with(
    inputGridSlot,
    inputGridBuffer.asReadonlyStorage(),
  );

  const computePipeline = runtime.makeComputePipeline({
    workgroupSize: [1, 1],
    args: [],
    code: wgsl`
      ${mainComputeWithIO}();
    `,
  });

  const renderPipeline = runtime.makeRenderPipeline({
    vertex: {
      args: ['@builtin(vertex_index) VertexIndex: u32'],
      output: VertexOutputStruct,
      code: wgsl`
        var pos = array<vec2f, 4>(
          vec2(1, 1), // top-right
          vec2(-1, 1), // top-left
          vec2(1, -1), // bottom-right
          vec2(-1, -1) // bottom-left
        );
  
        var uv = array<vec2f, 4>(
          vec2(1., 1.), // top-right
          vec2(0., 1.), // top-left
          vec2(1., 0.), // bottom-right
          vec2(0., 0.) // bottom-left
        );
  
        var output: ${VertexOutputStruct};
        output.pos = vec4f(pos[VertexIndex].x, pos[VertexIndex].y, 0.0, 1.0);
        output.uv = uv[VertexIndex];
        return output;
      `,
    },

    fragment: {
      args: ['@builtin(position) pos: vec4f', '@location(0) uv: vec2f'],
      code: wgsl.code`
        let x = u32(uv.x * f32(${gridSizeData}));
        let y = u32(uv.y * f32(${gridSizeData}));
        let index = x + y * ${gridSizeData};
        return ${mainFragmentWithInput}(index);
      `,
      output: '@location(0) vec4f',
      target: [
        {
          format: presentationFormat,
        },
      ],
    },

    primitive: {
      topology: 'triangle-strip',
    },
  });

  return {
    compute() {
      computePipeline.execute([gridSize, gridSize]);
    },

    render() {
      const textureView = context.getCurrentTexture().createView();

      renderPipeline.execute({
        colorAttachments: [
          {
            view: textureView,
            clearValue: [0, 0, 0, 1],
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],

        vertexCount: 4,
      });
    },
  };
}

const even = makePipelines(gridAlphaBuffer, gridBetaBuffer);
const odd = makePipelines(gridBetaBuffer, gridAlphaBuffer);

let primary = even;
let paused = false;

gridSizeBuffer.write(runtime, gridSize);

onFrame(() => {
  if (!paused) {
    primary.compute();
    primary = primary === even ? odd : even;
  }

  primary.render();
  runtime.flush();
});
