/*
{
  "title": "Momentum Fluid Simulation"
}
*/

import { addElement, onCleanup, onFrame } from '@wigsill/example-toolkit';
import {
  type AnyWgslData,
  type WgslBindable,
  type WgslBuffer,
  arrayOf,
  createRuntime,
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

// const randSeed = wgsl.var(vec2f).$name('rand_seed');

// const setupRandomSeed = wgsl.fn('setup_random_seed')`(coord: vec2f) {
//   ${randSeed} = coord;
// }`;

// /**
//  * Yoinked from https://www.cg.tuwien.ac.at/research/publications/2023/PETER-2023-PSW/PETER-2023-PSW-.pdf
//  * "Particle System in WebGPU" by Benedikt Peter
//  */
// const rand01 = wgsl.fn('rand01')`() -> f32 {
//   ${randSeed}.x = fract(cos(dot(${randSeed}, vec2<f32>(23.14077926, 232.61690225))) * 136.8168);
//   ${randSeed}.y = fract(cos(dot(${randSeed}, vec2<f32>(54.47856553, 345.84153136))) * 534.7645);
//   return ${randSeed}.y;
// }`;

// const randInCircle = wgsl.fn('rand_in_circle')`() -> vec2f {
//   let radius = sqrt(${rand01}());
//   let angle = ${rand01}() * ${Math.PI * 2};

//   return vec2f(
//     cos(angle) * radius,
//     sin(angle) * radius,
//   );
// }`;

type GridData = typeof GridData;
const GridData = arrayOf(vec4f, MAX_GRID_SIZE ** 2);

const gridSize = 32;
const gridSizeBuffer = wgsl.buffer(u32).$allowUniform();
const gridSizeData = gridSizeBuffer.asUniform();

const gridAlphaBuffer = wgsl
  .buffer(GridData)
  .$allowMutableStorage()
  .$allowReadonlyStorage();

const gridAlphaMutable = gridAlphaBuffer.asStorage();

const gridBetaBuffer = wgsl
  .buffer(GridData)
  .$allowMutableStorage()
  .$allowReadonlyStorage();

const gridBetaMutable = gridBetaBuffer.asStorage();

const inputGridSlot = wgsl.slot<WgslBindable<GridData, 'readonly_storage'>>();
const outputGridSlot = wgsl.slot<WgslBindable<GridData, 'mutable_storage'>>();

const initWorldPipeline = runtime.makeComputePipeline({
  workgroupSize: [1, 1],
  args: ['@builtin(global_invocation_id)  global_id: vec3<u32>'],
  code: wgsl`
    let x = global_id.x;
    let y = global_id.y;
    let index = x + y * ${gridSizeData};
    
    var value = vec4f(0., 0., 0., 0.);

    if (x != 0 && y != 0 && x != ${gridSizeData} - 1 && y != ${gridSizeData} - 1) {
      // ^ leaving a 1-cell border around the world.

      if (y < ${gridSizeData} / 2 && x < ${gridSizeData} / 2) {
        value = vec4f(0., 0., 1., 0.);
      }
    }

    ${gridAlphaMutable}[index] = value;
    ${gridBetaMutable}[index] = value;
  `,
});

const getCell = wgsl.fn()`(x: u32, y: u32) -> vec4f {
  let index = x + y * ${gridSizeData};
  return ${inputGridSlot}[index];
}`.$name('get_cell');

const flowFromCell = wgsl.fn()`(my_x: u32, my_y: u32, x: u32, y: u32) -> f32 {
  let cell = ${getCell}(x, y);
  var dir = cell.xy;
  let mag = length(cell.xy);
  if (mag > 1.) {
    dir = normalize(dir);
  }

  let dest = vec2f(f32(x), f32(y)) + dir;
  if (dest.x < 0. || dest.y < 0.) {
    return 0.;
  }

  if (u32(dest.x) == my_x && u32(dest.y) == my_y) {
    return cell.z;
  }

  return 0.;
}`.$name('flow_from_cell');

const isValidFlowOut = wgsl.fn()`(x: f32, y: f32) -> bool {
  if (x >= f32(${gridSizeData}) - 1.) {
    return false;
  }

  if (x <= 1.) {
    return false;
  }

  if (y >= f32(${gridSizeData}) - 1.) {
    return false;
  }

  if (y <= 1.) {
    return false;
  }

  return true;
}`.$name('is_valid_flow_out');

const mainCompute = wgsl.fn()`(x: u32, y: u32) {
  let index = x + y * ${gridSizeData};

  let prev = ${inputGridSlot}[index];
  let nw = ${getCell}(x - 1, y + 1);
  let ne = ${getCell}(x + 1, y + 1);
  let se = ${getCell}(x + 1, y - 1);
  let sw = ${getCell}(x - 1, y - 1);

  let n = ${getCell}(x, y + 1);
  let s = ${getCell}(x, y - 1);
  let e = ${getCell}(x + 1, y);
  let w = ${getCell}(x - 1, y);

  var next = prev;

  // Computing density gradient
  var velocity = vec2f(0., 0.);
  velocity -= (nw.z - prev.z) * vec2f(-1., 1.);
  velocity -= (ne.z - prev.z) * vec2f(1., 1.);
  velocity -= (se.z - prev.z) * vec2f(1., -1.);
  velocity -= (sw.z - prev.z) * vec2f(-1., -1.);
  velocity -= (n.z - prev.z) * vec2f(0., 1.);
  velocity -= (s.z - prev.z) * vec2f(0., -1.);
  velocity -= (e.z - prev.z) * vec2f(1., 0.);
  velocity -= (w.z - prev.z) * vec2f(-1., 0.);

  if (!${isValidFlowOut}(f32(x) + velocity.x, f32(y) + velocity.y)) {
    velocity.y = 0.;
  }

  // checking again
  if (!${isValidFlowOut}(f32(x) + velocity.x, f32(y) + velocity.y)) {
    velocity.x = 0.;
  }

  next.x = velocity.x;
  next.y = velocity.y;

  // Processing in-flow

  next.z = 0.;
  next.z += ${flowFromCell}(x, y, x, y);
  next.z += ${flowFromCell}(x, y, x - 1, y + 1);
  next.z += ${flowFromCell}(x, y, x + 1, y + 1);
  next.z += ${flowFromCell}(x, y, x + 1, y - 1);
  next.z += ${flowFromCell}(x, y, x - 1, y - 1);
  next.z += ${flowFromCell}(x, y, x, y + 1);
  next.z += ${flowFromCell}(x, y, x, y - 1);
  next.z += ${flowFromCell}(x, y, x + 1, y);
  next.z += ${flowFromCell}(x, y, x - 1, y);

  ${outputGridSlot}[index] = next;
}`.$name('main_compute');

const mainFragment = wgsl.fn()`(index: u32) -> vec4f {
  let cell = ${inputGridSlot}[index];
  let velocity = cell.xy;
  let density = cell.z;
  let spread = cell.w;

  return vec4f(0., max(0., density - 1.), density, 1.0);
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
    args: ['@builtin(global_invocation_id)  global_id: vec3<u32>'],
    code: wgsl`
      ${mainComputeWithIO}(global_id.x + 1, global_id.y + 1);
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
      computePipeline.execute([gridSize - 2, gridSize - 2]);
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
const paused = false;

gridSizeBuffer.write(runtime, gridSize);
initWorldPipeline.execute([gridSize, gridSize]);

let msSinceLastTick = 0;
const timestep = 100;

function tick() {
  if (!paused) {
    primary.compute();
    primary = primary === even ? odd : even;
  }

  primary.render();
}

async function computeTotalDensity() {
  const grid = await gridAlphaBuffer.read(runtime);
  return grid.reduce((acc, cell) => acc + cell[2], 0);
}

onFrame((deltaTime) => {
  msSinceLastTick += deltaTime;

  if (msSinceLastTick >= timestep) {
    if (!paused) {
      tick();
    }
    msSinceLastTick -= timestep;
  }

  runtime.flush();
});

const debugInterval = setInterval(async () => {
  console.log('Total density', await computeTotalDensity());
}, 1000);

onCleanup(() => {
  clearInterval(debugInterval);

  // TODO: Cleanup runtime
});
