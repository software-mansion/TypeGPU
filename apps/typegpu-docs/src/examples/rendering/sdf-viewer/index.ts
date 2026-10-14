/**
 * A gallery of every SDF in `@typegpu/sdf`, for checking their shapes at a glance.
 * 3D shapes stand in the front row, 2D shapes are extruded along Z in the back row.
 *
 * Click the canvas to look around, move with WASD, Space/Shift for up/down,
 * and scroll to change the movement speed.
 */

import * as sdf from '@typegpu/sdf';
import { d, std, tgpu } from 'typegpu';
import { Camera, setupFirstPersonCamera } from '../../common/setup-first-person-camera.ts';

const MAX_STEPS = 256;
const MAX_DIST = 80;
const SURF_DIST = 0.001;
// Shapes are spaced this far apart along X
const SPACING = 3;
// Zero-width SDFs (lines, curves, triangles) are given this thickness to be visible
const THICKNESS = 0.06;
// Half-depth of the extruded 2D shapes
const DEPTH = 0.2;

const skyColor = d.vec3f(0.7, 0.8, 0.9);

const functions3d = {
  sdSphere: (p: d.v3f) => {
    'use gpu';
    return sdf.sdSphere(p, 0.8);
  },
  sdBox3d: (p: d.v3f) => {
    'use gpu';
    return sdf.sdBox3d(p, d.vec3f(0.7));
  },
  sdRoundedBox3d: (p: d.v3f) => {
    'use gpu';
    return sdf.sdRoundedBox3d(p, d.vec3f(0.7), 0.2);
  },
  sdBoxFrame3d: (p: d.v3f) => {
    'use gpu';
    return sdf.sdBoxFrame3d(p, d.vec3f(0.7), 0.08);
  },
  sdCapsule: (p: d.v3f) => {
    'use gpu';
    return sdf.sdCapsule(p, d.vec3f(0, -0.6, 0), d.vec3f(0, 0.6, 0), 0.4);
  },
  sdCappedCylinder: (p: d.v3f) => {
    'use gpu';
    return sdf.sdCappedCylinder(p, 0.6, 0.8);
  },
  sdRhombus3d: (p: d.v3f) => {
    'use gpu';
    return sdf.sdRhombus3d(p, 0.8, 0.5, 0.3, 0.05);
  },
  sdLine3d: (p: d.v3f) => {
    'use gpu';
    return sdf.sdLine3d(p, d.vec3f(-0.6, -0.6, 0), d.vec3f(0.6, 0.6, 0)) - THICKNESS;
  },
  sdTriangle3d: (p: d.v3f) => {
    'use gpu';
    return (
      sdf.sdTriangle3d(p, d.vec3f(-0.7, -0.6, 0), d.vec3f(0.7, -0.6, 0), d.vec3f(0, 0.7, 0)) -
      THICKNESS
    );
  },
  sdTorus: (p: d.v3f) => {
    'use gpu';
    // the torus lies in the XZ plane; swizzling stands it up to face the camera
    return sdf.sdTorus(p.xzy, 0.6, 0.2);
  },
  sdCappedTorus: (p: d.v3f) => {
    'use gpu';
    return sdf.sdCappedTorus(p, d.vec2f(std.sin(2.2), std.cos(2.2)), 0.6, 0.15);
  },
} as const;

const functions2d = {
  sdDisk: (p: d.v2f) => {
    'use gpu';
    return sdf.sdDisk(p, 0.8);
  },
  sdBox2d: (p: d.v2f) => {
    'use gpu';
    return sdf.sdBox2d(p, d.vec2f(0.7));
  },
  sdRoundedBox2d: (p: d.v2f) => {
    'use gpu';
    return sdf.sdRoundedBox2d(p, d.vec2f(0.7), 0.25);
  },
  sdPie: (p: d.v2f) => {
    'use gpu';
    return sdf.sdPie(p, d.vec2f(std.sin(1), std.cos(1)), 0.8);
  },
  sdArc: (p: d.v2f) => {
    'use gpu';
    return sdf.sdArc(p, d.vec2f(std.sin(2), std.cos(2)), 0.7) - THICKNESS;
  },
  sdLine: (p: d.v2f) => {
    'use gpu';
    return sdf.sdLine(p, d.vec2f(-0.6, -0.6), d.vec2f(0.6, 0.6)) - THICKNESS;
  },
  sdBezier: (p: d.v2f) => {
    'use gpu';
    return sdf.sdBezier(p, d.vec2f(-0.7, -0.6), d.vec2f(0, 1.2), d.vec2f(0.7, -0.6)) - THICKNESS;
  },
  sdBezierApprox: (p: d.v2f) => {
    'use gpu';
    return (
      sdf.sdBezierApprox(p, d.vec2f(-0.7, -0.6), d.vec2f(0, 1.2), d.vec2f(0.7, -0.6)) - THICKNESS
    );
  },
  sdHexagon2d: (p: d.v2f) => {
    'use gpu';
    return sdf.sdHexagon2d(p, 0.7);
  },
  // same hexagon via the gradient variant, so both must render identically
  sdgHexagon2d: (p: d.v2f) => {
    'use gpu';
    return sdf.sdgHexagon2d(p, 0.7).x;
  },
} as const;

const floor = (p: d.v3f) => {
  'use gpu';
  return sdf.sdPlane(p, d.vec3f(0, 1, 0), 0);
};

// Fails to type-check if an SDF exported from `@typegpu/sdf` is missing from the gallery
const _allFunctions = {
  ...functions3d,
  ...functions2d,
  sdPlane: floor,
} satisfies Record<keyof typeof sdf & `sd${string}`, unknown>;

const keys3d = Object.keys(functions3d) as (keyof typeof functions3d)[];
const keys2d = Object.keys(functions2d) as (keyof typeof functions2d)[];
const COUNT_3D = keys3d.length;
const COUNT_2D = keys2d.length;

const Shape = d.struct({
  color: d.vec3f,
  dist: d.f32,
});

const Ray = d.struct({
  origin: d.vec3f,
  direction: d.vec3f,
});

const shapeUnion = (a: d.Infer<typeof Shape>, b: d.Infer<typeof Shape>) => {
  'use gpu';
  return Shape({
    color: std.select(a.color, b.color, a.dist > b.dist),
    dist: std.min(a.dist, b.dist),
  });
};

/**
 * Gives each shape a distinct color.
 */
const palette = (index: number) => {
  'use gpu';
  // golden-ratio steps keep neighboring hues far apart
  const t = d.f32(index) * 0.618034;
  return d.vec3f(0.5) + 0.4 * std.cos(6.28318 * (d.vec3f(t) + d.vec3f(0, 0.33, 0.67)));
};

/**
 * Offset of the `index`-th shape in a row, centered around X = 0.
 */
const slot = (index: number, count: number, z: number) => {
  'use gpu';
  return d.vec3f((d.f32(index) - d.f32(count - 1) * 0.5) * SPACING, 1.2, d.f32(z));
};

const checkerBoard = (uv: d.v2f) => {
  'use gpu';
  const fuv = std.floor(uv);
  return std.abs(fuv.x + fuv.y) % 2;
};

const getSceneDist = (p: d.v3f) => {
  'use gpu';
  let res = Shape({
    color: std.mix(d.vec3f(1), d.vec3f(0.3), checkerBoard(p.xz * 0.5)),
    dist: floor(p),
  });

  let i = 0;
  for (const key of tgpu.unroll(keys3d)) {
    const dist = functions3d[key](p - slot(i, COUNT_3D, 0));
    res = shapeUnion(res, Shape({ color: palette(i), dist }));
    i += 1;
  }

  i = 0;
  for (const key of tgpu.unroll(keys2d)) {
    const q = p - slot(i, COUNT_2D, 4);
    const dist = sdf.opExtrudeZ(q, functions2d[key](q.xy), DEPTH);
    res = shapeUnion(res, Shape({ color: palette(COUNT_3D + i), dist }));
    i += 1;
  }

  return res;
};

const rayMarch = (ro: d.v3f, rd: d.v3f) => {
  'use gpu';
  let dO = d.f32(0);
  const result = Shape({ dist: d.f32(MAX_DIST), color: d.vec3f(skyColor) });

  for (let i = 0; i < MAX_STEPS; i++) {
    const scene = getSceneDist(ro + rd * dO);
    dO += scene.dist;

    if (dO > MAX_DIST || scene.dist < SURF_DIST) {
      result.dist = dO;
      result.color = d.vec3f(scene.color);
      break;
    }
  }

  return result;
};

const getNormal = (p: d.v3f) => {
  'use gpu';
  const dist = getSceneDist(p).dist;
  const e = 0.001;

  return std.normalize(
    d.vec3f(
      getSceneDist(p + d.vec3f(e, 0, 0)).dist - dist,
      getSceneDist(p + d.vec3f(0, e, 0)).dist - dist,
      getSceneDist(p + d.vec3f(0, 0, e)).dist - dist,
    ),
  );
};

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

// Give the canvas keyboard focus on click, so Space (fly up) doesn't scroll the page or
// activate whatever element was focused before.
canvas.tabIndex = 0;
canvas.addEventListener('mousedown', () => canvas.focus());
canvas.addEventListener('keydown', (event) => {
  if (event.key === ' ') {
    event.preventDefault();
  }
});

const cameraUniform = root.createUniform(Camera);

/**
 * Returns the ray going through `uv` (in clip space) from the camera.
 */
const getRayForUV = (uv: d.v2f) => {
  'use gpu';
  const camera = cameraUniform.$;
  const farView = camera.projectionInverse * d.vec4f(uv, 1, 1);
  const farWorld = camera.viewInverse * d.vec4f(farView.xyz / farView.w, 1);
  return Ray({
    origin: camera.pos.xyz,
    direction: std.normalize(farWorld.xyz - camera.pos.xyz),
  });
};

const vertexMain = tgpu.vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0, 1),
    uv: pos[input.vertexIndex],
  };
});

const fragmentMain = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const ray = getRayForUV(uv);
  const march = rayMarch(ray.origin, ray.direction);

  if (march.dist >= MAX_DIST) {
    return d.vec4f(skyColor, 1);
  }

  const p = ray.origin + ray.direction * march.dist;
  const n = getNormal(p);
  const lightDir = std.normalize(d.vec3f(-0.5, 1, -0.7));
  const diffuse = std.max(std.dot(n, lightDir), 0);
  const color = march.color * (diffuse * 0.8 + 0.2);

  const fog = std.pow(march.dist / MAX_DIST, 2);
  return d.vec4f(std.mix(color, skyColor, fog), 1);
});

const { cleanupCamera, updatePosition } = setupFirstPersonCamera(
  canvas,
  {
    // far enough back that the whole gallery fits on screen at the start
    initPos: d.vec3f(0, 6, -38),
    speed: d.vec3f(0.01, 0.1, 1),
  },
  (props) => {
    cameraUniform.patch(props);
  },
);

const pipeline = root.createRenderPipeline({
  vertex: vertexMain,
  fragment: fragmentMain,
});

let isRunning = true;

function draw() {
  if (!isRunning) {
    return;
  }

  updatePosition();
  pipeline.withColorAttachment({ view: context }).draw(3);

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

// #region Example controls and cleanup

export function onCleanup() {
  isRunning = false;
  cleanupCamera();
  root.destroy();
}

// #endregion
