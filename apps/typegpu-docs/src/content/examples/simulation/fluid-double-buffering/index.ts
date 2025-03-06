import { BPETER, rand } from '@typegpu/noise';
import tgpu, { type TgpuBufferReadonly, type TgpuBufferMutable } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const MAX_GRID_SIZE = 1024;

type GridData = typeof GridData;
/**
 * x - velocity.x
 * y - velocity.y
 * z - density
 * w - <unused>
 */
const GridData = d.arrayOf(d.vec4f, MAX_GRID_SIZE ** 2);

type BoxObstacle = typeof BoxObstacle;
const BoxObstacle = d.struct({
  center: d.vec2u,
  size: d.vec2u,
  enabled: d.u32,
});

const gridSize = 256;
const gridSizeBuffer = root.createBuffer(d.i32).$usage('uniform');
const gridSizeUniform = gridSizeBuffer.as('uniform');

const gridAlphaBuffer = root.createBuffer(GridData).$usage('storage');
const gridBetaBuffer = root.createBuffer(GridData).$usage('storage');

const inputGridSlot = tgpu['~unstable'].slot<
  TgpuBufferReadonly<GridData> | TgpuBufferMutable<GridData>
>();
const outputGridSlot = tgpu['~unstable'].slot<TgpuBufferMutable<GridData>>();

const MAX_OBSTACLES = 4;

const prevObstaclesBuffer = root
  .createBuffer(d.arrayOf(BoxObstacle, MAX_OBSTACLES))
  .$usage('storage');

const prevObstacleReadonly = prevObstaclesBuffer.as('readonly');

const obstaclesBuffer = root
  .createBuffer(d.arrayOf(BoxObstacle, MAX_OBSTACLES))
  .$usage('storage');

const obstaclesReadonly = obstaclesBuffer.as('readonly');

const isValidCoord = tgpu['~unstable']
  .fn([d.i32, d.i32], d.bool)
  .does(
    (x, y) =>
      x < gridSizeUniform.value &&
      x >= 0 &&
      y < gridSizeUniform.value &&
      y >= 0,
  );

const coordsToIndex = tgpu['~unstable']
  .fn([d.i32, d.i32], d.i32)
  .does((x, y) => x + y * gridSizeUniform.value);

const getCell = tgpu['~unstable']
  .fn([d.i32, d.i32], d.vec4f)
  .does((x, y) => inputGridSlot.value[coordsToIndex(x, y)]);

const setCell = tgpu['~unstable']
  .fn([d.i32, d.i32, d.vec4f])
  .does((x, y, value) => {
    const index = coordsToIndex(x, y);
    outputGridSlot.value[index] = value;
  });

const setVelocity = tgpu['~unstable']
  .fn([d.i32, d.i32, d.vec2f])
  .does((x, y, velocity) => {
    const index = coordsToIndex(x, y);
    outputGridSlot.value[index].x = velocity.x;
    outputGridSlot.value[index].y = velocity.y;
  });

const addDensity = tgpu['~unstable']
  .fn([d.i32, d.i32, d.f32])
  .does((x, y, density) => {
    const index = coordsToIndex(x, y);
    outputGridSlot.value[index].z = inputGridSlot.value[index].z + density;
  });

const flowFromCell = tgpu['~unstable']
  .fn([d.i32, d.i32, d.i32, d.i32], d.f32)
  .does((my_x, my_y, x, y) => {
    if (!isValidCoord(x, y)) {
      return 0;
    }
    const src = getCell(x, y);

    const destPos = d.vec2i(x + d.i32(src.x), y + d.i32(src.y));
    const dest = getCell(destPos.x, destPos.y);
    const diff = src.z - dest.z;
    let outFlow = std.min(std.max(0.01, 0.3 + diff * 0.1), src.z);

    if (std.length(src.xy) < 0.5) {
      outFlow = 0;
    }

    if (my_x === x && my_y === y) {
      // 'src.z - outFlow' is how much is left in the src
      return src.z - outFlow;
    }

    if (destPos.x === my_x && destPos.y === my_y) {
      return outFlow;
    }

    return 0;
  });

const timeBuffer = root.createBuffer(d.f32).$usage('uniform');
const timeUniform = timeBuffer.as('uniform');

const isInsideObstacle = tgpu['~unstable']
  .fn([d.i32, d.i32], d.bool)
  .does((x, y) => {
    for (let obs_idx = 0; obs_idx < MAX_OBSTACLES; obs_idx += 1) {
      const obs = obstaclesReadonly.value[obs_idx];

      if (obs.enabled === 0) {
        continue;
      }

      const min_x = std.max(0, d.i32(obs.center.x) - d.i32(obs.size.x) / 2);
      const max_x = std.min(
        d.i32(gridSize),
        d.i32(obs.center.x) + d.i32(obs.size.x) / 2,
      );
      const min_y = std.max(0, d.i32(obs.center.y) - d.i32(obs.size.y) / 2);
      const max_y = std.min(
        d.i32(gridSize),
        d.i32(obs.center.y) + d.i32(obs.size.y) / 2,
      );

      if (x >= min_x && x <= max_x && y >= min_y && y <= max_y) {
        return true;
      }
    }

    return false;
  });

const isValidFlowOut = tgpu['~unstable']
  .fn([d.i32, d.i32], d.bool)
  .does((x, y) => {
    if (!isValidCoord(x, y)) {
      return false;
    }

    if (isInsideObstacle(x, y)) {
      return false;
    }

    return true;
  });

const computeVelocity = tgpu['~unstable']
  .fn([d.i32, d.i32], d.vec2f)
  .does(/* wgsl */ `(x: i32, y: i32) -> vec2f {
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
  }`)
  .$uses({ getCell, isValidFlowOut, isValidCoord, rand01: rand.float01 });

const mainInitWorld = tgpu['~unstable']
  .computeFn({ in: { gid: d.builtin.globalInvocationId }, workgroupSize: [1] })
  .does((input) => {
    const x = d.i32(input.gid.x);
    const y = d.i32(input.gid.y);
    const index = coordsToIndex(x, y);

    let value = d.vec4f();

    if (!isValidFlowOut(x, y)) {
      value = d.vec4f(0, 0, 0, 0);
    } else {
      // Ocean
      if (y < d.i32(gridSizeUniform.value) / 2) {
        const depth = 1 - d.f32(y) / (d.f32(gridSizeUniform.value) / 2);
        value = d.vec4f(0, 0, 10 + depth * 10, 0);
      }
    }

    outputGridSlot.value[index] = value;
  });

const mainMoveObstacles = tgpu['~unstable']
  .computeFn({ workgroupSize: [1] })
  .does(() => {
    for (let obsIdx = 0; obsIdx < MAX_OBSTACLES; obsIdx += 1) {
      const obs = prevObstacleReadonly.value[obsIdx];
      const nextObs = obstaclesReadonly.value[obsIdx];

      if (obs.enabled === 0) {
        continue;
      }

      const diff = std.sub(
        d.vec2i(d.i32(nextObs.center.x), d.i32(nextObs.center.y)),
        d.vec2i(d.i32(obs.center.x), d.i32(obs.center.y)),
      );

      const min_x = std.max(0, d.i32(obs.center.x) - d.i32(obs.size.x) / 2);
      const max_x = std.min(
        d.i32(gridSize),
        d.i32(obs.center.x) + d.i32(obs.size.x) / 2,
      );
      const min_y = std.max(0, d.i32(obs.center.y) - d.i32(obs.size.y) / 2);
      const max_y = std.min(
        d.i32(gridSize),
        d.i32(obs.center.y) + d.i32(obs.size.y) / 2,
      );

      const nextMinX = std.max(
        0,
        d.i32(nextObs.center.x) - d.i32(obs.size.x) / 2,
      );
      const nextMaxX = std.min(
        d.i32(gridSize),
        d.i32(nextObs.center.x) + d.i32(obs.size.x) / 2,
      );
      const nextMinY = std.max(
        0,
        d.i32(nextObs.center.y) - d.i32(obs.size.y) / 2,
      );
      const nextMaxY = std.min(
        d.i32(gridSize),
        d.i32(nextObs.center.y) + d.i32(obs.size.y) / 2,
      );

      // does it move right
      if (diff.x > 0) {
        for (let y = min_y; y <= max_y; y += 1) {
          let rowDensity = d.f32(0);
          for (let x = max_x; x <= nextMaxX; x += 1) {
            const cell = getCell(x, y);
            rowDensity += cell.z;
            cell.z = 0;
            setCell(x, y, cell);
          }

          addDensity(nextMaxX + 1, y, rowDensity);
        }
      }

      // does it move left
      if (diff.x < 0) {
        for (let y = min_y; y <= max_y; y += 1) {
          let rowDensity = d.f32(0);
          for (let x = nextMinX; x < min_x; x += 1) {
            const cell = getCell(x, y);
            rowDensity += cell.z;
            cell.z = 0;
            setCell(x, y, cell);
          }

          addDensity(nextMinX - 1, y, rowDensity);
        }
      }

      // does it move up
      if (diff.y > 0) {
        for (let x = min_x; x <= max_x; x += 1) {
          let colDensity = d.f32(0);
          for (let y = max_y; y <= nextMaxY; y += 1) {
            const cell = getCell(x, y);
            colDensity += cell.z;
            cell.z = 0;
            setCell(x, y, cell);
          }

          addDensity(x, nextMaxY + 1, colDensity);
        }
      }

      // does it move down
      for (let x = min_x; x <= max_x; x += 1) {
        let colDensity = d.f32(0);
        for (let y = nextMinY; y < min_y; y += 1) {
          const cell = getCell(x, y);
          colDensity += cell.z;
          cell.z = 0;
          setCell(x, y, cell);
        }

        addDensity(x, nextMinY - 1, colDensity);
      }

      // Recompute velocity around the obstacle so that no cells end up inside it on the next tick.

      // left column
      for (let y = nextMinY; y <= nextMaxY; y += 1) {
        const newVel = computeVelocity(nextMinX - 1, y);
        setVelocity(nextMinX - 1, y, newVel);
      }

      // right column
      for (
        let y = std.max(1, nextMinY);
        y <= std.min(nextMaxY, gridSize - 2);
        y += 1
      ) {
        const newVel = computeVelocity(nextMaxX + 2, y);
        setVelocity(nextMaxX + 2, y, newVel);
      }
    }
  });

let sourceIntensity = 0.1;
let sourceRadius = 0.01;

const sourceParamsBuffer = root
  .createBuffer(
    d.struct({
      center: d.vec2f,
      radius: d.f32,
      intensity: d.f32,
    }),
  )
  .$usage('uniform');
const sourceParamsUniform = sourceParamsBuffer.as('uniform');

const getMinimumInFlow = tgpu['~unstable']
  .fn([d.i32, d.i32], d.f32)
  .does((x, y) => {
    const gridSizeF = d.f32(gridSizeUniform.value);
    const sourceRadius = std.max(
      1,
      sourceParamsUniform.value.radius * gridSizeF,
    );
    const sourcePos = d.vec2f(
      sourceParamsUniform.value.center.x * gridSizeF,
      sourceParamsUniform.value.center.y * gridSizeF,
    );

    if (
      std.length(d.vec2f(d.f32(x) - sourcePos.x, d.f32(y) - sourcePos.y)) <
      sourceRadius
    ) {
      return sourceParamsUniform.value.intensity;
    }

    return 0;
  });

const mainCompute = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [8, 8],
  })
  .does((input) => {
    const x = d.i32(input.gid.x);
    const y = d.i32(input.gid.y);
    const index = coordsToIndex(x, y);

    setupRandomSeed(d.vec2f(d.f32(index), timeUniform.value));

    const next = getCell(x, y);
    const nextVelocity = computeVelocity(x, y);
    next.x = nextVelocity.x;
    next.y = nextVelocity.y;

    // Processing in-flow

    next.z = flowFromCell(x, y, x, y);
    next.z += flowFromCell(x, y, x, y + 1);
    next.z += flowFromCell(x, y, x, y - 1);
    next.z += flowFromCell(x, y, x + 1, y);
    next.z += flowFromCell(x, y, x - 1, y);

    const min_inflow = getMinimumInFlow(x, y);
    next.z = std.max(min_inflow, next.z);

    outputGridSlot.value[index] = next;
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

function obstaclesToConcrete(): d.Infer<BoxObstacle>[] {
  return obstacles.map(({ x, y, width, height, enabled }) => ({
    center: d.vec2u(Math.round(x * gridSize), Math.round(y * gridSize)),
    size: d.vec2u(Math.round(width * gridSize), Math.round(height * gridSize)),
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

const vertexMain = tgpu['~unstable']
  .vertexFn({
    in: { idx: d.builtin.vertexIndex },
    out: { pos: d.builtin.position, uv: d.vec2f },
  })
  .does(/* wgsl */ `(input: VertexInput) -> VertexOut {
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
    output.pos = vec4f(pos[input.idx].x, pos[input.idx].y, 0.0, 1.0);
    output.uv = uv[input.idx];
    return output;
  }`);

const fragmentMain = tgpu['~unstable']
  .fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })
  .does((input) => {
    const x = d.i32(input.uv.x * d.f32(gridSizeUniform.value));
    const y = d.i32(input.uv.y * d.f32(gridSizeUniform.value));

    const index = coordsToIndex(x, y);
    const cell = inputGridSlot.value[index];
    const density = std.max(0, cell.z);

    const obstacleColor = d.vec4f(0.1, 0.1, 0.1, 1);

    const background = d.vec4f(0.9, 0.9, 0.9, 1);
    const first_color = d.vec4f(0.2, 0.6, 1, 1);
    const second_color = d.vec4f(0.2, 0.3, 0.6, 1);
    const third_color = d.vec4f(0.1, 0.2, 0.4, 1);

    const firstThreshold = d.f32(2);
    const secondThreshold = d.f32(10);
    const thirdThreshold = d.f32(20);

    if (isInsideObstacle(x, y)) {
      return obstacleColor;
    }

    if (density <= 0) {
      return background;
    }

    if (density <= firstThreshold) {
      const t = 1 - std.pow(1 - density / firstThreshold, 2);
      return std.mix(background, first_color, t);
    }

    if (density <= secondThreshold) {
      return std.mix(
        first_color,
        second_color,
        (density - firstThreshold) / (secondThreshold - firstThreshold),
      );
    }

    return std.mix(
      second_color,
      third_color,
      std.min((density - secondThreshold) / thirdThreshold, 1),
    );
  });

function makePipelines(
  inputGridReadonly: TgpuBufferReadonly<GridData>,
  outputGridMutable: TgpuBufferMutable<GridData>,
) {
  const initWorldPipeline = root['~unstable']
    .with(inputGridSlot, outputGridMutable)
    .with(outputGridSlot, outputGridMutable)
    .withCompute(mainInitWorld)
    .createPipeline();

  const computePipeline = root['~unstable']
    .with(inputGridSlot, inputGridReadonly)
    .with(outputGridSlot, outputGridMutable)
    .withCompute(mainCompute)
    .createPipeline();

  const moveObstaclesPipeline = root['~unstable']
    .with(inputGridSlot, outputGridMutable)
    .with(outputGridSlot, outputGridMutable)
    .withCompute(mainMoveObstacles)
    .createPipeline();

  const renderPipeline = root['~unstable']
    .with(inputGridSlot, inputGridReadonly)
    .withVertex(vertexMain, {})
    .withFragment(fragmentMain, { format: presentationFormat })
    .withPrimitive({ topology: 'triangle-strip' })
    .createPipeline();

  return {
    init() {
      initWorldPipeline.dispatchWorkgroups(gridSize, gridSize);
      root['~unstable'].flush();
    },

    applyMovedObstacles(bufferData: d.Infer<BoxObstacle>[]) {
      obstaclesBuffer.write(bufferData);
      moveObstaclesPipeline.dispatchWorkgroups(1);
      root['~unstable'].flush();

      prevObstaclesBuffer.write(bufferData);
      root['~unstable'].flush();
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
  gridAlphaBuffer.as('readonly'),
  // out
  gridBetaBuffer.as('mutable'),
);

const odd = makePipelines(
  // in
  gridBetaBuffer.as('readonly'),
  // out
  gridAlphaBuffer.as('mutable'),
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
    center: d.vec2f(0.5, 0.9),
    intensity: sourceIntensity,
    radius: sourceRadius,
  });

  primary = primary === even ? odd : even;
  primary.compute();
  root['~unstable'].flush();
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
    root['~unstable'].flush();
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
