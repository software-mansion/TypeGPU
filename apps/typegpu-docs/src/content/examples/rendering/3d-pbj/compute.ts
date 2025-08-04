import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as p from './params.ts';
import { computeBindGroupLayout as layout, ModelData } from './schemas.ts';
import { projectPointOnLine } from './tgsl-helpers.ts';

export const computeShader = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [p.workGroupSize],
})((input) => {
  const fishIndex = input.gid.x;
  // TODO: replace it with struct copy when Chromium is fixed
  const fishData = ModelData({
    position: layout.$.currentFishData[fishIndex].position,
    direction: layout.$.currentFishData[fishIndex].direction,
    scale: layout.$.currentFishData[fishIndex].scale,
    variant: layout.$.currentFishData[fishIndex].variant,
    applySeaDesaturation:
      layout.$.currentFishData[fishIndex].applySeaDesaturation,
    applySeaFog: layout.$.currentFishData[fishIndex].applySeaFog,
    applySinWave: layout.$.currentFishData[fishIndex].applySinWave,
  });
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

    // TODO: replace it with struct copy when Chromium is fixed
    const other = ModelData({
      position: layout.$.currentFishData[i].position,
      direction: layout.$.currentFishData[i].direction,
      scale: layout.$.currentFishData[i].scale,
      variant: layout.$.currentFishData[i].variant,
      applySeaDesaturation: layout.$.currentFishData[i].applySeaDesaturation,
      applySeaFog: layout.$.currentFishData[i].applySeaFog,
      applySinWave: layout.$.currentFishData[i].applySinWave,
    });
    const dist = std.length(std.sub(fishData.position, other.position));
    if (dist < layout.$.fishBehavior.separationDist) {
      separation = std.add(
        separation,
        std.sub(fishData.position, other.position),
      );
    }
    if (dist < layout.$.fishBehavior.alignmentDist) {
      alignment = std.add(alignment, other.direction);
      alignmentCount = alignmentCount + 1;
    }
    if (dist < layout.$.fishBehavior.cohesionDist) {
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
    const proj = projectPointOnLine(
      fishData.position,
      layout.$.mouseRay.line,
    );
    const diff = std.sub(fishData.position, proj);
    const limit = p.fishMouseRayRepulsionDistance;
    const str = std.pow(2, std.clamp(limit - std.length(diff), 0, limit)) - 1;
    rayRepulsion = std.mul(str, std.normalize(diff));
  }

  fishData.direction = std.add(
    fishData.direction,
    std.mul(layout.$.fishBehavior.separationStr, separation),
  );
  fishData.direction = std.add(
    fishData.direction,
    std.mul(layout.$.fishBehavior.alignmentStr, alignment),
  );
  fishData.direction = std.add(
    fishData.direction,
    std.mul(layout.$.fishBehavior.cohesionStr, cohesion),
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
});
