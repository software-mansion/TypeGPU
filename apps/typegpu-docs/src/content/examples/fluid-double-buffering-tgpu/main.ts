/*
{
  "title": "Fluid (double-buffering tgpu)",
  "category": "simulation"
}
*/

// @ts-nocheck

import { type WgslBufferUsage, builtin, createRuntime, wgsl } from 'typegpu';
import { type Parsed, arrayOf, f32, i32, struct, vec2f } from 'typegpu/data';
import code from './physics.tgpu';

const { BoxObstacle } = compile(code);

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const runtime = await createRuntime();

context.configure({
  device: runtime.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const gridSize = 256;
const gridSizeBuffer = wgsl.buffer(i32).$allowUniform();
const gridSizeUniform = gridSizeBuffer.asUniform();

const gridAlphaBuffer = wgsl.buffer(GridData).$allowMutable().$allowReadonly();
const gridBetaBuffer = wgsl.buffer(GridData).$allowMutable().$allowReadonly();

const MAX_OBSTACLES = 4;

const prevObstaclesBuffer = wgsl
  .buffer(arrayOf(BoxObstacle, MAX_OBSTACLES))
  .$allowReadonly();

const prevObstacleReadonly = prevObstaclesBuffer.asReadonly();

const obstaclesBuffer = wgsl
  .buffer(arrayOf(BoxObstacle, MAX_OBSTACLES))
  .$allowMutable()
  .$allowReadonly();

const obstaclesReadonly = obstaclesBuffer.asReadonly();

const timeBuffer = wgsl.buffer(f32).$allowUniform();

const mainInitWorld = wgsl.fn`
  (x: i32, y: i32) {
    let index = ${coordsToIndex('x', 'y')};

    var value = vec4f();

    if (!${isValidFlowOut}(x, y)) {
      value = vec4f(0., 0., 0., 0.);
    }
    else {
      // Ocean
      if (y < i32(${gridSizeUniform}) / 2) {
        let depth = 1. - f32(y) / (f32(${gridSizeUniform}) / 2.);
        value = vec4f(0., 0., 10. + depth * 10., 0.);
      }
    }

    ${outputGridSlot}[index] = value;
  }
`;

const mainMoveObstacles = wgsl.fn`
  () {
    for (var obs_idx = 0; obs_idx < ${MAX_OBSTACLES}; obs_idx += 1) {
      let obs = ${prevObstacleReadonly}[obs_idx];
      let next_obs = ${obstaclesReadonly}[obs_idx];

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
      for (var y = max(1, next_min_y); y <= min(next_max_y, ${gridSizeUniform} - 2); y += 1) {
        let new_vel = ${computeVelocity}(next_max_x + 2, y);
        ${setVelocity}(next_max_x + 2, y, new_vel);
      }
    }
  }
`.$name('main_move_obstacles');

const sourceIntensityPlum = addSliderPlumParameter('source intensity', 0.1, {
  min: 0,
  max: 1,
  step: 0.01,
});

const sourceRadiusPlum = addSliderPlumParameter('source radius', 0.01, {
  min: 0.01,
  max: 0.1,
  step: 0.01,
});

const sourceParamsBuffer = wgsl
  .buffer(
    struct({
      center: vec2f,
      radius: f32,
      intensity: f32,
    }),
    wgsl.plum((get) => ({
      center: [0.5, 0.9] as [number, number],
      intensity: get(sourceIntensityPlum),
      radius: get(sourceRadiusPlum),
    })),
  )
  .$allowUniform();

const getMinimumInFlow = wgsl.fn`
  (x: i32, y: i32) -> f32 {
    let source_params = ${sourceParamsBuffer.asUniform()};
    let grid_size_f = f32(${gridSizeUniform});
    let source_radius = max(1., source_params.radius * grid_size_f);
    let source_pos = vec2f(source_params.center.x * grid_size_f, source_params.center.y * grid_size_f);

    if (length(vec2f(f32(x), f32(y)) - source_pos) < source_radius) {
      return source_params.intensity;
    }

    return 0.;
  }
`;

const mainCompute = wgsl.fn`
  (x: i32, y: i32) {
    let index = ${coordsToIndex('x', 'y')};

    ${setupRandomSeed}(vec2f(f32(index), ${timeBuffer.asUniform()}));

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
  }
`.$name('main_compute');

const mainFragment = wgsl.fn`
  (x: i32, y: i32) -> vec4f {
    let index = ${coordsToIndex('x', 'y')};
    let cell = ${inputGridSlot}[index];
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

    if (${isInsideObstacle}(x, y)) {
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
  }
`.$name('main_fragment');

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

function obstaclesToConcrete(): Parsed<BoxObstacle>[] {
  return obstacles.map(({ x, y, width, height, enabled }) => ({
    center: [Math.round(x * gridSize), Math.round(y * gridSize)],
    size: [Math.round(width * gridSize), Math.round(height * gridSize)] as [
      number,
      number,
    ],
    enabled: enabled ? 1 : 0,
  }));
}

const boxXPlum = addSliderPlumParameter('box x', 0.5, {
  min: 0.2,
  max: 0.8,
  step: 0.01,
});

const limitedBoxXPlum = wgsl.plum((get) => {
  const boxX = get(boxXPlum);
  const leftWallX = get(leftWallXPlum);
  const leftWallWidth = obstacles[OBSTACLE_LEFT_WALL].width;
  return Math.max(boxX, leftWallX + leftWallWidth / 2 + 0.15);
});

const boxYPlum = addSliderPlumParameter('box y', 0.2, {
  min: 0.2,
  max: 0.85,
  step: 0.01,
});

const leftWallXPlum = addSliderPlumParameter('left wall: x', 0, {
  min: 0,
  max: 0.6,
  step: 0.01,
});

runtime.onPlumChange(limitedBoxXPlum, (newVal) => {
  obstacles[OBSTACLE_BOX].x = newVal;
  primary.applyMovedObstacles(obstaclesToConcrete());
});

runtime.onPlumChange(boxYPlum, (newVal) => {
  obstacles[OBSTACLE_BOX].y = newVal;
  primary.applyMovedObstacles(obstaclesToConcrete());
});

runtime.onPlumChange(leftWallXPlum, (newVal) => {
  obstacles[OBSTACLE_LEFT_WALL].x = newVal;
  primary.applyMovedObstacles(obstaclesToConcrete());
});

function makePipelines(
  inputGridReadonly: WgslBufferUsage<GridData, 'readonly'>,
  outputGridMutable: WgslBufferUsage<GridData, 'mutable'>,
) {
  const initWorldFn = mainInitWorld
    .with(inputGridSlot, outputGridMutable)
    .with(outputGridSlot, outputGridMutable);

  const initWorldPipeline = runtime.makeComputePipeline({
    code: wgsl`
      ${initWorldFn}(i32(${builtin.globalInvocationId}.x), i32(${builtin.globalInvocationId}.y));
    `,
  });

  const mainComputeWithIO = mainCompute
    .with(inputGridSlot, inputGridReadonly)
    .with(outputGridSlot, outputGridMutable);

  const computeWorkgroupSize = 8;
  const computePipeline = runtime.makeComputePipeline({
    workgroupSize: [computeWorkgroupSize, computeWorkgroupSize],
    code: wgsl`
      ${mainComputeWithIO}(i32(${builtin.globalInvocationId}.x), i32(${builtin.globalInvocationId}.y));
    `,
  });

  const moveObstaclesFn = mainMoveObstacles
    .with(inputGridSlot, outputGridMutable)
    .with(outputGridSlot, outputGridMutable);

  const moveObstaclesPipeline = runtime.makeComputePipeline({
    code: wgsl`
      ${moveObstaclesFn}();
    `,
  });

  const mainFragmentWithInput = mainFragment.with(
    inputGridSlot,
    inputGridReadonly,
  );

  const renderPipeline = runtime.makeRenderPipeline({
    vertex: {
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

        let outPos = vec4f(pos[${builtin.vertexIndex}].x, pos[${builtin.vertexIndex}].y, 0.0, 1.0);
        let outUv = uv[${builtin.vertexIndex}];
      `,
      output: {
        [builtin.position]: 'outPos',
        outUv: vec2f,
      },
    },

    fragment: {
      code: wgsl.code`
        let x = i32(outUv.x * f32(${gridSizeUniform}));
        let y = i32(outUv.y * f32(${gridSizeUniform}));
        return ${mainFragmentWithInput}(x, y);
      `,
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
    init() {
      initWorldPipeline.execute({ workgroups: [gridSize, gridSize] });
      runtime.flush();
    },

    applyMovedObstacles(bufferData: Parsed<BoxObstacle>[]) {
      runtime.writeBuffer(obstaclesBuffer, bufferData);
      moveObstaclesPipeline.execute();
      runtime.flush();

      runtime.writeBuffer(prevObstaclesBuffer, bufferData);
      runtime.flush();
    },

    compute() {
      computePipeline.execute({
        workgroups: [
          gridSize / computeWorkgroupSize,
          gridSize / computeWorkgroupSize,
        ],
      });
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

const even = makePipelines(
  // in
  gridAlphaBuffer.asReadonly(),
  // out
  gridBetaBuffer.asMutable(),
);

const odd = makePipelines(
  // in
  gridBetaBuffer.asReadonly(),
  // out
  gridAlphaBuffer.asMutable(),
);

let primary = even;

runtime.writeBuffer(gridSizeBuffer, gridSize);
runtime.writeBuffer(obstaclesBuffer, obstaclesToConcrete());
runtime.writeBuffer(prevObstaclesBuffer, obstaclesToConcrete());
primary.init();

let msSinceLastTick = 0;
const timestep = 15;
const stepsPerTick = 64;

function tick() {
  runtime.writeBuffer(timeBuffer, Date.now() % 1000);

  primary = primary === even ? odd : even;
  primary.compute();
  runtime.flush();
}

onFrame((deltaTime) => {
  msSinceLastTick += deltaTime;

  if (msSinceLastTick >= timestep) {
    for (let i = 0; i < stepsPerTick; ++i) {
      tick();
    }
    primary.render();
    runtime.flush();
    msSinceLastTick -= timestep;
  }
});

onCleanup(() => {
  runtime.dispose();
});
