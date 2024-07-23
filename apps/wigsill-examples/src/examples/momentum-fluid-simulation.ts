/*
{
  "title": "Momentum Fluid Simulation"
}
*/

import {
  addElement,
  addParameter,
  onCleanup,
  onFrame,
} from '@wigsill/example-toolkit';
import {
  type AnyWgslData,
  type Parsed,
  type WgslBindable,
  type WgslBuffer,
  arrayOf,
  createRuntime,
  f32,
  struct,
  u32,
  vec2f,
  vec2u,
  vec4f,
  wgsl,
} from 'wigsill';

// type ReadableBuffer<T extends AnyWgslData> =
//   | WgslBuffer<T, 'readonly_storage'>
//   | WgslBuffer<T, 'readonly_storage' | 'uniform'>
//   | WgslBuffer<T, 'readonly_storage' | 'mutable_storage'>
//   | WgslBuffer<T, 'readonly_storage' | 'uniform' | 'mutable_storage'>;

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

const randSeed = wgsl.var(vec2f).$name('rand_seed');

const setupRandomSeed = wgsl.fn('setup_random_seed')`(coord: vec2f) {
  ${randSeed} = coord;
}`;

/**
 * Yoinked from https://www.cg.tuwien.ac.at/research/publications/2023/PETER-2023-PSW/PETER-2023-PSW-.pdf
 * "Particle System in WebGPU" by Benedikt Peter
 */
const rand01 = wgsl.fn('rand01')`() -> f32 {
  ${randSeed}.x = fract(cos(dot(${randSeed}, vec2<f32>(23.14077926, 232.61690225))) * 136.8168);
  ${randSeed}.y = fract(cos(dot(${randSeed}, vec2<f32>(54.47856553, 345.84153136))) * 534.7645);
  return ${randSeed}.y;
}`;

type GridData = typeof GridData;
const GridData = arrayOf(vec4f, MAX_GRID_SIZE ** 2);

type BoxObstacle = typeof BoxObstacle;
const BoxObstacle = struct({
  center: vec2u,
  size: vec2u,
  enabled: u32,
});

const gridSize = 128;
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

const inPlaceGridSlot = wgsl
  .slot<WgslBindable<GridData, 'mutable_storage'>>()
  .$name('in_place_grid');
const inputGridSlot = wgsl.slot<WgslBindable<GridData>>().$name('input_grid');
const outputGridSlot = wgsl
  .slot<WgslBindable<GridData, 'mutable_storage'>>()
  .$name('output_grid');

const MAX_OBSTACLES = 4;

const prevObstaclesBuffer = wgsl
  .buffer(arrayOf(BoxObstacle, MAX_OBSTACLES))
  .$allowReadonlyStorage();

const prevObstacleData = prevObstaclesBuffer.asReadonlyStorage();

const obstaclesBuffer = wgsl
  .buffer(arrayOf(BoxObstacle, MAX_OBSTACLES))
  .$allowMutableStorage()
  .$allowReadonlyStorage();

const obstaclesData = obstaclesBuffer.asReadonlyStorage();

const initWorldPipeline = runtime.makeComputePipeline({
  workgroupSize: [1, 1],
  args: ['@builtin(global_invocation_id)  global_id: vec3<u32>'],
  code: wgsl`
    let x = global_id.x;
    let y = global_id.y;
    let index = x + y * ${gridSizeData};
    
    var value = vec4f(0., 0., 0., 0.);

    let center = vec2f(f32(${gridSizeData}), f32(${gridSizeData})) / 2.;
    let topCenter = vec2f(f32(${gridSizeData}) / 2., f32(${gridSizeData}));

    if (x != 0 && y != 0 && x != ${gridSizeData} - 1 && y != ${gridSizeData} - 1) {
      // ^ leaving a 1-cell border around the world.

      if (length(vec2f(f32(x), f32(y)) - center) < f32(${gridSizeData}) / 4.) {
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

const setCell = wgsl.fn()`(x: u32, y: u32, value: vec4f) {
  let index = x + y * ${gridSizeData};
  ${outputGridSlot}[index] = value;
}`.$name('set_cell');

const setVelocity = wgsl.fn()`(x: u32, y: u32, velocity: vec2f) {
  let index = x + y * ${gridSizeData};
  ${outputGridSlot}[index].x = velocity.x;
  ${outputGridSlot}[index].y = velocity.y;
}`.$name('set_velocity');

const addDensity = wgsl.fn()`(x: u32, y: u32, density: f32) {
  let index = x + y * ${gridSizeData};
  ${outputGridSlot}[index].z = ${inputGridSlot}[index].z + density;
}`.$name('add_density');

const flowFromCell = wgsl.fn()`(my_x: u32, my_y: u32, x: u32, y: u32) -> f32 {
  let src = ${getCell}(x, y);

  let dest_pos = vec2f(f32(x), f32(y)) + src.xy;
  let dest = ${getCell}(u32(dest_pos.x), u32(dest_pos.y));

  let diff = src.z - dest.z;
  // var out_flow = max(0., min(diff * 2.0, src.z));
  // var out_flow = min(0.2, src.z);
  var out_flow = min(max(0.01, 0.3 + diff * 0.2), src.z);

  if (length(src.xy) < 0.5) {
    out_flow = 0.;
  }

  if (my_x == x && my_y == y) {
    // 'src.z - out_flow' is how much is left in the src
    return src.z - out_flow;
  }


  if (u32(dest_pos.x) == my_x && u32(dest_pos.y) == my_y) {
    return out_flow;
  }

  return 0.;
}`.$name('flow_from_cell');

const timeBuffer = wgsl.buffer(f32).$allowUniform();
const timeData = timeBuffer.asUniform();

const isSolid = wgsl.fn()`(cell: vec4f) -> bool {
  return cell.w > 0.5;
}`.$name('is_solid');

const isInsideObstacle = wgsl.fn()`(x: u32, y: u32) -> bool {
  for (var obs_idx = 0; obs_idx < ${MAX_OBSTACLES}; obs_idx += 1) {
    let obs = ${obstaclesData}[obs_idx];

    if (obs.enabled == 0) {
      continue;
    }

    let min_x = u32(max(0, i32(obs.center.x) - i32(obs.size.x/2)));
    let max_x = u32(max(0, i32(obs.center.x) + i32(obs.size.x/2)));
    let min_y = u32(max(0, i32(obs.center.y) - i32(obs.size.y/2)));
    let max_y = u32(max(0, i32(obs.center.y) + i32(obs.size.y/2)));

    if (x >= min_x && x <= max_x && y >= min_y && y <= max_y) {
      return true;
    }
  }

  return false;
}`.$name('is_inside_obstacle');

const isValidFlowOut = wgsl.fn()`(x: u32, y: u32) -> bool {
  if (
    x > ${gridSizeData} - 1 ||
    x <= 1 ||
    y > ${gridSizeData} - 1 ||
    y <= 1
  ) {
    return false;
  }

  if (${isInsideObstacle}(x, y)) {
    return false;
  }

  let cell = ${getCell}(x, y);

  if (${isSolid}(cell)) {
    // wall
    return false;
  }

  return true;
}`.$name('is_valid_flow_out');

const computeVelocity = wgsl.fn()`(x: u32, y: u32) -> vec2f {
  let gravity_cost = 0.3;
  let cell = ${getCell}(x, y);
  let n = ${getCell}(x, y + 1);
  let s = ${getCell}(x, y - 1);
  let e = ${getCell}(x + 1, y);
  let w = ${getCell}(x - 1, y);

  var least_cost_dir = vec2f(0., 0.);
  var least_cost = cell.z;

  let n_cost = n.z + gravity_cost;
  let s_cost = s.z - gravity_cost;
  let n_valid = ${isValidFlowOut}(x, y + 1);
  let s_valid = ${isValidFlowOut}(x, y - 1);
  let e_valid = ${isValidFlowOut}(x + 1, y);
  let w_valid = ${isValidFlowOut}(x - 1, y);

  if (n_valid && n_cost < least_cost) {
    least_cost_dir = vec2f(0., 1.);
    least_cost = n_cost;
  }

  if (s_valid && s_cost < least_cost) {
    least_cost_dir = vec2f(0., -1.);
    least_cost = s_cost;
  }

  if (e_valid && w_valid && e.z == w.z && e.z < least_cost) {
    least_cost = e.z; // both are equal, arbitrary choice

    if (${rand01}() < 0.5) {
      least_cost_dir = vec2f(1., 0.);
    }
    else {
      least_cost_dir = vec2f(-1., 0.);
    }
  }
  else {
    if (e_valid && e.z < least_cost) {
      least_cost_dir = vec2f(1., 0.);
      least_cost = e.z;
    }

    if (w_valid && w.z < least_cost) {
      least_cost_dir = vec2f(-1., 0.);
      least_cost = w.z;
    }
  }

  return least_cost_dir;
}`;

const mainMoveObstacles = wgsl.fn()`() {
  for (var obs_idx = 0; obs_idx < ${MAX_OBSTACLES}; obs_idx += 1) {
    let obs = ${prevObstacleData}[obs_idx];
    let next_obs = ${obstaclesData}[obs_idx];

    if (obs.enabled == 0) {
      continue;
    }

    let diff = vec2i(next_obs.center) - vec2i(obs.center);

    let min_x = u32(max(0, i32(obs.center.x) - i32(obs.size.x/2)));
    let max_x = u32(max(0, i32(obs.center.x) + i32(obs.size.x/2)));
    let min_y = u32(max(0, i32(obs.center.y) - i32(obs.size.y/2)));
    let max_y = u32(max(0, i32(obs.center.y) + i32(obs.size.y/2)));

    let next_min_x = u32(max(0, i32(next_obs.center.x) - i32(obs.size.x/2)));
    let next_max_x = u32(max(0, i32(next_obs.center.x) + i32(obs.size.x/2)));
    let next_min_y = u32(max(0, i32(next_obs.center.y) - i32(obs.size.y/2)));
    let next_max_y = u32(max(0, i32(next_obs.center.y) + i32(obs.size.y/2)));

    // does it move right
    if (diff.x > 0) {
      for (var y = min_y; y <= max_y; y += 1) {
        var row_density = 0.;
        for (var x = max_x; x <= next_max_x; x += 1) {
          var cell = ${getCell}(x, y);
          row_density += cell.z;
          cell.z = 0;
          ${setCell}(x, y, cell);
        }
        
        ${addDensity}(next_max_x + 1, y, row_density);
      }
    }

    // does it move left
    if (diff.x < 0) {
      for (var y = min_y; y <= max_y; y += 1) {
        var row_density = 0.;
        for (var x = next_min_x; x < min_x; x += 1) {
          var cell = ${getCell}(x, y);
          row_density += cell.z;
          cell.z = 0;
          ${setCell}(x, y, cell);
        }
        
        ${addDensity}(next_min_x - 1, y, row_density);
      }
    }

    // does it move up
    if (diff.y > 0) {
      for (var x = min_x; x <= max_x; x += 1) {
        var col_density = 0.;
        for (var y = max_y; y <= next_max_y; y += 1) {
          var cell = ${getCell}(x, y);
          col_density += cell.z;
          cell.z = 0;
          ${setCell}(x, y, cell);
        }
        
        ${addDensity}(x, next_max_y + 1, col_density);
      }
    }

    // does it move down
    if (diff.y < 0) {
      for (var x = min_x; x <= max_x; x += 1) {
        var col_density = 0.;
        for (var y = next_min_y; y < min_y; y += 1) {
          var cell = ${getCell}(x, y);
          col_density += cell.z;
          cell.z = 0;
          ${setCell}(x, y, cell);
        }
        
        ${addDensity}(x, next_min_y - 1, col_density);
      }
    }

    // Recompute velocity around the obstacle so that no cells end up inside it on the
    // next tick.

    // left column
    for (var y = next_min_y; y <= next_max_y; y += 1) {
      let new_vel = ${computeVelocity}(next_min_x - 1, y);
      ${setVelocity}(next_min_x - 1, y, new_vel);
    }
    
    // right column
    for (var y = max(1, next_min_y); y <= min(next_max_y, ${gridSizeData} - 2); y += 1) {
      let new_vel = ${computeVelocity}(next_max_x + 2, y);
      // let new_vel = vec2f(0, 1.);
      ${setVelocity}(next_max_x + 2, y, new_vel);
    }
  }
}`.$name('main_move_obstacles');

const SourceParams = struct({
  center: vec2f,
  radius: f32,
  intensity: f32,
});
const sourceParamsBuffer = wgsl.buffer(SourceParams).$allowUniform();
const sourceParamsUniform = sourceParamsBuffer.asUniform();
const getMinimumInFlow = wgsl.fn()`(x: u32, y: u32) -> f32 {
  let source_params = ${sourceParamsUniform};
  let grid_size_f = f32(${gridSizeData});
  let source_radius = max(1., source_params.radius * grid_size_f);
  let source_pos = vec2f(source_params.center.x * grid_size_f, source_params.center.y * grid_size_f);

  if (length(vec2f(f32(x), f32(y)) - source_pos) < source_radius) {
    return source_params.intensity;
  }

  return 0.;
}`;

const mainCompute = wgsl.fn()`(x: u32, y: u32) {
  let index = x + y * ${gridSizeData};

  ${setupRandomSeed}(vec2f(f32(index), ${timeData}));

  var next = ${getCell}(x, y);

  let next_velocity = ${computeVelocity}(x, y);
  next.x = next_velocity.x;
  next.y = next_velocity.y;

  // Processing in-flow

  next.z = ${flowFromCell}(x, y, x, y);
  next.z += ${flowFromCell}(x, y, x, y + 1);
  next.z += ${flowFromCell}(x, y, x, y - 1);
  next.z += ${flowFromCell}(x, y, x + 1, y);
  next.z += ${flowFromCell}(x, y, x - 1, y);

  let min_inflow = ${getMinimumInFlow}(x, y);
  next.z = max(min_inflow, next.z);

  ${outputGridSlot}[index] = next;
}`.$name('main_compute');

const mainFragment = wgsl.fn()`(x: u32, y: u32) -> vec4f {
  let index = x + y * ${gridSizeData};
  let cell = ${inputGridSlot}[index];
  let velocity = cell.xy;
  let density = max(0., cell.z);
  let solidity = cell.w;

  if (solidity > 0.5 || ${isInsideObstacle}(x, y)) {
    return vec4f(1., 1., 1., 1.);
  }

  if (density <= 0.) {
    return vec4f(0., 0., 0., 1.);
  }

  let density_1 = max(0., density - 1.);
  let density_2 = max(0., density - 2.);

  return vec4f(density_2 * 0.05, density_1 * 0.05, 0.5 + max(0., density) * 0.5, 1.0);
}`.$name('main_fragment');

const obstacles: {
  x: number;
  y: number;
  width: number;
  height: number;
  enabled: boolean;
}[] = [
  { x: 0.5, y: 0.5, width: 0.2, height: 0.2, enabled: true }, // box
  { x: 0, y: 0.5, width: 0.1, height: 1, enabled: true }, // left wall
  { x: 0, y: 0.5, width: 0.1, height: 1, enabled: false },
  { x: 0, y: 0.5, width: 0.1, height: 1, enabled: false },
];

function obstaclesToConcrete(): Parsed<BoxObstacle>[] {
  return obstacles.map(({ x, y, width, height, enabled }) => ({
    center: [Math.round(x * gridSize), Math.round(y * gridSize)],
    size: [
      Math.round(width * gridSize),
      Math.round(height * gridSize),
    ] as const,
    enabled: enabled ? 1 : 0,
  }));
}

function setObstacleX(idx: number, x: number) {
  obstacles[idx].x = x;
  primary.applyMovedObstacles(obstaclesToConcrete());
}

function setObstacleY(idx: number, y: number) {
  obstacles[idx].y = y;
  primary.applyMovedObstacles(obstaclesToConcrete());
}

function makePipelines(
  inputGridBuffer: MutableBuffer<GridData>,
  outputGridBuffer: MutableBuffer<GridData>,
) {
  const mainComputeWithIO = mainCompute
    .with(inputGridSlot, inputGridBuffer.asReadonlyStorage())
    .with(outputGridSlot, outputGridBuffer.asStorage());

  const mainFragmentWithInput = mainFragment.with(
    inputGridSlot,
    inputGridBuffer.asReadonlyStorage(),
  );

  // const mainRecreateObstaclesWithData = mainRecreateObstacles.with(
  //   inPlaceGridSlot,
  //   inputGridBuffer.asStorage(),
  // );

  const computePipeline = runtime.makeComputePipeline({
    workgroupSize: [1, 1],
    args: ['@builtin(global_invocation_id)  global_id: vec3<u32>'],
    code: wgsl`
      ${mainComputeWithIO}(global_id.x + 1, global_id.y + 1);
    `,
  });

  // const recreateObstaclesPipeline = runtime.makeComputePipeline({
  //   workgroupSize: [1, 1],
  //   args: ['@builtin(global_invocation_id)  global_id: vec3<u32>'],
  //   code: wgsl`
  //     ${mainRecreateObstaclesWithData}(global_id.x + 1, global_id.y + 1);
  //   `,
  // });

  const moveObstaclesFn = mainMoveObstacles
    .with(inPlaceGridSlot, inputGridBuffer.asStorage())
    .with(inputGridSlot, inputGridBuffer.asStorage())
    .with(outputGridSlot, inputGridBuffer.asStorage());

  const moveObstaclesPipeline = runtime.makeComputePipeline({
    workgroupSize: [1, 1],
    args: [],
    code: wgsl`
      ${moveObstaclesFn}();
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
        return ${mainFragmentWithInput}(x, y);
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

  const applyMovedObstacles = (bufferData: Parsed<BoxObstacle>[]) => {
    obstaclesBuffer.write(runtime, bufferData);
    moveObstaclesPipeline.execute([1, 1]);
    runtime.flush();

    prevObstaclesBuffer.write(runtime, bufferData);
    // recreateObstaclesPipeline.execute([gridSize - 2, gridSize - 2]);
    runtime.flush();
  };

  return {
    inBuffer: inputGridBuffer,
    outBuffer: outputGridBuffer,

    applyMovedObstacles,

    init() {
      initWorldPipeline.execute([gridSize, gridSize]);
      // recreateObstaclesPipeline.execute([gridSize - 2, gridSize - 2]);
      runtime.flush();
    },

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
obstaclesBuffer.write(runtime, obstaclesToConcrete());
prevObstaclesBuffer.write(runtime, obstaclesToConcrete());
primary.init();

let msSinceLastTick = 0;
const timestep = 15;
const stepsPerTick = 10;

function tick() {
  timeBuffer.write(runtime, Date.now() % 1000);

  if (!paused) {
    primary.compute();
    primary = primary === even ? odd : even;
  }
}

onFrame((deltaTime) => {
  msSinceLastTick += deltaTime;

  if (msSinceLastTick >= timestep) {
    if (!paused) {
      for (let i = 0; i < stepsPerTick; ++i) {
        tick();
      }
      primary.render();
    }
    msSinceLastTick -= timestep;

    runtime.flush();
  }
});

addParameter('box x', { initial: 0.5, min: 0, max: 1, step: 0.01 }, (boxX) => {
  setObstacleX(0, boxX);
});

addParameter('box y', { initial: 0.2, min: 0, max: 1, step: 0.01 }, (boxY) => {
  setObstacleY(0, boxY);
});

addParameter(
  'left wall: x',
  { initial: 0, min: 0, max: 1, step: 0.01 },
  (leftX) => {
    setObstacleX(1, leftX);
  },
);

const sourceParams: Parsed<typeof SourceParams> = {
  center: [0.5, 0.75],
  intensity: 1,
  radius: 0.01,
};

addParameter(
  'source intensity',
  { initial: 0.1, min: 0, max: 1, step: 0.01 },
  (intensity) => {
    sourceParams.intensity = intensity;
    sourceParamsBuffer.write(runtime, sourceParams);
  },
);

addParameter(
  'source radius',
  { initial: 0.01, min: 0.01, max: 0.1, step: 0.01 },
  (radius) => {
    sourceParams.radius = radius;
    sourceParamsBuffer.write(runtime, sourceParams);
  },
);

onCleanup(() => {
  // TODO: Cleanup runtime
});
