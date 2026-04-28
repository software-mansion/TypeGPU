// oxlint-disable typescript/no-explicit-any
// These tests won't be in the final PR, they are here only as a sanity check.

import { describe, expect, it } from 'vitest';
import { getMetaData } from '../../src/shared/meta.ts';
import { stringifyNode } from '../../src/shared/tseynit.ts';

// Everything below is a stub — the 'use gpu' arrow functions are never called
// at runtime; declarations only silence TypeScript overload errors.
declare const tgpu: any;
declare const d: any;
declare const std: any;
// standalone std functions used without the std. namespace
declare const floor: any;
declare const fract: any;
declare const mix: any;
declare const dot: any;

// perlin noise helpers
declare const pos: any;
declare const dotProdGrid: any;
declare const quinticInterpolation: any;
declare const quinticDerivative: any;
declare const getJunctionGradientSlot: any;

// boids
declare const TriangleData: any;
declare const layout: any;
declare const index: any;
declare const params: any;
declare const triangleSize: number;

// fish
declare const fishIndex: any;
// p doubles as fish-params module and pbr position arg; any covers both
declare const p: any;
declare const projectPointOnLine: any;

// gravity
declare const timeAccess: any;
declare const input: any;
declare const CelestialBody: any;
declare const computeLayout: any;
declare const radiusOf: any;
declare const none: any;
declare const bounce: any;
declare const merge: any;
declare const isSmaller: any;

// slime-mold
declare const gid: any;
declare const NUM_AGENTS: number;
declare const randf: any;
declare const agentsData: any;
declare const sense: any;
declare const deltaTime: any;
declare const Agent: any;

// game-of-life / pbr shared names
// n doubles as Neighbors8 struct and normal vector; any covers both
declare const n: any;

// pbr
declare const light: any;
declare const v: any;
declare const material: any;
declare const f0: any;
declare const distributionGGX: any;
declare const geometrySmith: any;
declare const fresnelSchlick: any;
declare const PI: number;
declare const materialAccess: any;
declare const LIGHT_COUNT: number;
declare const evaluateLight: any;
declare const lightsAccess: any;
declare const envMapLayout: any;
declare const perlin3d: any;

// pom
declare const roughness: any;
declare const NdotH: any;
declare const NdotV: any;
declare const NdotL: any;

// suika
declare const local: any;
// dist doubles as a free-variable param in suika and a locally-declared const
// in pbr/fish bodies — shadowing is fine
declare const dist: any;
declare const daylight: any;
declare const WALL_COLOR: any;

function getBodyAst(fn: () => void) {
  const ast = getMetaData(fn)?.ast?.body;
  if (!ast) {
    throw new Error('Expected ast to be defined');
  }
  return ast;
}

describe('complex use-gpu function AST snapshots', () => {
  it('perlin-3d sample — 8 corner dot-products + 3D trilinear mix', () => {
    const fn = () => {
      'use gpu';
      const minJunction = floor(pos);

      const xyz = dotProdGrid(pos, minJunction);
      const xyZ = dotProdGrid(pos, minJunction + d.vec3f(0, 0, 1));
      const xYz = dotProdGrid(pos, minJunction + d.vec3f(0, 1, 0));
      const xYZ = dotProdGrid(pos, minJunction + d.vec3f(0, 1, 1));
      const Xyz = dotProdGrid(pos, minJunction + d.vec3f(1, 0, 0));
      const XyZ = dotProdGrid(pos, minJunction + d.vec3f(1, 0, 1));
      const XYz = dotProdGrid(pos, minJunction + d.vec3f(1, 1, 0));
      const XYZ = dotProdGrid(pos, minJunction + d.vec3f(1, 1, 1));

      const partial = pos - minJunction;
      const smoothPartial = quinticInterpolation(partial);

      const xy = mix(xyz, xyZ, smoothPartial.z);
      const xY = mix(xYz, xYZ, smoothPartial.z);
      const Xy = mix(Xyz, XyZ, smoothPartial.z);
      const XY = mix(XYz, XYZ, smoothPartial.z);

      const x = mix(xy, xY, smoothPartial.y);
      const X = mix(Xy, XY, smoothPartial.y);

      return mix(x, X, smoothPartial.x);
    };
    expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
      "{
        const minJunction = floor(pos);
        const xyz = dotProdGrid(pos, minJunction);
        const xyZ = dotProdGrid(pos, minJunction + d.vec3f(0, 0, 1));
        const xYz = dotProdGrid(pos, minJunction + d.vec3f(0, 1, 0));
        const xYZ = dotProdGrid(pos, minJunction + d.vec3f(0, 1, 1));
        const Xyz = dotProdGrid(pos, minJunction + d.vec3f(1, 0, 0));
        const XyZ = dotProdGrid(pos, minJunction + d.vec3f(1, 0, 1));
        const XYz = dotProdGrid(pos, minJunction + d.vec3f(1, 1, 0));
        const XYZ = dotProdGrid(pos, minJunction + d.vec3f(1, 1, 1));
        const partial = pos - minJunction;
        const smoothPartial = quinticInterpolation(partial);
        const xy = mix(xyz, xyZ, smoothPartial.z);
        const xY = mix(xYz, xYZ, smoothPartial.z);
        const Xy = mix(Xyz, XyZ, smoothPartial.z);
        const XY = mix(XYz, XYZ, smoothPartial.z);
        const x = mix(xy, xY, smoothPartial.y);
        const X = mix(Xy, XY, smoothPartial.y);
        return mix(x, X, smoothPartial.x);
      }"
    `);
  });

  it('perlin-2d sampleWithGradient — noise + analytic gradient', () => {
    const fn = () => {
      'use gpu';
      const i = d.vec2i(floor(pos));
      const f = fract(pos);

      const u = quinticInterpolation(f);
      const du = quinticDerivative(f);

      const ga = getJunctionGradientSlot.$(i);
      const gb = getJunctionGradientSlot.$(i + d.vec2i(1, 0));
      const gc = getJunctionGradientSlot.$(i + d.vec2i(0, 1));
      const gd = getJunctionGradientSlot.$(i + d.vec2i(1, 1));

      const va = dot(ga, f - d.vec2f(0, 0));
      const vb = dot(gb, f - d.vec2f(1, 0));
      const vc = dot(gc, f - d.vec2f(0, 1));
      const vd = dot(gd, f - d.vec2f(1, 1));

      const noise = va + u.x * (vb - va) + u.y * (vc - va) + u.x * u.y * (va - vb - vc + vd);

      const grad =
        ga +
        u.x * (gb - ga) +
        u.y * (gc - ga) +
        u.x * u.y * (ga - gb - gc + gd) +
        du * (u.yx * (va - vb - vc + vd) + d.vec2f(vb, vc) - va);

      return d.vec3f(noise, grad);
    };
    expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
      "{
        const i = d.vec2i(floor(pos));
        const f = fract(pos);
        const u = quinticInterpolation(f);
        const du = quinticDerivative(f);
        const ga = getJunctionGradientSlot.$(i);
        const gb = getJunctionGradientSlot.$(i + d.vec2i(1, 0));
        const gc = getJunctionGradientSlot.$(i + d.vec2i(0, 1));
        const gd = getJunctionGradientSlot.$(i + d.vec2i(1, 1));
        const va = dot(ga, f - d.vec2f(0, 0));
        const vb = dot(gb, f - d.vec2f(1, 0));
        const vc = dot(gc, f - d.vec2f(0, 1));
        const vd = dot(gd, f - d.vec2f(1, 1));
        const noise = ((va + (u.x * (vb - va))) + (u.y * (vc - va))) + ((u.x * u.y) * (((va - vb) - vc) + vd));
        const grad = (((ga + (u.x * (gb - ga))) + (u.y * (gc - ga))) + ((u.x * u.y) * (((ga - gb) - gc) + gd))) + (du * (((u.yx * (((va - vb) - vc) + vd)) + d.vec2f(vb, vc)) - va));
        return d.vec3f(noise, grad);
      }"
    `);
  });

  it('boids simulate — for-of loop with separation/alignment/cohesion', () => {
    const fn = () => {
      'use gpu';
      const self = TriangleData(layout.$.currentTrianglePos[index]);
      let separation = d.vec2f();
      let alignment = d.vec2f();
      let cohesion = d.vec2f();
      let alignmentCount = 0;
      let cohesionCount = 0;

      for (const other of layout.$.currentTrianglePos) {
        const dist = std.distance(self.position, other.position);
        if (dist < params.$.separationDistance) {
          separation += self.position - other.position;
        }
        if (dist < params.$.alignmentDistance) {
          alignment += other.velocity;
          alignmentCount++;
        }
        if (dist < params.$.cohesionDistance) {
          cohesion += other.position;
          cohesionCount++;
        }
      }
      if (alignmentCount > 0) {
        alignment /= d.f32(alignmentCount);
      }
      if (cohesionCount > 0) {
        cohesion /= d.f32(cohesionCount);
        cohesion -= self.position;
      }

      const velocity =
        params.$.separationStrength * separation +
        params.$.alignmentStrength * alignment +
        params.$.cohesionStrength * cohesion;

      self.velocity += velocity;
      self.velocity = std.clamp(std.length(self.velocity), 0, 0.01) * std.normalize(self.velocity);

      self.position += self.velocity;

      const domain = (1 + triangleSize) * 2;
      self.position = (std.fract(self.position / domain + 0.5) - 0.5) * domain;

      layout.$.nextTrianglePos[index] = TriangleData(self);
    };
    expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
      "{
        const self = TriangleData(layout.$.currentTrianglePos[index]);
        let separation = d.vec2f();
        let alignment = d.vec2f();
        let cohesion = d.vec2f();
        let alignmentCount = 0;
        let cohesionCount = 0;
        for (const other of layout.$.currentTrianglePos) {
          const dist = std.distance(self.position, other.position);
          if (dist < params.$.separationDistance) {
            separation += self.position - other.position;
          }
          if (dist < params.$.alignmentDistance) {
            alignment += other.velocity;
            alignmentCount++;
          }
          if (dist < params.$.cohesionDistance) {
            cohesion += other.position;
            cohesionCount++;
          }
        }
        if (alignmentCount > 0) {
          alignment /= d.f32(alignmentCount);
        }
        if (cohesionCount > 0) {
          cohesion /= d.f32(cohesionCount);
          cohesion -= self.position;
        }
        const velocity = ((params.$.separationStrength * separation) + (params.$.alignmentStrength * alignment)) + (params.$.cohesionStrength * cohesion);
        self.velocity += velocity;
        self.velocity = std.clamp(std.length(self.velocity), 0, 0.01) * std.normalize(self.velocity);
        self.position += self.velocity;
        const domain = (1 + triangleSize) * 2;
        self.position = (std.fract((self.position / domain) + 0.5) - 0.5) * domain;
        layout.$.nextTrianglePos[index] = TriangleData(self);
      }"
    `);
  });

  it('fish simulate — 3D boids with wall and mouse-ray repulsion', () => {
    const fn = () => {
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
      for (const i of tgpu.unroll(std.range(3))) {
        const repulsion = d.vec3f();
        repulsion[i] = 1;

        const axisAquariumSize = p.aquariumSize[i] / 2;
        const axisPosition = fishData.position[i];
        const distance = p.fishWallRepulsionDistance;

        if (axisPosition > axisAquariumSize - distance) {
          const str = axisPosition - (axisAquariumSize - distance);
          wallRepulsion = wallRepulsion - repulsion * str;
        }

        if (axisPosition < -axisAquariumSize + distance) {
          const str = -axisAquariumSize + distance - axisPosition;
          wallRepulsion = wallRepulsion + repulsion * str;
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
      direction = std.normalize(direction) * std.clamp(std.length(fishData.direction), 0, 0.01);

      const translation = direction * (std.min(999, layout.$.timePassed) / 8);

      const nextFishData = layout.$.nextFishData[fishIndex];
      nextFishData.position = fishData.position + translation;
      nextFishData.direction = d.vec3f(direction);
    };
    expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
      "{
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
          cohesion = (cohesion / cohesionCount) - fishData.position;
        }
        for (const i of tgpu.unroll(std.range(3))) {
          const repulsion = d.vec3f();
          repulsion[i] = 1;
          const axisAquariumSize = p.aquariumSize[i] / 2;
          const axisPosition = fishData.position[i];
          const distance = p.fishWallRepulsionDistance;
          if (axisPosition > (axisAquariumSize - distance)) {
            const str = axisPosition - (axisAquariumSize - distance);
            wallRepulsion = wallRepulsion - (repulsion * str);
          }
          if (axisPosition < ((-axisAquariumSize) + distance)) {
            const str = ((-axisAquariumSize) + distance) - axisPosition;
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
        direction = std.normalize(direction) * std.clamp(std.length(fishData.direction), 0, 0.01);
        const translation = direction * (std.min(999, layout.$.timePassed) / 8);
        const nextFishData = layout.$.nextFishData[fishIndex];
        nextFishData.position = fishData.position + translation;
        nextFishData.direction = d.vec3f(direction);
      }"
    `);
  });

  it('gravity computeGravityShader — N-body gravity with destroyed-flag guard', () => {
    const fn = () => {
      'use gpu';
      const dt = timeAccess.$.passed * timeAccess.$.multiplier;
      const currentId = input.gid.x;
      const current = CelestialBody(computeLayout.$.inState[currentId]);

      if (current.destroyed === 0) {
        for (
          let otherId = d.u32(0);
          otherId < d.u32(computeLayout.$.celestialBodiesCount);
          otherId++
        ) {
          const other = computeLayout.$.inState[otherId];

          if (otherId === currentId || other.destroyed === 1) {
            continue;
          }

          const dist = std.max(
            radiusOf(current) + radiusOf(other),
            std.distance(current.position, other.position),
          );
          const gravityForce = (current.mass * other.mass) / dist / dist;

          const direction = std.normalize(other.position - current.position);
          current.velocity += direction * (gravityForce / current.mass) * dt;
        }

        current.position += current.velocity * dt;
      }

      computeLayout.$.outState[currentId] = CelestialBody(current);
    };
    expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
      "{
        const dt = timeAccess.$.passed * timeAccess.$.multiplier;
        const currentId = input.gid.x;
        const current = CelestialBody(computeLayout.$.inState[currentId]);
        if (current.destroyed === 0) {
          for (let otherId = d.u32(0); otherId < d.u32(computeLayout.$.celestialBodiesCount); otherId++) {
            const other = computeLayout.$.inState[otherId];
            if ((otherId === currentId) || (other.destroyed === 1)) {
              continue;
            }
            const dist = std.max(radiusOf(current) + radiusOf(other), std.distance(current.position, other.position));
            const gravityForce = ((current.mass * other.mass) / dist) / dist;
            const direction = std.normalize(other.position - current.position);
            current.velocity += (direction * (gravityForce / current.mass)) * dt;
          }
          current.position += current.velocity * dt;
        }
        computeLayout.$.outState[currentId] = CelestialBody(current);
      }"
    `);
  });

  it('gravity computeCollisionsShader — bounce and merge collision resolution', () => {
    const fn = () => {
      'use gpu';
      const currentId = input.gid.x;
      const current = CelestialBody(computeLayout.$.inState[currentId]);

      if (current.destroyed === 0) {
        for (
          let otherId = d.u32(0);
          otherId < d.u32(computeLayout.$.celestialBodiesCount);
          otherId++
        ) {
          const other = computeLayout.$.inState[otherId];
          if (
            otherId === currentId ||
            other.destroyed === 1 ||
            current.collisionBehavior === none ||
            other.collisionBehavior === none ||
            std.distance(current.position, other.position) >= radiusOf(current) + radiusOf(other)
          ) {
            continue;
          }

          if (current.collisionBehavior === bounce && other.collisionBehavior === bounce) {
            if (isSmaller(currentId, otherId)) {
              const dir = std.normalize(current.position - other.position);
              current.position = other.position + dir * (radiusOf(current) + radiusOf(other));
            }

            const posDiff = current.position - other.position;
            const velDiff = current.velocity - other.velocity;
            const posDiffFactor =
              (((2 * other.mass) / (current.mass + other.mass)) * std.dot(velDiff, posDiff)) /
              std.dot(posDiff, posDiff);

            current.velocity = (current.velocity - posDiff * posDiffFactor) * 0.99;
          } else {
            const isCurrentAbsorbed =
              current.collisionBehavior === bounce ||
              (current.collisionBehavior === merge && isSmaller(currentId, otherId));
            if (isCurrentAbsorbed) {
              current.destroyed = 1;
            } else {
              const m1 = current.mass;
              const m2 = other.mass;
              current.velocity =
                current.velocity * (m1 / (m1 + m2)) + other.velocity * (m2 / (m1 + m2));
              current.mass = m1 + m2;
            }
          }
        }
      }

      computeLayout.$.outState[currentId] = CelestialBody(current);
    };
    expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
      "{
        const currentId = input.gid.x;
        const current = CelestialBody(computeLayout.$.inState[currentId]);
        if (current.destroyed === 0) {
          for (let otherId = d.u32(0); otherId < d.u32(computeLayout.$.celestialBodiesCount); otherId++) {
            const other = computeLayout.$.inState[otherId];
            if (((((otherId === currentId) || (other.destroyed === 1)) || (current.collisionBehavior === none)) || (other.collisionBehavior === none)) || (std.distance(current.position, other.position) >= (radiusOf(current) + radiusOf(other)))) {
              continue;
            }
            if ((current.collisionBehavior === bounce) && (other.collisionBehavior === bounce)) {
              if (isSmaller(currentId, otherId)) {
                const dir = std.normalize(current.position - other.position);
                current.position = other.position + (dir * (radiusOf(current) + radiusOf(other)));
              }
              const posDiff = current.position - other.position;
              const velDiff = current.velocity - other.velocity;
              const posDiffFactor = (((2 * other.mass) / (current.mass + other.mass)) * std.dot(velDiff, posDiff)) / std.dot(posDiff, posDiff);
              current.velocity = (current.velocity - (posDiff * posDiffFactor)) * 0.99;
            } else {
              const isCurrentAbsorbed = (current.collisionBehavior === bounce) || ((current.collisionBehavior === merge) && isSmaller(currentId, otherId));
              if (isCurrentAbsorbed) {
                current.destroyed = 1;
              } else {
                const m1 = current.mass;
                const m2 = other.mass;
                current.velocity = (current.velocity * (m1 / (m1 + m2))) + (other.velocity * (m2 / (m1 + m2)));
                current.mass = m1 + m2;
              }
            }
          }
        }
        computeLayout.$.outState[currentId] = CelestialBody(current);
      }"
    `);
  });

  it('slime-mold updateAgents — sensing, turn logic, boundary wrapping', () => {
    const fn = () => {
      'use gpu';
      if (gid.x >= NUM_AGENTS) return;

      randf.seed(gid.x / NUM_AGENTS + 0.1);

      const dims = std.textureDimensions(computeLayout.$.oldState);

      const agent = agentsData.$[gid.x];
      const random = randf.sample();

      const weightForward = sense(agent.position, agent.angle, d.f32(0));
      const weightLeft = sense(agent.position, agent.angle, params.$.sensorAngle);
      const weightRight = sense(agent.position, agent.angle, -params.$.sensorAngle);

      let angle = agent.angle;

      if (weightForward > weightLeft && weightForward > weightRight) {
        // go straight — no-op
      } else if (weightForward < weightLeft && weightForward < weightRight) {
        angle = angle + (random * 2 - 1) * params.$.turnSpeed * deltaTime.$;
      } else if (weightRight > weightLeft) {
        angle = angle - params.$.turnSpeed * deltaTime.$;
      } else if (weightLeft > weightRight) {
        angle = angle + params.$.turnSpeed * deltaTime.$;
      }

      const dir = d.vec2f(std.cos(angle), std.sin(angle));
      let newPos = agent.position + dir * params.$.moveSpeed * deltaTime.$;

      const dimsf = d.vec2f(dims);
      if (newPos.x < 0 || newPos.x > dimsf.x || newPos.y < 0 || newPos.y > dimsf.y) {
        newPos = std.clamp(newPos, d.vec2f(0), dimsf - 1);

        if (newPos.x <= 0 || newPos.x >= dimsf.x - 1) {
          angle = Math.PI - angle;
        }
        if (newPos.y <= 0 || newPos.y >= dimsf.y - 1) {
          angle = -angle;
        }

        angle += (random - 0.5) * 0.1;
      }

      agentsData.$[gid.x] = Agent({
        position: newPos,
        angle,
      });

      const oldState = std.textureLoad(computeLayout.$.oldState, d.vec2u(newPos)).rgb;
      const newState = oldState + 1;
      std.textureStore(computeLayout.$.newState, d.vec2u(newPos), d.vec4f(newState, 1));
    };
    expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
      "{
        if (gid.x >= NUM_AGENTS)   return;
        randf.seed((gid.x / NUM_AGENTS) + 0.1);
        const dims = std.textureDimensions(computeLayout.$.oldState);
        const agent = agentsData.$[gid.x];
        const random = randf.sample();
        const weightForward = sense(agent.position, agent.angle, d.f32(0));
        const weightLeft = sense(agent.position, agent.angle, params.$.sensorAngle);
        const weightRight = sense(agent.position, agent.angle, -params.$.sensorAngle);
        let angle = agent.angle;
        if ((weightForward > weightLeft) && (weightForward > weightRight)) {

        } else   if ((weightForward < weightLeft) && (weightForward < weightRight)) {
          angle = angle + ((((random * 2) - 1) * params.$.turnSpeed) * deltaTime.$);
        } else   if (weightRight > weightLeft) {
          angle = angle - (params.$.turnSpeed * deltaTime.$);
        } else   if (weightLeft > weightRight) {
          angle = angle + (params.$.turnSpeed * deltaTime.$);
        }
        const dir = d.vec2f(std.cos(angle), std.sin(angle));
        let newPos = agent.position + ((dir * params.$.moveSpeed) * deltaTime.$);
        const dimsf = d.vec2f(dims);
        if ((((newPos.x < 0) || (newPos.x > dimsf.x)) || (newPos.y < 0)) || (newPos.y > dimsf.y)) {
          newPos = std.clamp(newPos, d.vec2f(0), dimsf - 1);
          if ((newPos.x <= 0) || (newPos.x >= (dimsf.x - 1))) {
            angle = Math.PI - angle;
          }
          if ((newPos.y <= 0) || (newPos.y >= (dimsf.y - 1))) {
            angle = -angle;
          }
          angle += (random - 0.5) * 0.1;
        }
        agentsData.$[gid.x] = Agent({ position: newPos, angle: angle });
        const oldState = std.textureLoad(computeLayout.$.oldState, d.vec2u(newPos)).rgb;
        const newState = oldState + 1;
        std.textureStore(computeLayout.$.newState, d.vec2u(newPos), d.vec4f(newState, 1));
      }"
    `);
  });

  it('game-of-life parallelCount8 — Wallace-tree full adder in bitpacked form', () => {
    const fn = () => {
      'use gpu';
      const l1_sum_a = n.nw ^ n.n ^ n.ne;
      const l1_car_a = (n.nw & n.n) | (n.ne & (n.nw ^ n.n));

      const l1_sum_b = n.w ^ n.e ^ n.sw;
      const l1_car_b = (n.w & n.e) | (n.sw & (n.w ^ n.e));

      const l1_sum_c = n.s ^ n.se;
      const l1_car_c = n.s & n.se;

      const bit0 = l1_sum_a ^ l1_sum_b ^ l1_sum_c;
      const l2_car_a = (l1_sum_a & l1_sum_b) | (l1_sum_c & (l1_sum_a ^ l1_sum_b));

      const l2_sum_b = l1_car_a ^ l1_car_b ^ l1_car_c;
      const l2_car_b = (l1_car_a & l1_car_b) | (l1_car_c & (l1_car_a ^ l1_car_b));

      const bit1 = l2_car_a ^ l2_sum_b;
      const l3_car_a = l2_car_a & l2_sum_b;

      const bit2 = l2_car_b ^ l3_car_a;
      const bit3 = l2_car_b & l3_car_a;

      return [bit0, bit1, bit2, bit3];
    };
    expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
      "{
        const l1_sum_a = (n.nw ^ n.n) ^ n.ne;
        const l1_car_a = (n.nw & n.n) | (n.ne & (n.nw ^ n.n));
        const l1_sum_b = (n.w ^ n.e) ^ n.sw;
        const l1_car_b = (n.w & n.e) | (n.sw & (n.w ^ n.e));
        const l1_sum_c = n.s ^ n.se;
        const l1_car_c = n.s & n.se;
        const bit0 = (l1_sum_a ^ l1_sum_b) ^ l1_sum_c;
        const l2_car_a = (l1_sum_a & l1_sum_b) | (l1_sum_c & (l1_sum_a ^ l1_sum_b));
        const l2_sum_b = (l1_car_a ^ l1_car_b) ^ l1_car_c;
        const l2_car_b = (l1_car_a & l1_car_b) | (l1_car_c & (l1_car_a ^ l1_car_b));
        const bit1 = l2_car_a ^ l2_sum_b;
        const l3_car_a = l2_car_a & l2_sum_b;
        const bit2 = l2_car_b ^ l3_car_a;
        const bit3 = l2_car_b & l3_car_a;
        return [bit0, bit1, bit2, bit3];
      }"
    `);
  });

  it('pbr evaluateLight — full Cook-Torrance specular + diffuse', () => {
    const fn = () => {
      'use gpu';
      const toLight = light.position - p;
      const dist = std.length(toLight);
      const l = std.normalize(toLight);
      const h = std.normalize(v + l);
      const radiance = light.color / dist ** 2;

      const ndotl = std.max(std.dot(n, l), 0);
      const ndoth = std.max(std.dot(n, h), 0);
      const ndotv = std.max(std.dot(n, v), 0.001);

      const ndf = distributionGGX(ndoth, material.roughness);
      const g = geometrySmith(ndotv, ndotl, material.roughness);
      const fresnel = fresnelSchlick(ndoth, f0);

      const specular = (fresnel * (ndf * g)) / (4 * ndotv * ndotl + 0.001);
      const kd = (1 - fresnel) * (1 - material.metallic);

      return ((kd * material.albedo) / PI + specular) * radiance * ndotl;
    };
    expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
      "{
        const toLight = light.position - p;
        const dist = std.length(toLight);
        const l = std.normalize(toLight);
        const h = std.normalize(v + l);
        const radiance = light.color / (dist ** 2);
        const ndotl = std.max(std.dot(n, l), 0);
        const ndoth = std.max(std.dot(n, h), 0);
        const ndotv = std.max(std.dot(n, v), 0.001);
        const ndf = distributionGGX(ndoth, material.roughness);
        const g = geometrySmith(ndotv, ndotl, material.roughness);
        const fresnel = fresnelSchlick(ndoth, f0);
        const specular = (fresnel * (ndf * g)) / (((4 * ndotv) * ndotl) + 0.001);
        const kd = (1 - fresnel) * (1 - material.metallic);
        return ((((kd * material.albedo) / PI) + specular) * radiance) * ndotl;
      }"
    `);
  });

  it('pbr shade — environment map + Perlin roughness offset + tone-map', () => {
    const fn = () => {
      'use gpu';
      const material = materialAccess.$;
      const f0 = std.mix(d.vec3f(0.04), material.albedo, material.metallic);

      let lo = d.vec3f(0);
      for (const i of tgpu.unroll(std.range(LIGHT_COUNT))) {
        lo += evaluateLight(p, n, v, lightsAccess.$[i], material, f0);
      }

      const reflectDir = std.reflect(v, n);

      const pScaled = p * 50;
      const roughOffset =
        d.vec3f(
          perlin3d.sample(pScaled),
          perlin3d.sample(pScaled + 100),
          perlin3d.sample(pScaled + 200),
        ) *
        material.roughness *
        0.3;
      const blurredReflectDir = std.normalize(reflectDir + roughOffset);

      const envColor = std.textureSampleLevel(
        envMapLayout.$.envMap,
        envMapLayout.$.envSampler,
        blurredReflectDir,
        material.roughness * 4,
      );

      const ndotv = std.max(std.dot(n, v), 0);

      const fresnel = fresnelSchlick(ndotv, f0);

      const reflectionTint = std.mix(d.vec3f(1), material.albedo, material.metallic);

      const reflectionStrength = 1 - material.roughness * 0.85;

      const envContribution = envColor.rgb.mul(fresnel).mul(reflectionTint).mul(reflectionStrength);

      const ambient = material.albedo.mul(material.ao * 0.05);
      const color = ambient.add(lo).add(envContribution);
      return std.pow(color.div(color.add(1)), d.vec3f(1 / 2.2));
    };
    expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
      "{
        const material = materialAccess.$;
        const f0 = std.mix(d.vec3f(0.04), material.albedo, material.metallic);
        let lo = d.vec3f(0);
        for (const i of tgpu.unroll(std.range(LIGHT_COUNT))) {
          lo += evaluateLight(p, n, v, lightsAccess.$[i], material, f0);
        }
        const reflectDir = std.reflect(v, n);
        const pScaled = p * 50;
        const roughOffset = (d.vec3f(perlin3d.sample(pScaled), perlin3d.sample(pScaled + 100), perlin3d.sample(pScaled + 200)) * material.roughness) * 0.3;
        const blurredReflectDir = std.normalize(reflectDir + roughOffset);
        const envColor = std.textureSampleLevel(envMapLayout.$.envMap, envMapLayout.$.envSampler, blurredReflectDir, material.roughness * 4);
        const ndotv = std.max(std.dot(n, v), 0);
        const fresnel = fresnelSchlick(ndotv, f0);
        const reflectionTint = std.mix(d.vec3f(1), material.albedo, material.metallic);
        const reflectionStrength = 1 - (material.roughness * 0.85);
        const envContribution = envColor.rgb.mul(fresnel).mul(reflectionTint).mul(reflectionStrength);
        const ambient = material.albedo.mul(material.ao * 0.05);
        const color = ambient.add(lo).add(envContribution);
        return std.pow(color.div(color.add(1)), d.vec3f(1 / 2.2));
      }"
    `);
  });

  it('pom distributionGGX — GGX/Trowbridge-Reitz NDF', () => {
    const fn = () => {
      'use gpu';
      const a = roughness * roughness;
      const a2 = a * a;
      const denom = NdotH * NdotH * (a2 - 1) + 1;
      return a2 / (Math.PI * denom * denom);
    };
    expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
      "{
        const a = roughness * roughness;
        const a2 = a * a;
        const denom = ((NdotH * NdotH) * (a2 - 1)) + 1;
        return a2 / ((Math.PI * denom) * denom);
      }"
    `);
  });

  it('pom geometrySmith — Smith geometry term combining two GGX-Schlick factors', () => {
    const fn = () => {
      'use gpu';
      const r = roughness + 1;
      const k = (r * r) / 8;
      const ggx1 = NdotV / (NdotV * (1 - k) + k);
      const ggx2 = NdotL / (NdotL * (1 - k) + k);
      return ggx1 * ggx2;
    };
    expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
      "{
        const r = roughness + 1;
        const k = (r * r) / 8;
        const ggx1 = NdotV / ((NdotV * (1 - k)) + k);
        const ggx2 = NdotL / ((NdotL * (1 - k)) + k);
        return ggx1 * ggx2;
      }"
    `);
  });

  it('suika wallColor — stripe + speck texture with edge shading', () => {
    const fn = () => {
      'use gpu';
      const stripe = std.abs(std.fract(local.x * 18.0 + local.y * 6.0) - 0.5);
      const stripeMask = std.clamp(0.55 - stripe * 1.6, 0, 1);
      const speck = std.abs(std.sin((local.x + local.y * 3.0) * 45.0)) * 0.04;
      const texture = stripeMask * 0.08 + speck;
      const edgeShade = std.clamp(0.35 - dist * 12.0, 0, 0.35);
      const baseColor = WALL_COLOR + d.vec3f(1, 0.8, 0.6) * (edgeShade + texture);
      return std.mix(baseColor * 0.35, baseColor, daylight);
    };
    expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
      "{
        const stripe = std.abs(std.fract((local.x * 18) + (local.y * 6)) - 0.5);
        const stripeMask = std.clamp(0.55 - (stripe * 1.6), 0, 1);
        const speck = std.abs(std.sin((local.x + (local.y * 3)) * 45)) * 0.04;
        const texture = (stripeMask * 0.08) + speck;
        const edgeShade = std.clamp(0.35 - (dist * 12), 0, 0.35);
        const baseColor = WALL_COLOR + (d.vec3f(1, 0.8, 0.6) * (edgeShade + texture));
        return std.mix(baseColor * 0.35, baseColor, daylight);
      }"
    `);
  });
});
