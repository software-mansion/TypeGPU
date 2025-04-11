import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as p from './params.ts';
import { computeBindGroupLayout as layout } from './schemas.ts';
import { distanceVectorFromLine } from './tgsl-helpers.ts';

export const computeShader = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [p.workGroupSize],
  })((input) => {
    const fishIndex = input.gid.x;
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
      const dist = std.length(std.sub(fishData.position, other.position));
      if (dist < p.fishSeparationDistance) {
        separation = std.add(
          separation,
          std.sub(fishData.position, other.position),
        );
      }
      if (dist < p.fishAlignmentDistance) {
        alignment = std.add(alignment, other.direction);
        alignmentCount = alignmentCount + 1;
      }
      if (dist < p.fishCohesionDistance) {
        cohesion = std.add(cohesion, other.position);
        cohesionCount = cohesionCount + 1;
      }
    }
    if (alignmentCount > 0) {
      alignment = std.mul(1 / d.f32(alignmentCount), alignment);
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
        wallRepulsion = std.sub(wallRepulsion, std.mul(str, repulsion));
      }

      if (axisPosition < -axisAquariumSize + distance) {
        const str = -axisAquariumSize + distance - axisPosition;
        wallRepulsion = std.add(wallRepulsion, std.mul(str, repulsion));
      }
    }

    if (layout.$.mouseRay.activated === 1) {
      const distanceVector = distanceVectorFromLine({
        lineStart: layout.$.mouseRay.pointX,
        lineEnd: layout.$.mouseRay.pointY,
        point: fishData.position,
      });
      const limit = p.fishMouseRayRepulsionDistance;
      const str =
        std.pow(2, std.clamp(limit - std.length(distanceVector), 0, limit)) - 1;
      rayRepulsion = std.mul(str, std.normalize(distanceVector));
    }

    fishData.direction = std.add(
      fishData.direction,
      std.mul(p.fishSeparationStrength, separation),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(p.fishAlignmentStrength, alignment),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(p.fishCohesionStrength, cohesion),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(p.fishWallRepulsionStrength, wallRepulsion),
    );
    fishData.direction = std.add(
      fishData.direction,
      std.mul(p.fishMouseRayRepulsionStrength, rayRepulsion),
    );

    fishData.direction = std.mul(
      std.clamp(std.length(fishData.direction), 0.0, 0.01),
      std.normalize(fishData.direction),
    );

    const translation = std.mul(
      d.f32(std.min(999, layout.$.timePassed)) / 8,
      fishData.direction,
    );
    fishData.position = std.add(fishData.position, translation);
    layout.$.nextFishData[fishIndex] = fishData;
  })
  .$name('compute shader');
