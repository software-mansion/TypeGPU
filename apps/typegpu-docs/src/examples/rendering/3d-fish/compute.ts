import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
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
    const dist = std.length(fishData.position.sub(other.position));
    if (dist < layout.$.fishBehavior.separationDist) {
      separation = separation.add(fishData.position.sub(other.position));
    }
    if (dist < layout.$.fishBehavior.alignmentDist) {
      alignment = alignment.add(other.direction);
      alignmentCount = alignmentCount + 1;
    }
    if (dist < layout.$.fishBehavior.cohesionDist) {
      cohesion = cohesion.add(other.position);
      cohesionCount = cohesionCount + 1;
    }
  }
  if (alignmentCount > 0) {
    alignment = alignment.mul(1 / d.f32(alignmentCount));
  }
  if (cohesionCount > 0) {
    cohesion = std.sub(
      std.mul(1 / d.f32(cohesionCount), cohesion),
      fishData.position,
    );
  }
  for (let i = 0; i < 3; i += 1) {
    const repulsion = d.vec3f();
    repulsion[i] = 1.0;

    const axisAquariumSize = p.aquariumSize[i] / 2;
    const axisPosition = fishData.position[i];
    const distance = p.fishWallRepulsionDistance;

    if (axisPosition > axisAquariumSize - distance) {
      const str = axisPosition - (axisAquariumSize - distance);
      wallRepulsion = wallRepulsion.sub(repulsion.mul(str));
    }

    if (axisPosition < -axisAquariumSize + distance) {
      const str = -axisAquariumSize + distance - axisPosition;
      wallRepulsion = wallRepulsion.add(repulsion.mul(str));
    }
  }

  if (layout.$.mouseRay.activated === 1) {
    const proj = projectPointOnLine(
      fishData.position,
      layout.$.mouseRay.line,
    );
    const diff = fishData.position.sub(proj);
    const limit = p.fishMouseRayRepulsionDistance;
    const str = std.pow(2, std.clamp(limit - std.length(diff), 0, limit)) - 1;
    rayRepulsion = std.normalize(diff).mul(str);
  }

  let direction = d.vec3f(fishData.direction);

  direction = direction.add(
    separation.mul(layout.$.fishBehavior.separationStr),
  );
  direction = direction.add(
    alignment.mul(layout.$.fishBehavior.alignmentStr),
  );
  direction = direction.add(
    cohesion.mul(layout.$.fishBehavior.cohesionStr),
  );
  direction = direction.add(
    wallRepulsion.mul(p.fishWallRepulsionStrength),
  );
  direction = direction.add(
    rayRepulsion.mul(p.fishMouseRayRepulsionStrength),
  );
  direction = std.normalize(direction).mul(
    std.clamp(std.length(fishData.direction), 0, 0.01),
  );

  const translation = direction.mul(
    d.f32(std.min(999, layout.$.timePassed)) / 8,
  );

  const nextFishData = layout.$.nextFishData[fishIndex];
  nextFishData.position = fishData.position.add(translation);
  nextFishData.direction = d.vec3f(direction);
};
