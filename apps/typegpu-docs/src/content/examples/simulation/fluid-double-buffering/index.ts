import { JitTranspiler } from '@typegpu/jit';
import {
  type Infer,
  arrayOf,
  bool,
  f32,
  i32,
  struct,
  u32,
  vec2f,
  vec2u,
  vec4f,
} from 'typegpu/data';
import tgpu, {
  asMutable,
  asReadonly,
  asUniform,
  builtin,
  wgsl,
  std,
  type TgpuBufferReadonly,
  type TgpuBufferMutable,
} from 'typegpu/experimental';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init({ unstable_jitTranspiler: new JitTranspiler() });

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const MAX_GRID_SIZE = 1024;

const randSeed = wgsl.var(vec2f);

const setupRandomSeed = tgpu
  .fn([vec2f])
  .does((coord) => {
    randSeed.value = coord;
  })
  .$uses({ randSeed });

/**
 * Yoinked from https://www.cg.tuwien.ac.at/research/publications/2023/PETER-2023-PSW/PETER-2023-PSW-.pdf
 * "Particle System in WebGPU" by Benedikt Peter
 */
const rand01 = tgpu
  .fn([], f32)
  .does(() => {
    const a = std.dot(randSeed.value, vec2f(23.14077926, 232.61690225));
    const b = std.dot(randSeed.value, vec2f(54.47856553, 345.84153136));
    randSeed.value.x = std.fract(std.cos(a) * 136.8168);
    randSeed.value.y = std.fract(std.cos(b) * 534.7645);
    return randSeed.value.y;
  })
  .$uses({ std, vec2f, randSeed });

type GridData = typeof GridData;
/**
 * x - velocity.x
 * y - velocity.y
 * z - density
 * w - <unused>
 */
const GridData = arrayOf(vec4f, MAX_GRID_SIZE ** 2);

type BoxObstacle = typeof BoxObstacle;
const BoxObstacle = struct({
  center: vec2u,
  size: vec2u,
  enabled: u32,
});

const gridSize = 256;
const gridSizeBuffer = root.createBuffer(i32).$usage('uniform');
const gridSizeUniform = asUniform(gridSizeBuffer);

const gridAlphaBuffer = root.createBuffer(GridData).$usage('storage');
const gridBetaBuffer = root.createBuffer(GridData).$usage('storage');

const inputGridSlot = wgsl.slot<
  TgpuBufferReadonly<GridData> | TgpuBufferMutable<GridData>
>();
const outputGridSlot = wgsl.slot<TgpuBufferMutable<GridData>>();

const MAX_OBSTACLES = 4;

const prevObstaclesBuffer = root
  .createBuffer(arrayOf(BoxObstacle, MAX_OBSTACLES))
  .$usage('storage');

const prevObstacleReadonly = asReadonly(prevObstaclesBuffer);

const obstaclesBuffer = root
  .createBuffer(arrayOf(BoxObstacle, MAX_OBSTACLES))
  .$usage('storage');

const obstaclesReadonly = asReadonly(obstaclesBuffer);

const isValidCoord = tgpu
  .fn([i32, i32], bool)
  .does(
    (x, y) =>
      x < gridSizeUniform.value &&
      x >= 0 &&
      y < gridSizeUniform.value &&
      y >= 0,
  )
  .$uses({ gridSizeUniform });

const coordsToIndex = tgpu
  .fn([i32, i32], i32)
  .does((x, y) => x + y * gridSizeUniform.value)
  .$uses({ gridSizeUniform });

const getCell = tgpu
  .fn([i32, i32], vec4f)
  .does((x, y) => inputGridSlot.value[coordsToIndex(x, y)])
  .$uses({ coordsToIndex, inputGridSlot });

const setCell = tgpu
  .fn([i32, i32, vec4f])
  .does((x, y, value) => {
    const index = coordsToIndex(x, y);
    outputGridSlot.value[index] = value;
  })
  .$uses({ coordsToIndex, outputGridSlot });

const setVelocity = tgpu
  .fn([i32, i32, vec2f])
  .does((x, y, velocity) => {
    const index = coordsToIndex(x, y);
    outputGridSlot.value[index].x = velocity.x;
    outputGridSlot.value[index].y = velocity.y;
  })
  .$uses({ coordsToIndex, outputGridSlot });

const addDensity = tgpu
  .fn([i32, i32, f32])
  .does((x, y, density) => {
    const index = coordsToIndex(x, y);
    outputGridSlot.value[index].z = inputGridSlot.value[index].z + density;
  })
  .$uses({ coordsToIndex, outputGridSlot, inputGridSlot });

const flowFromCell = wgsl.fn`
  (my_x: i32, my_y: i32, x: i32, y: i32) -> f32 {
    if (!${isValidCoord}(x, y)) {
      return 0.;
    }

    let src = ${getCell}(x, y);

    let dest_pos = vec2i(vec2f(f32(x), f32(y)) + src.xy);
    let dest = ${getCell}(dest_pos.x, dest_pos.y);
    let diff = src.z - dest.z;
    var out_flow = min(max(0.01, 0.3 + diff * 0.1), src.z);

    if (length(src.xy) < 0.5) {
      out_flow = 0.;
    }

    if (my_x == x && my_y == y) {
      // 'src.z - out_flow' is how much is left in the src
      return src.z - out_flow;
    }

    if (dest_pos.x == my_x && dest_pos.y == my_y) {
      return out_flow;
    }

    return 0.;
  }
`.$name('flow_from_cell');

const timeBuffer = root.createBuffer(f32).$usage('uniform');
const timeUniform = asUniform(timeBuffer);

const isInsideObstacle = wgsl.fn`
  (x: i32, y: i32) -> bool {
    for (var obs_idx = 0; obs_idx < ${MAX_OBSTACLES}; obs_idx += 1) {
      let obs = ${obstaclesReadonly}[obs_idx];

      if (obs.enabled == 0) {
        continue;
      }

      let min_x = i32(max(0, i32(obs.center.x) - i32(obs.size.x/2)));
      let max_x = i32(max(0, i32(obs.center.x) + i32(obs.size.x/2)));
      let min_y = i32(max(0, i32(obs.center.y) - i32(obs.size.y/2)));
      let max_y = i32(max(0, i32(obs.center.y) + i32(obs.size.y/2)));

      if (x >= min_x && x <= max_x && y >= min_y && y <= max_y) {
        return true;
      }
    }

    return false;
  }
`.$name('is_inside_obstacle');

const isValidFlowOut = wgsl.fn`
  (x: i32, y: i32) -> bool {
    if (!${isValidCoord}(x, y)) {
      return false;
    }

    if (${isInsideObstacle}(x, y)) {
      return false;
    }

    let cell = ${getCell}(x, y);

    return true;
  }
`;

const computeVelocity = tgpu
  .fn([i32, i32], vec2f)
  .does(`(x: i32, y: i32) -> vec2f {
    let gravity_cost = 0.5;

    let neighbor_offsets = array<vec2i, 4>(
      vec2i( 0,  1),
      vec2i( 0, -1),
      vec2i( 1,  0),
      vec2i(-1,  0),
    );

    let cell = getCell(x, y);
    var least_cost = cell.z;

    // Direction choices of the same cost, one is chosen
    // randomly at the end of the process.
    var dir_choices: array<vec2f, 4>;
    var dir_choice_count: u32 = 1;
    dir_choices[0] = vec2f(0., 0.);

    for (var i = 0; i < 4; i++) {
      let offset = neighbor_offsets[i];
      let neighbor_density = getCell(x + offset.x, y + offset.y).z;
      let cost = neighbor_density + f32(offset.y) * gravity_cost;
      let is_valid_flow_out = isValidFlowOut(x + offset.x, y + offset.y);

      if (!is_valid_flow_out) {
        continue;
      }

      if (cost == least_cost) {
        // another valid direction
        dir_choices[dir_choice_count] = vec2f(f32(offset.x), f32(offset.y));
        dir_choice_count++;
      }
      else if (cost < least_cost) {
        // new best choice
        least_cost = cost;
        dir_choices[0] = vec2f(f32(offset.x), f32(offset.y));
        dir_choice_count = 1;
      }
    }

    let least_cost_dir = dir_choices[u32(rand01() * f32(dir_choice_count))];
    return least_cost_dir;
  }
`)
  .$uses({ getCell, isValidFlowOut, isValidCoord, rand01 });

const mainInitWorld = tgpu
  .computeFn([builtin.globalInvocationId], { workgroupSize: [1] })
  .does(`(@builtin(global_invocation_id) gid: vec3u) {
    let x = i32(gid.x);
    let y = i32(gid.y);
    let index = coordsToIndex(x, y);

    var value = vec4f();

    if (!isValidFlowOut(x, y)) {
      value = vec4f(0., 0., 0., 0.);
    }
    else {
      // Ocean
      if (y < i32(gridSizeUniform) / 2) {
        let depth = 1. - f32(y) / (f32(gridSizeUniform) / 2.);
        value = vec4f(0., 0., 10. + depth * 10., 0.);
      }
    }

    outputGridSlot[index] = value;
  }`)
  .$uses({ coordsToIndex, isValidFlowOut, gridSizeUniform, outputGridSlot });

const mainMoveObstacles = tgpu
  .computeFn([], { workgroupSize: [1] })
  .does(`() {
    for (var obs_idx = 0; obs_idx < MAX_OBSTACLES; obs_idx += 1) {
      let obs = prevObstacleReadonly[obs_idx];
      let next_obs = obstaclesReadonly[obs_idx];

      if (obs.enabled == 0) {
        continue;
      }

      let diff = vec2i(next_obs.center) - vec2i(obs.center);

      let min_x = i32(max(0, i32(obs.center.x) - i32(obs.size.x/2)));
      let max_x = i32(max(0, i32(obs.center.x) + i32(obs.size.x/2)));
      let min_y = i32(max(0, i32(obs.center.y) - i32(obs.size.y/2)));
      let max_y = i32(max(0, i32(obs.center.y) + i32(obs.size.y/2)));

      let next_min_x = i32(max(0, i32(next_obs.center.x) - i32(obs.size.x/2)));
      let next_max_x = i32(max(0, i32(next_obs.center.x) + i32(obs.size.x/2)));
      let next_min_y = i32(max(0, i32(next_obs.center.y) - i32(obs.size.y/2)));
      let next_max_y = i32(max(0, i32(next_obs.center.y) + i32(obs.size.y/2)));

      // does it move right
      if (diff.x > 0) {
        for (var y = min_y; y <= max_y; y += 1) {
          var row_density = 0.;
          for (var x = max_x; x <= next_max_x; x += 1) {
            var cell = getCell(x, y);
            row_density += cell.z;
            cell.z = 0;
            setCell(x, y, cell);
          }

          addDensity(next_max_x + 1, y, row_density);
        }
      }

      // does it move left
      if (diff.x < 0) {
        for (var y = min_y; y <= max_y; y += 1) {
          var row_density = 0.;
          for (var x = next_min_x; x < min_x; x += 1) {
            var cell = getCell(x, y);
            row_density += cell.z;
            cell.z = 0;
            setCell(x, y, cell);
          }

          addDensity(next_min_x - 1, y, row_density);
        }
      }

      // does it move up
      if (diff.y > 0) {
        for (var x = min_x; x <= max_x; x += 1) {
          var col_density = 0.;
          for (var y = max_y; y <= next_max_y; y += 1) {
            var cell = getCell(x, y);
            col_density += cell.z;
            cell.z = 0;
            setCell(x, y, cell);
          }

          addDensity(x, next_max_y + 1, col_density);
        }
      }

      // does it move down
      if (diff.y < 0) {
        for (var x = min_x; x <= max_x; x += 1) {
          var col_density = 0.;
          for (var y = next_min_y; y < min_y; y += 1) {
            var cell = getCell(x, y);
            col_density += cell.z;
            cell.z = 0;
            setCell(x, y, cell);
          }

          addDensity(x, next_min_y - 1, col_density);
        }
      }

      // Recompute velocity around the obstacle so that no cells end up inside it on the
      // next tick.

      // left column
      for (var y = next_min_y; y <= next_max_y; y += 1) {
        let new_vel = computeVelocity(next_min_x - 1, y);
        setVelocity(next_min_x - 1, y, new_vel);
      }

      // right column
      for (var y = max(1, next_min_y); y <= min(next_max_y, gridSizeUniform - 2); y += 1) {
        let new_vel = computeVelocity(next_max_x + 2, y);
        setVelocity(next_max_x + 2, y, new_vel);
      }
    }
  }`)
  .$uses({
    MAX_OBSTACLES,
    prevObstacleReadonly,
    obstaclesReadonly,
    getCell,
    setCell,
    addDensity,
    computeVelocity,
    setVelocity,
    gridSizeUniform,
  });

let sourceIntensity = 0.1;
let sourceRadius = 0.01;

const sourceParamsBuffer = root
  .createBuffer(
    struct({
      center: vec2f,
      radius: f32,
      intensity: f32,
    }),
  )
  .$usage('uniform');

const getMinimumInFlow = wgsl.fn`
  (x: i32, y: i32) -> f32 {
    let source_params = ${asUniform(sourceParamsBuffer)};
    let grid_size_f = f32(${gridSizeUniform});
    let source_radius = max(1., source_params.radius * grid_size_f);
    let source_pos = vec2f(source_params.center.x * grid_size_f, source_params.center.y * grid_size_f);

    if (length(vec2f(f32(x), f32(y)) - source_pos) < source_radius) {
      return source_params.intensity;
    }

    return 0.;
  }
`;

const mainCompute = tgpu
  .computeFn([builtin.globalInvocationId], { workgroupSize: [8, 8] })
  .does(`(@builtin(global_invocation_id) gid: vec3u) {
    let x = i32(gid.x);
    let y = i32(gid.y);
    let index = coordsToIndex(x, y);

    setupRandomSeed(vec2f(f32(index), timeUniform));

    var next = getCell(x, y);

    let next_velocity = computeVelocity(x, y);
    next.x = next_velocity.x;
    next.y = next_velocity.y;

    // Processing in-flow

    next.z = flowFromCell(x, y, x, y);
    next.z += flowFromCell(x, y, x, y + 1);
    next.z += flowFromCell(x, y, x, y - 1);
    next.z += flowFromCell(x, y, x + 1, y);
    next.z += flowFromCell(x, y, x - 1, y);

    let min_inflow = getMinimumInFlow(x, y);
    next.z = max(min_inflow, next.z);

    outputGridSlot[index] = next;
  }
`)
  .$uses({
    coordsToIndex,
    setupRandomSeed,
    timeUniform,
    getCell,
    computeVelocity,
    flowFromCell,
    getMinimumInFlow,
    outputGridSlot,
  });

const OBSTACLE_BOX = 0;
const OBSTACLE_LEFT_WALL = 1;

const obstacles: {
  x: number;
  y: number;
  width: number;
  height: number;
  enabled: boolean;
}[] = [
  { x: 0.5, y: 0.2, width: 0.2, height: 0.2, enabled: true }, // box
  { x: 0, y: 0.5, width: 0.1, height: 1, enabled: true }, // left wall
  { x: 1, y: 0.5, width: 0.1, height: 1, enabled: true }, // right wall
  { x: 0.5, y: 0, width: 1, height: 0.1, enabled: true }, // floor
];

function obstaclesToConcrete(): Infer<BoxObstacle>[] {
  return obstacles.map(({ x, y, width, height, enabled }) => ({
    center: vec2u(Math.round(x * gridSize), Math.round(y * gridSize)),
    size: vec2u(Math.round(width * gridSize), Math.round(height * gridSize)),
    enabled: enabled ? 1 : 0,
  }));
}

let boxX = 0.5;
const limitedBoxX = () => {
  const leftWallWidth = obstacles[OBSTACLE_LEFT_WALL].width;
  return Math.max(boxX, leftWallX + leftWallWidth / 2 + 0.15);
};

let boxY = 0.2;
let leftWallX = 0;

const vertexMain = tgpu
  .vertexFn({ idx: builtin.vertexIndex }, { pos: builtin.position, uv: vec2f })
  .does(/* wgsl */ `(@builtin(vertex_index) idx: u32) -> VertexOut {
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

    var output: VertexOut;
    output.pos = vec4f(pos[idx].x, pos[idx].y, 0.0, 1.0);
    output.uv = uv[idx];
    return output;
  }`)
  .$uses({
    get VertexOut() {
      return vertexMain.Output;
    },
  });

const fragmentMain = tgpu
  .fragmentFn(
    {
      pos: builtin.position /* TODO: Remove once builtins are properly purged from the types */,
      uv: vec2f,
    },
    vec4f,
  )
  .does(`(@location(0) uv: vec2f) -> @location(0) vec4f {
    let x = i32(uv.x * f32(gridSizeUniform));
    let y = i32(uv.y * f32(gridSizeUniform));

    let index = coordsToIndex(x, y);
    let cell = inputGridSlot[index];
    let velocity = cell.xy;
    let density = max(0., cell.z);

    let obstacle_color = vec4f(0.1, 0.1, 0.1, 1.);

    let background = vec4f(0.9, 0.9, 0.9, 1.);
    let first_color = vec4f(0.2, 0.6, 1., 1.);
    let second_color = vec4f(0.2, 0.3, 0.6, 1.);
    let third_color = vec4f(0.1, 0.2, 0.4, 1.);

    let first_threshold = 2.;
    let second_threshold = 10.;
    let third_threshold = 20.;

    if (isInsideObstacle(x, y)) {
      return obstacle_color;
    }

    if (density <= 0.) {
      return background;
    }

    if (density <= first_threshold) {
      let t = 1 - pow(1 - density / first_threshold, 2.);
      return mix(background, first_color, t);
    }

    if (density <= second_threshold) {
      return mix(first_color, second_color, (density - first_threshold) / (second_threshold - first_threshold));
    }

    return mix(second_color, third_color, min((density - second_threshold) / third_threshold, 1.));
  }`)
  .$uses({ gridSizeUniform, coordsToIndex, inputGridSlot, isInsideObstacle });

function makePipelines(
  inputGridReadonly: TgpuBufferReadonly<GridData>,
  outputGridMutable: TgpuBufferMutable<GridData>,
) {
  const initWorldPipeline = root
    .with(inputGridSlot, outputGridMutable)
    .with(outputGridSlot, outputGridMutable)
    .withCompute(mainInitWorld)
    .createPipeline();

  const computePipeline = root
    .with(inputGridSlot, inputGridReadonly)
    .with(outputGridSlot, outputGridMutable)
    .withCompute(mainCompute)
    .createPipeline();

  const moveObstaclesPipeline = root
    .with(inputGridSlot, outputGridMutable)
    .with(outputGridSlot, outputGridMutable)
    .withCompute(mainMoveObstacles)
    .createPipeline();

  const renderPipeline = root
    .with(inputGridSlot, inputGridReadonly)
    .withVertex(vertexMain, {})
    .withFragment(fragmentMain, { format: presentationFormat })
    .withPrimitive({ topology: 'triangle-strip' })
    .createPipeline();

  return {
    init() {
      initWorldPipeline.dispatchWorkgroups(gridSize, gridSize);
      root.flush();
    },

    applyMovedObstacles(bufferData: Infer<BoxObstacle>[]) {
      obstaclesBuffer.write(bufferData);
      moveObstaclesPipeline.dispatchWorkgroups(1);
      root.flush();

      prevObstaclesBuffer.write(bufferData);
      root.flush();
    },

    compute() {
      computePipeline.dispatchWorkgroups(
        gridSize / mainCompute.shell.workgroupSize[0],
        gridSize / mainCompute.shell.workgroupSize[1],
      );
    },

    render() {
      const textureView = context.getCurrentTexture().createView();

      renderPipeline
        .withColorAttachment({
          view: textureView,
          clearValue: [0, 0, 0, 1],
          loadOp: 'clear',
          storeOp: 'store',
        })
        .draw(4);
    },
  };
}

const even = makePipelines(
  // in
  asReadonly(gridAlphaBuffer),
  // out
  asMutable(gridBetaBuffer),
);

const odd = makePipelines(
  // in
  asReadonly(gridBetaBuffer),
  // out
  asMutable(gridAlphaBuffer),
);

let primary = even;

gridSizeBuffer.write(gridSize);
obstaclesBuffer.write(obstaclesToConcrete());
prevObstaclesBuffer.write(obstaclesToConcrete());
primary.init();

let msSinceLastTick = 0;
const timestep = 15;
const stepsPerTick = 64;

function tick() {
  timeBuffer.write(Date.now() % 1000);

  sourceParamsBuffer.write({
    center: vec2f(0.5, 0.9),
    intensity: sourceIntensity,
    radius: sourceRadius,
  });

  primary = primary === even ? odd : even;
  primary.compute();
  root.flush();
}

let disposed = false;

const onFrame = (loop: (deltaTime: number) => unknown) => {
  let lastTime = Date.now();
  const runner = () => {
    if (disposed) {
      return;
    }
    const now = Date.now();
    const dt = now - lastTime;
    lastTime = now;
    loop(dt);
    requestAnimationFrame(runner);
  };
  requestAnimationFrame(runner);
};

onFrame((deltaTime) => {
  msSinceLastTick += deltaTime;

  if (msSinceLastTick >= timestep) {
    for (let i = 0; i < stepsPerTick; ++i) {
      tick();
    }
    primary.render();
    root.flush();
    msSinceLastTick -= timestep;
  }
});

export const controls = {
  'source intensity': {
    initial: sourceIntensity,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value: number) => {
      sourceIntensity = value;
    },
  },

  'source radius': {
    initial: sourceRadius,
    min: 0.01,
    max: 0.1,
    step: 0.01,
    onSliderChange: (value: number) => {
      sourceRadius = value;
    },
  },

  'box x': {
    initial: boxX,
    min: 0.2,
    max: 0.8,
    step: 0.01,
    onSliderChange: (value: number) => {
      boxX = value;
      obstacles[OBSTACLE_BOX].x = limitedBoxX();
      primary.applyMovedObstacles(obstaclesToConcrete());
    },
  },

  'box y': {
    initial: boxY,
    min: 0.2,
    max: 0.85,
    step: 0.01,
    onSliderChange: (value: number) => {
      boxY = value;
      obstacles[OBSTACLE_BOX].y = boxY;
      primary.applyMovedObstacles(obstaclesToConcrete());
    },
  },

  'left wall: x': {
    initial: leftWallX,
    min: 0,
    max: 0.6,
    step: 0.01,
    onSliderChange: (value: number) => {
      leftWallX = value;
      obstacles[OBSTACLE_LEFT_WALL].x = leftWallX;
      obstacles[OBSTACLE_BOX].x = limitedBoxX();
      primary.applyMovedObstacles(obstaclesToConcrete());
    },
  },
};

export function onCleanup() {
  disposed = true;
  root.destroy();
}
