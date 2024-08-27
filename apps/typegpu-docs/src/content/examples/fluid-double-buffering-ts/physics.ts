import { bool, vec2u, vec4f } from 'typegpu/data/index';
import { rand01 } from './random.ts';

const gridSize = 512;
const maxObstacles = 4;

/**
 * x - velocity.x
 * y - velocity.y
 * z - density
 * w - <unused>
 */
const GridData = arrayOf(vec4f, gridSize ** 2);

const BoxObstacle = struct({
  center: vec2u,
  size: vec2u,
  enabled: u32,
});

const gridAlphaBuffer = tgpu.buffer(GridData).$allowMutable().$allowReadonly();
const gridBetaBuffer = tgpu.buffer(GridData).$allowMutable().$allowReadonly();

const inputGridSlot = tgpu
  .slot<WgslBufferUsage<GridData>>()
  .$name('input_grid');
const outputGridSlot = tgpu
  .slot<WgslBufferUsage<GridData, 'mutable'>>()
  .$name('output_grid');

const isValidCoord = tgpu.fn([i32, i32, bool]).impl(
  (x, y) => {
    return x < gridSize && x >= 0 && y < gridSize && y >= 0;
  },
  { gridSize },
);

const coordsToIndex = tgpu.fn([i32, i32], i32).impl(
  (x, y) => {
    return x + y * gridSize;
  },
  { gridSize },
);

const getCell = tgpu.fn([i32, i32], vec4f).impl(
  (x, y) => {
    const index = coordsToIndex(x, y);
    return inputGridSlot()[index];
  },
  { coordsToIndex, inputGridSlot },
);

const setCell = tgpu.fn([i32, i32], vec4f).impl(
  (x: i32, y: i32, value: vec4f) => {
    const index = coordsToIndex(x, y);
    outputGridSlot()[index] = value;
  },
  { coordsToIndex, outputGridSlot },
);

const setVelocity = tgpu.fn([i32, i32, vec2f]).impl(
  (x, y, velocity) => {
    const index = coordsToIndex(x, y);
    outputGridSlot()[index].x = velocity.x;
    outputGridSlot()[index].y = velocity.y;
  },
  { coordsToIndex, outputGridSlot },
);

const addDensity = tgpu.fn([i32, i32, f32]).impl(
  (x, y, density) => {
    const index = coordsToIndex(x, y);
    outputGridSlot()[index].z = inputGridSlot()[index].z + density;
  },
  { coordsToIndex, outputGridSlot, inputGridSlot },
);

const flowFromCell = tgpu.fn([i32, i32, i32, i32], f32).impl(
  (my_x, my_y, x, y) => {
    if (!isValidCoord(x, y)) {
      return 0;
    }

    const src = getCell(x, y);

    const dest_pos = vec2i(vec2f(f32(x), f32(y)) + src.xy);
    const dest = getCell(dest_pos.x, dest_pos.y);
    const diff = src.z - dest.z;
    let out_flow = min(max(0.01, 0.3 + diff * 0.1), src.z);

    if (length(src.xy) < 0.5) {
      out_flow = 0;
    }

    if (my_x == x && my_y == y) {
      // 'src.z - out_flow' is how much is left in the src
      return src.z - out_flow;
    }

    if (dest_pos.x == my_x && dest_pos.y == my_y) {
      return out_flow;
    }

    return 0;
  },
  { isValidCoord, getCell },
);

const isInsideObstacle = tgpu.fn([i32, i32], bool).impl(
  (x, y) => {
    for (let obs_idx = 0; obs_idx < maxObstacles; obs_idx += 1) {
      const obs = obstaclesReadonly()[obs_idx];

      if (obs.enabled == 0) {
        continue;
      }

      const min_x = i32(max(0, i32(obs.center.x) - i32(obs.size.x / 2)));
      const max_x = i32(max(0, i32(obs.center.x) + i32(obs.size.x / 2)));
      const min_y = i32(max(0, i32(obs.center.y) - i32(obs.size.y / 2)));
      const max_y = i32(max(0, i32(obs.center.y) + i32(obs.size.y / 2)));

      if (x >= min_x && x <= max_x && y >= min_y && y <= max_y) {
        return true;
      }
    }

    return false;
  },
  { maxObstacles },
);

const isValidFlowOut = tgpu.fn([i32, i32]).impl(
  (x, y) => {
    if (!isValidCoord(x, y)) {
      return false;
    }

    if (isInsideObstacle(x, y)) {
      return false;
    }

    return true;
  },
  { isValidCoord, isInsideObstacle },
);

const computeVelocity = tgpu.fn([i32, i32, vec2f]).impl(
  (x, y) => {
    const gravity_cost = 0.5;

    const neighbor_offsets = [
      vec2i(0, 1),
      vec2i(0, -1),
      vec2i(1, 0),
      vec2i(-1, 0),
    ];

    const cell = getCell(x, y);
    let least_cost = cell.z;

    // Direction choices of the same cost, one is chosen
    // randomly at the end of the process.
    let dir_choices = [(vec2f(0, 0), vec2f(0, 0), vec2f(0, 0), vec2f(0, 0))];
    let dir_choice_count = u32(1);

    for (let i = 0; i < 4; i++) {
      const offset = neighbor_offsets[i];
      const neighbor_density = getCell(x + offset.x, y + offset.y).z;
      const cost = neighbor_density + f32(offset.y) * gravity_cost;
      const valid = isValidFlowOut(x + offset.x, y + offset.y);

      if (!valid) {
        continue;
      }

      if (cost == least_cost) {
        // another valid direction
        dir_choices[dir_choice_count] = vec2f(f32(offset.x), f32(offset.y));
        dir_choice_count++;
      } else if (cost < least_cost) {
        // new best choice
        least_cost = cost;
        dir_choices[0] = vec2f(f32(offset.x), f32(offset.y));
        dir_choice_count = 1;
      }
    }

    const least_cost_dir = dir_choices[u32(rand01() * f32(dir_choice_count))];
    return least_cost_dir;
  },
  { getCell, isValidFlowOut, rand01 },
);
