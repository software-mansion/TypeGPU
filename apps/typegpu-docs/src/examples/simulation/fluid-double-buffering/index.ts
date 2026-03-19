import { randf } from '@typegpu/noise';
import tgpu, { d, std, type TgpuBufferMutable, type TgpuBufferReadonly } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

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
  center: d.vec2i,
  size: d.vec2i,
  enabled: d.u32,
});

const gridSize = 256;

const inputGridSlot = tgpu.slot<TgpuBufferReadonly<GridData> | TgpuBufferMutable<GridData>>();
const outputGridSlot = tgpu.slot<TgpuBufferMutable<GridData>>();

const MAX_OBSTACLES = 4;
const BoxObstacleArray = d.arrayOf(BoxObstacle, MAX_OBSTACLES);

const isValidCoord = (x: number, y: number): boolean => {
  'use gpu';
  return x < gridSize && x >= 0 && y < gridSize && y >= 0;
};

const coordsToIndex = (x: number, y: number) => {
  'use gpu';
  return x + y * gridSize;
};

const getCell = (x: number, y: number): d.v4f => {
  'use gpu';
  return d.vec4f(inputGridSlot.$[coordsToIndex(x, y)]);
};

const setCell = (x: number, y: number, value: d.v4f) => {
  'use gpu';
  const index = coordsToIndex(x, y);
  outputGridSlot.$[index] = d.vec4f(value);
};

const setVelocity = (x: number, y: number, velocity: d.v2f) => {
  'use gpu';
  const index = coordsToIndex(x, y);
  outputGridSlot.$[index].x = velocity.x;
  outputGridSlot.$[index].y = velocity.y;
};

const addDensity = (x: number, y: number, density: number) => {
  'use gpu';
  const index = coordsToIndex(x, y);
  outputGridSlot.$[index].z = inputGridSlot.$[index].z + density;
};

const flowFromCell = (myX: number, myY: number, x: number, y: number) => {
  'use gpu';
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

  if (myX === x && myY === y) {
    // 'src.z - outFlow' is how much is left in the src
    return src.z - outFlow;
  }

  if (destPos.x === myX && destPos.y === myY) {
    return outFlow;
  }

  return 0;
};

const root = await tgpu.init();

const gridAlphaBuffer = root.createBuffer(GridData).$usage('storage');
const gridBetaBuffer = root.createBuffer(GridData).$usage('storage');
const prevObstacles = root.createReadonly(BoxObstacleArray);
const obstacles = root.createReadonly(BoxObstacleArray);
const time = root.createUniform(d.f32);

const isInsideObstacle = (x: number, y: number): boolean => {
  'use gpu';
  for (const obs of obstacles.$) {
    if (obs.enabled === 0) {
      continue;
    }

    const minX = std.max(0, obs.center.x - d.i32(obs.size.x / 2));
    const maxX = std.min(gridSize, obs.center.x + d.i32(obs.size.x / 2));
    const minY = std.max(0, obs.center.y - d.i32(obs.size.y / 2));
    const maxY = std.min(gridSize, obs.center.y + d.i32(obs.size.y / 2));

    if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
      return true;
    }
  }

  return false;
};

const isValidFlowOut = (x: number, y: number): boolean => {
  'use gpu';
  if (!isValidCoord(x, y)) {
    return false;
  }

  if (isInsideObstacle(x, y)) {
    return false;
  }

  return true;
};

const computeVelocity = (x: number, y: number): d.v2f => {
  'use gpu';
  const gravityCost = 0.5;

  const neighborOffsets = [d.vec2i(0, 1), d.vec2i(0, -1), d.vec2i(1, 0), d.vec2i(-1, 0)];

  const cell = getCell(x, y);
  let leastCost = cell.z;

  const dirChoices = [d.vec2f(0, 0), d.vec2f(0, 0), d.vec2f(0, 0), d.vec2f(0, 0)];
  let dirChoiceCount = 1;

  for (const offset of tgpu.unroll(neighborOffsets)) {
    const neighborDensity = getCell(x + offset.x, y + offset.y);
    const cost = neighborDensity.z + d.f32(offset.y) * gravityCost;

    if (isValidFlowOut(x + offset.x, y + offset.y)) {
      if (cost === leastCost) {
        dirChoices[dirChoiceCount] = d.vec2f(d.f32(offset.x), d.f32(offset.y));
        dirChoiceCount++;
      } else if (cost < leastCost) {
        leastCost = cost;
        dirChoices[0] = d.vec2f(d.f32(offset.x), d.f32(offset.y));
        dirChoiceCount = 1;
      }
    }
  }

  const leastCostDir = dirChoices[d.u32(randf.sample() * d.f32(dirChoiceCount))];
  return d.vec2f(leastCostDir);
};

const moveObstacles = () => {
  'use gpu';
  for (let obsIdx = 0; obsIdx < MAX_OBSTACLES; obsIdx++) {
    const obs = prevObstacles.$[obsIdx];
    const nextObs = obstacles.$[obsIdx];

    if (obs.enabled === 0) {
      continue;
    }

    const diff = std.sub(nextObs.center.xy, obs.center.xy);

    const minX = std.max(0, obs.center.x - d.i32(obs.size.x / 2));
    const maxX = std.min(gridSize, obs.center.x + d.i32(obs.size.x / 2));
    const minY = std.max(0, obs.center.y - d.i32(obs.size.y / 2));
    const maxY = std.min(gridSize, obs.center.y + d.i32(obs.size.y / 2));

    const nextMinX = std.max(0, nextObs.center.x - d.i32(obs.size.x / 2));
    const nextMaxX = std.min(gridSize, nextObs.center.x + d.i32(obs.size.x / 2));
    const nextMinY = std.max(0, nextObs.center.y - d.i32(obs.size.y / 2));
    const nextMaxY = std.min(gridSize, nextObs.center.y + d.i32(obs.size.y / 2));

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
    for (let y = std.max(1, nextMinY); y <= std.min(nextMaxY, gridSize - 2); y++) {
      const newVel = computeVelocity(nextMaxX + 2, y);
      setVelocity(nextMaxX + 2, y, newVel);
    }
  }
};

let sourceIntensity = 0.1;
let sourceRadius = 0.01;

const sourceParams = root.createUniform(
  d.struct({
    center: d.vec2f,
    radius: d.f32,
    intensity: d.f32,
  }),
);

const getMinimumInFlow = (x: number, y: number): number => {
  'use gpu';
  const gridSizeF = d.f32(gridSize);
  const sourceRadius = std.max(1, sourceParams.$.radius * gridSizeF);
  const sourcePos = d.vec2f(
    sourceParams.$.center.x * gridSizeF,
    sourceParams.$.center.y * gridSizeF,
  );

  if (std.distance(d.vec2f(d.f32(x), d.f32(y)), sourcePos) < sourceRadius) {
    return sourceParams.$.intensity;
  }

  return 0;
};

const simulate = (xu: number, yu: number) => {
  'use gpu';
  const x = d.i32(xu);
  const y = d.i32(yu);
  const index = coordsToIndex(x, y);

  randf.seed2(d.vec2f(d.f32(index), time.$));

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

  const minInflow = getMinimumInFlow(x, y);
  next.z = std.max(minInflow, next.z);

  outputGridSlot.$[index] = d.vec4f(next);
};

const OBSTACLE_BOX = 0;
const OBSTACLE_LEFT_WALL = 1;

const obstaclesCpu: {
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
  return obstaclesCpu.map(({ x, y, width, height, enabled }) => ({
    center: d.vec2i(Math.round(x * gridSize), Math.round(y * gridSize)),
    size: d.vec2i(Math.round(width * gridSize), Math.round(height * gridSize)),
    enabled: enabled ? 1 : 0,
  }));
}

let boxX = 0.5;
const limitedBoxX = () => {
  const leftWallWidth = obstaclesCpu[OBSTACLE_LEFT_WALL].width;
  return Math.max(boxX, leftWallX + leftWallWidth / 2 + 0.15);
};

let boxY = 0.2;
let leftWallX = 0;

const vertexMain = tgpu.vertexFn({
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

const fragmentMain = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const x = d.i32(input.uv.x * d.f32(gridSize));
  const y = d.i32(input.uv.y * d.f32(gridSize));

  const index = coordsToIndex(x, y);
  const cell = inputGridSlot.$[index];
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

  return std.mix(secondColor, thirdColor, std.min((density - secondThreshold) / thirdThreshold, 1));
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

function makePipelines(
  inputGridReadonly: TgpuBufferReadonly<GridData>,
  outputGridMutable: TgpuBufferMutable<GridData>,
) {
  const initWorldPipeline = root
    .with(outputGridSlot, outputGridMutable)
    .createGuardedComputePipeline((xu, yu) => {
      'use gpu';
      const x = d.i32(xu);
      const y = d.i32(yu);
      const index = coordsToIndex(x, y);

      let value = d.vec4f();

      if (!isValidFlowOut(x, y)) {
        value = d.vec4f();
      } else {
        // Ocean
        if (y < d.i32(gridSize / 2)) {
          const depth = 1 - d.f32(y) / (d.f32(gridSize) / 2);
          value = d.vec4f(0, 0, 10 + depth * 10, 0);
        }
      }

      outputGridSlot.$[index] = d.vec4f(value);
    });

  const simulatePipeline = root
    .with(inputGridSlot, inputGridReadonly)
    .with(outputGridSlot, outputGridMutable)
    .createGuardedComputePipeline(simulate);

  const moveObstaclesPipeline = root
    .with(inputGridSlot, outputGridMutable)
    .with(outputGridSlot, outputGridMutable)
    .createGuardedComputePipeline(moveObstacles);

  const renderPipeline = root.with(inputGridSlot, inputGridReadonly).createRenderPipeline({
    vertex: vertexMain,
    fragment: fragmentMain,

    primitive: { topology: 'triangle-strip' },
  });

  return {
    init() {
      initWorldPipeline.dispatchThreads(gridSize, gridSize);
    },

    applyMovedObstacles(bufferData: d.Infer<BoxObstacle>[]) {
      obstacles.write(bufferData);
      moveObstaclesPipeline.dispatchThreads();
      prevObstacles.write(bufferData);
    },

    compute() {
      simulatePipeline.dispatchThreads(gridSize, gridSize);
    },

    render() {
      renderPipeline
        .withColorAttachment({
          view: context,
          clearValue: [0, 0, 0, 1],
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

obstacles.write(obstaclesToConcrete());
prevObstacles.write(obstaclesToConcrete());
primary.init();

let msSinceLastTick = 0;
const timestep = 15;
const stepsPerTick = 64;

function tick() {
  time.write(Date.now() % 1000);

  sourceParams.write({
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

export const controls = defineControls({
  'source intensity': {
    initial: sourceIntensity,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value) => {
      sourceIntensity = value;
    },
  },

  'source radius': {
    initial: sourceRadius,
    min: 0.01,
    max: 0.1,
    step: 0.01,
    onSliderChange: (value) => {
      sourceRadius = value;
    },
  },

  'box x': {
    initial: boxX,
    min: 0.2,
    max: 0.8,
    step: 0.01,
    onSliderChange: (value) => {
      boxX = value;
      obstaclesCpu[OBSTACLE_BOX].x = limitedBoxX();
      primary.applyMovedObstacles(obstaclesToConcrete());
    },
  },

  'box y': {
    initial: boxY,
    min: 0.2,
    max: 0.85,
    step: 0.01,
    onSliderChange: (value) => {
      boxY = value;
      obstaclesCpu[OBSTACLE_BOX].y = boxY;
      primary.applyMovedObstacles(obstaclesToConcrete());
    },
  },

  'left wall: x': {
    initial: leftWallX,
    min: 0,
    max: 0.6,
    step: 0.01,
    onSliderChange: (value) => {
      leftWallX = value;
      obstaclesCpu[OBSTACLE_LEFT_WALL].x = leftWallX;
      obstaclesCpu[OBSTACLE_BOX].x = limitedBoxX();
      primary.applyMovedObstacles(obstaclesToConcrete());
    },
  },
});

export function onCleanup() {
  disposed = true;
  root.destroy();
}
