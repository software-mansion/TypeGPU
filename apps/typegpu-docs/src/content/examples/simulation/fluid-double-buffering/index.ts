import tgpu, { type TgpuBufferMutable, type TgpuBufferReadonly } from 'typegpu';
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

const randSeed = tgpu['~unstable'].privateVar(d.vec2f);

const setupRandomSeed = tgpu['~unstable'].fn([d.vec2f])((coord) => {
  randSeed.value = coord;
});

/**
 * Yoinked from https://www.cg.tuwien.ac.at/research/publications/2023/PETER-2023-PSW/PETER-2023-PSW-.pdf
 * "Particle System in WebGPU" by Benedikt Peter
 */
const rand01 = tgpu['~unstable'].fn(
  {},
  d.f32,
)(() => {
  const a = std.dot(randSeed.value, d.vec2f(23.14077926, 232.61690225));
  const b = std.dot(randSeed.value, d.vec2f(54.47856553, 345.84153136));
  randSeed.value.x = std.fract(std.cos(a) * 136.8168);
  randSeed.value.y = std.fract(std.cos(b) * 534.7645);
  return randSeed.value.y;
});

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

const isValidCoord = tgpu['~unstable'].fn(
  { x: d.i32, y: d.i32 },
  d.bool,
)((args) => {
  return (
    args.x < gridSizeUniform.value &&
    args.x >= 0 &&
    args.y < gridSizeUniform.value &&
    args.y >= 0
  );
});

const coordsToIndex = tgpu['~unstable'].fn(
  { x: d.i32, y: d.i32 },
  d.i32,
)((args) => args.x + args.y * gridSizeUniform.value);

const getCell = tgpu['~unstable'].fn(
  { x: d.i32, y: d.i32 },
  d.vec4f,
)((args) => inputGridSlot.value[coordsToIndex(args)]);

const setCell = tgpu['~unstable'].fn({ x: d.i32, y: d.i32, value: d.vec4f })(
  (args) => {
    const index = coordsToIndex(args);
    outputGridSlot.value[index] = args.value;
  },
);

const setVelocity = tgpu['~unstable'].fn({
  x: d.i32,
  y: d.i32,
  velocity: d.vec2f,
})((args) => {
  const index = coordsToIndex(args);
  outputGridSlot.value[index].x = args.velocity.x;
  outputGridSlot.value[index].y = args.velocity.y;
});

const addDensity = tgpu['~unstable'].fn({ x: d.i32, y: d.i32, density: d.f32 })(
  (args) => {
    const index = coordsToIndex(args);
    outputGridSlot.value[index].z = inputGridSlot.value[index].z + args.density;
  },
);

const flowFromCell = tgpu['~unstable'].fn(
  { myX: d.i32, myY: d.i32, x: d.i32, y: d.i32 },
  d.f32,
)((args) => {
  if (!isValidCoord(args)) {
    return 0;
  }
  const src = getCell(args);

  const destPos = d.vec2i(args.x + d.i32(src.x), args.y + d.i32(src.y));
  const dest = getCell(destPos.x, destPos.y);
  const diff = src.z - dest.z;
  let outFlow = std.min(std.max(0.01, 0.3 + diff * 0.1), src.z);

  if (std.length(src.xy) < 0.5) {
    outFlow = 0;
  }

  if (args.myX === args.x && AbortSignal.myY === args.y) {
    // 'src.z - outFlow' is how much is left in the src
    return src.z - outFlow;
  }

  if (destPos.x === args.myX && destPos.y === AbortSignal.myY) {
    return outFlow;
  }

  return 0;
});

const timeBuffer = root.createBuffer(d.f32).$usage('uniform');
const timeUniform = timeBuffer.as('uniform');

const isInsideObstacle = tgpu['~unstable'].fn(
  { x: d.i32, y: d.i32 },
  d.bool,
)((args) => {
  for (let obsIdx = 0; obsIdx < MAX_OBSTACLES; obsIdx++) {
    const obs = obstaclesReadonly.value[obsIdx];

    if (obs.enabled === 0) {
      continue;
    }

    const minX = std.max(0, d.i32(obs.center.x) - d.i32(obs.size.x) / 2);
    const maxX = std.min(
      d.i32(gridSize),
      d.i32(obs.center.x) + d.i32(obs.size.x) / 2,
    );
    const minY = std.max(0, d.i32(obs.center.y) - d.i32(obs.size.y) / 2);
    const maxY = std.min(
      d.i32(gridSize),
      d.i32(obs.center.y) + d.i32(obs.size.y) / 2,
    );

    if (args.x >= minX && args.x <= maxX && args.y >= minY && args.y <= maxY) {
      return true;
    }
  }

  return false;
});

const isValidFlowOut = tgpu['~unstable'].fn(
  { x: d.i32, y: d.i32 },
  d.bool,
)((args) => {
  if (!isValidCoord(args)) {
    return false;
  }

  if (isInsideObstacle(args)) {
    return false;
  }

  return true;
});

const computeVelocity = tgpu['~unstable'].fn(
  { x: d.i32, y: d.i32 },
  d.vec2f,
)((args) => {
  const gravityCost = 0.5;

  const neighborOffsets = [
    d.vec2i(0, 1),
    d.vec2i(0, -1),
    d.vec2i(1, 0),
    d.vec2i(-1, 0),
  ];

  const cell = getCell(args);
  let leastCost = cell.z;

  const dirChoices = [
    d.vec2f(0, 0),
    d.vec2f(0, 0),
    d.vec2f(0, 0),
    d.vec2f(0, 0),
  ];
  let dirChoiceCount = 1;

  for (let i = 0; i < 4; i++) {
    const offset = neighborOffsets[i];
    const neighborDensity = getCell(x + offset.x, y + offset.y);
    const cost = neighborDensity.z + d.f32(offset.y) * gravityCost;

    if (!isValidFlowOut({ x: args.x + offset.x, y: args.y + offset.y })) {
      continue;
    }

    if (cost === leastCost) {
      dirChoices[dirChoiceCount] = d.vec2f(d.f32(offset.x), d.f32(offset.y));
      dirChoiceCount++;
    } else if (cost < leastCost) {
      leastCost = cost;
      dirChoices[0] = d.vec2f(d.f32(offset.x), d.f32(offset.y));
      dirChoiceCount = 1;
    }
  }

  const leastCostDir = dirChoices[d.u32(rand01() * d.f32(dirChoiceCount))];
  return leastCostDir;
});

const mainInitWorld = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [1],
})((input) => {
  const x = d.i32(input.gid.x);
  const y = d.i32(input.gid.y);
  const index = coordsToIndex(x, y);

  let value = d.vec4f();

  if (!isValidFlowOut({ x, y })) {
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

const mainMoveObstacles = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
  () => {
    for (let obsIdx = 0; obsIdx < MAX_OBSTACLES; obsIdx++) {
      const obs = prevObstacleReadonly.value[obsIdx];
      const nextObs = obstaclesReadonly.value[obsIdx];

      if (obs.enabled === 0) {
        continue;
      }

      const diff = std.sub(
        d.vec2i(d.i32(nextObs.center.x), d.i32(nextObs.center.y)),
        d.vec2i(d.i32(obs.center.x), d.i32(obs.center.y)),
      );

      const minX = std.max(0, d.i32(obs.center.x) - d.i32(obs.size.x) / 2);
      const maxX = std.min(
        d.i32(gridSize),
        d.i32(obs.center.x) + d.i32(obs.size.x) / 2,
      );
      const minY = std.max(0, d.i32(obs.center.y) - d.i32(obs.size.y) / 2);
      const maxY = std.min(
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
        for (let y = minY; y <= maxY; y++) {
          let rowDensity = d.f32(0);
          for (let x = maxX; x <= nextMaxX; x++) {
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
        for (let y = minY; y <= maxY; y++) {
          let rowDensity = d.f32(0);
          for (let x = nextMinX; x < minX; x++) {
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
        for (let x = minX; x <= maxX; x++) {
          let colDensity = d.f32(0);
          for (let y = maxY; y <= nextMaxY; y++) {
            const cell = getCell(x, y);
            colDensity += cell.z;
            cell.z = 0;
            setCell(x, y, cell);
          }

          addDensity(x, nextMaxY + 1, colDensity);
        }
      }

      // does it move down
      for (let x = minX; x <= maxX; x++) {
        let colDensity = d.f32(0);
        for (let y = nextMinY; y < minY; y++) {
          const cell = getCell(x, y);
          colDensity += cell.z;
          cell.z = 0;
          setCell(x, y, cell);
        }

        addDensity(x, nextMinY - 1, colDensity);
      }

      // Recompute velocity around the obstacle so that no cells end up inside it on the next tick.

      // left column
      for (let y = nextMinY; y <= nextMaxY; y++) {
        const newVel = computeVelocity(nextMinX - 1, y);
        setVelocity(nextMinX - 1, y, newVel);
      }

      // right column
      for (
        let y = std.max(1, nextMinY);
        y <= std.min(nextMaxY, gridSize - 2);
        y++
      ) {
        const newVel = computeVelocity(nextMaxX + 2, y);
        setVelocity(nextMaxX + 2, y, newVel);
      }
    }
  },
);

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

const getMinimumInFlow = tgpu['~unstable'].fn(
  { x: d.i32, y: d.i32 },
  d.f32,
)((args) => {
  const gridSizeF = d.f32(gridSizeUniform.value);
  const sourceRadius = std.max(1, sourceParamsUniform.value.radius * gridSizeF);
  const sourcePos = d.vec2f(
    sourceParamsUniform.value.center.x * gridSizeF,
    sourceParamsUniform.value.center.y * gridSizeF,
  );

  if (
    std.length(
      d.vec2f(d.f32(args.x) - sourcePos.x, d.f32(args.y) - sourcePos.y),
    ) < sourceRadius
  ) {
    return sourceParamsUniform.value.intensity;
  }

  return 0;
});

const mainCompute = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [8, 8],
})((input) => {
  const x = d.i32(input.gid.x);
  const y = d.i32(input.gid.y);
  const index = coordsToIndex({ x, y });

  setupRandomSeed(d.vec2f(d.f32(index), timeUniform.value));

  const next = getCell({ x, y });
  const nextVelocity = computeVelocity(x, y);
  next.x = nextVelocity.x;
  next.y = nextVelocity.y;

  // Processing in-flow

  next.z = flowFromCell({ myX: x, myY: y, x, y });
  next.z += flowFromCell({ myX: x, myY: y, x, y: y + 1 });
  next.z += flowFromCell({ myX: x, myY: y, x, y: y - 1 });
  next.z += flowFromCell({ myX: x, myY: y, x: x + 1, y });
  next.z += flowFromCell({ myX: x, myY: y, x: x - 1, y });

  const minInflow = getMinimumInFlow({ x, y });
  next.z = std.max(minInflow, next.z);

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

const vertexMain = tgpu['~unstable'].vertexFn({
  in: { idx: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(1, 1), d.vec2f(-1, 1), d.vec2f(1, -1), d.vec2f(-1, -1)];
  const uv = [d.vec2f(1, 1), d.vec2f(0, 1), d.vec2f(1, 0), d.vec2f(0, 0)];

  return {
    pos: d.vec4f(pos[input.idx].x, pos[input.idx].y, 0.0, 1.0),
    uv: uv[input.idx],
  };
});

const fragmentMain = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const x = d.i32(input.uv.x * d.f32(gridSizeUniform.value));
  const y = d.i32(input.uv.y * d.f32(gridSizeUniform.value));

  const index = coordsToIndex({ x, y });
  const cell = inputGridSlot.value[index];
  const density = std.max(0, cell.z);

  const obstacleColor = d.vec4f(0.1, 0.1, 0.1, 1);

  const background = d.vec4f(0.9, 0.9, 0.9, 1);
  const firstColor = d.vec4f(0.2, 0.6, 1, 1);
  const secondColor = d.vec4f(0.2, 0.3, 0.6, 1);
  const thirdColor = d.vec4f(0.1, 0.2, 0.4, 1);

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
    return std.mix(background, firstColor, t);
  }

  if (density <= secondThreshold) {
    return std.mix(
      firstColor,
      secondColor,
      (density - firstThreshold) / (secondThreshold - firstThreshold),
    );
  }

  return std.mix(
    secondColor,
    thirdColor,
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
    },

    applyMovedObstacles(bufferData: d.Infer<BoxObstacle>[]) {
      obstaclesBuffer.write(bufferData);
      moveObstaclesPipeline.dispatchWorkgroups(1);
      prevObstaclesBuffer.write(bufferData);
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
