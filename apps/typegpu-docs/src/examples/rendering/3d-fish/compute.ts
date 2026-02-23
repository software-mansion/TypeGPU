import { d, std } from 'typegpu';
import * as p from './params.ts';
import { computeBindGroupLayout as layout } from './schemas.ts';
import { projectPointOnLine } from './tgsl-helpers.ts';

export const simulate = (fishIndex: number) => {
  'use gpu';
  const fishData = layout.$.currentFishData[fishIndex];
  let separation = d.vec3f();
  let alignment = d.vec3f();
  let alignmentCount = 0;
  let cohesion = d.vec3f();
  let cohesionCount = 0;
  let wallRepulsion = d.vec3f();
  let rayRepulsion = d.vec3f();

  for (let i = 0; i < p.fishAmount; i += 1) {
    if (d.u32(i) === fishIndex) {
      continue;
    }

    const other = layout.$.currentFishData[i];
    const dist = std.distance(fishData.position, other.position);
    if (dist < layout.$.fishBehavior.separationDist) {
      separation += fishData.position - other.position;
    }
    if (dist < layout.$.fishBehavior.alignmentDist) {
      alignment = alignment + other.direction;
      alignmentCount = alignmentCount + 1;
    }
    if (dist < layout.$.fishBehavior.cohesionDist) {
      cohesion = cohesion + other.position;
      cohesionCount = cohesionCount + 1;
    }
  }
  if (alignmentCount > 0) {
    alignment = alignment / alignmentCount;
  }
  if (cohesionCount > 0) {
    cohesion = cohesion / cohesionCount - fishData.position;
  }
  for (let i = 0; i < 3; i += 1) {
    const repulsion = d.vec3f();
    repulsion[i] = 1;

    const axisAquariumSize = p.aquariumSize[i] / 2;
    const axisPosition = fishData.position[i];
    const distance = p.fishWallRepulsionDistance;

    if (axisPosition > axisAquariumSize - distance) {
      const str = axisPosition - (axisAquariumSize - distance);
      wallRepulsion = wallRepulsion - (repulsion * str);
    }

    if (axisPosition < -axisAquariumSize + distance) {
      const str = -axisAquariumSize + distance - axisPosition;
      wallRepulsion = wallRepulsion + (repulsion * str);
    }
  }

  const proj = projectPointOnLine(fishData.position, layout.$.mouseRay);
  const diff = fishData.position - proj;
  const limit = p.fishMouseRayRepulsionDistance;
  const str = std.pow(2, std.clamp(limit - std.length(diff), 0, limit)) - 1;
  rayRepulsion = std.normalize(diff) * str;

  let direction = d.vec3f(fishData.direction);

  direction += separation * layout.$.fishBehavior.separationStr;
  direction += alignment * layout.$.fishBehavior.alignmentStr;
  direction += cohesion * layout.$.fishBehavior.cohesionStr;
  direction += wallRepulsion * p.fishWallRepulsionStrength;
  direction += rayRepulsion * p.fishMouseRayRepulsionStrength;
  direction = std.normalize(direction) *
    (std.clamp(std.length(fishData.direction), 0, 0.01));

  const translation = direction * (std.min(999, layout.$.timePassed) / 8);

  const nextFishData = layout.$.nextFishData[fishIndex];
  nextFishData.position = fishData.position + translation;
  nextFishData.direction = d.vec3f(direction);
};
