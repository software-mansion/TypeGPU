/**
 * A gallery of every SDF in `@typegpu/sdf`, for checking their shapes at a glance.
 * 3D shapes stand in the front row, 2D shapes are extruded along Z in the back row.
 *
 * Click the canvas to look around, move with WASD, Space/Shift for up/down,
 * and scroll to change the movement speed.
 */

import {
  opExtrudeZ,
  sdArc,
  sdBezier,
  sdBezierApprox,
  sdBox2d,
  sdBox3d,
  sdBoxFrame3d,
  sdCappedCylinder,
  sdCappedTorus,
  sdCapsule,
  sdDisk,
  sdgHexagon2d,
  sdHexagon2d,
  sdLine,
  sdLine3d,
  sdPie,
  sdPlane,
  sdRhombus3d,
  sdRoundedBox2d,
  sdRoundedBox3d,
  sdSphere,
  sdTorus,
  sdTriangle3d,
} from '@typegpu/sdf';
import { d, std, tgpu } from 'typegpu';
import { Camera, setupFirstPersonCamera } from '../../common/setup-first-person-camera.ts';

const MAX_STEPS = 256;
const MAX_DIST = 80;
const SURF_DIST = 0.001;
// Shapes are spaced this far apart along X
const SPACING = 3;
// Zero-width SDFs (lines, curves, triangles) are given this thickness to be visible
const THICKNESS = 0.06;

const skyColor = d.vec3f(0.7, 0.8, 0.9);

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
  return std.add(
    d.vec3f(0.5),
    std.mul(0.4, std.cos(std.mul(6.28318, std.add(d.vec3f(t), d.vec3f(0, 0.33, 0.67))))),
  );
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

const shapes3d = (p: d.v3f) => {
  'use gpu';
  const count = 11;
  let res = Shape({
    color: palette(0),
    dist: sdSphere(p.sub(slot(0, count, 0)), 0.8),
  });
  res = shapeUnion(
    res,
    Shape({ color: palette(1), dist: sdBox3d(p.sub(slot(1, count, 0)), d.vec3f(0.7)) }),
  );
  res = shapeUnion(
    res,
    Shape({
      color: palette(2),
      dist: sdRoundedBox3d(p.sub(slot(2, count, 0)), d.vec3f(0.7), 0.2),
    }),
  );
  res = shapeUnion(
    res,
    Shape({
      color: palette(3),
      dist: sdBoxFrame3d(p.sub(slot(3, count, 0)), d.vec3f(0.7), 0.08),
    }),
  );
  res = shapeUnion(
    res,
    Shape({
      color: palette(4),
      dist: sdCapsule(p.sub(slot(4, count, 0)), d.vec3f(0, -0.6, 0), d.vec3f(0, 0.6, 0), 0.4),
    }),
  );
  res = shapeUnion(
    res,
    Shape({
      color: palette(5),
      dist: sdCappedCylinder(p.sub(slot(5, count, 0)), 0.6, 0.8),
    }),
  );
  res = shapeUnion(
    res,
    Shape({
      color: palette(6),
      dist: sdRhombus3d(p.sub(slot(6, count, 0)), 0.8, 0.5, 0.3, 0.05),
    }),
  );
  res = shapeUnion(
    res,
    Shape({
      color: palette(7),
      dist:
        sdLine3d(p.sub(slot(7, count, 0)), d.vec3f(-0.6, -0.6, 0), d.vec3f(0.6, 0.6, 0)) -
        THICKNESS,
    }),
  );
  res = shapeUnion(
    res,
    Shape({
      color: palette(8),
      dist:
        sdTriangle3d(
          p.sub(slot(8, count, 0)),
          d.vec3f(-0.7, -0.6, 0),
          d.vec3f(0.7, -0.6, 0),
          d.vec3f(0, 0.7, 0),
        ) - THICKNESS,
    }),
  );
  // the torus lies in the XZ plane; swizzling stands it up to face the camera
  const torusP = p.sub(slot(9, count, 0));
  res = shapeUnion(res, Shape({ color: palette(9), dist: sdTorus(torusP.xzy, 0.6, 0.2) }));
  res = shapeUnion(
    res,
    Shape({
      color: palette(10),
      dist: sdCappedTorus(
        p.sub(slot(10, count, 0)),
        d.vec2f(std.sin(2.2), std.cos(2.2)),
        0.6,
        0.15,
      ),
    }),
  );
  return res;
};

const shapes2d = (p: d.v3f) => {
  'use gpu';
  const count = 10;
  const z = 4;
  const depth = 0.2;

  let q = p.sub(slot(0, count, z));
  let res = Shape({ color: palette(11), dist: opExtrudeZ(q, sdDisk(q.xy, 0.8), depth) });

  q = p.sub(slot(1, count, z));
  res = shapeUnion(
    res,
    Shape({ color: palette(12), dist: opExtrudeZ(q, sdBox2d(q.xy, d.vec2f(0.7)), depth) }),
  );

  q = p.sub(slot(2, count, z));
  res = shapeUnion(
    res,
    Shape({
      color: palette(13),
      dist: opExtrudeZ(q, sdRoundedBox2d(q.xy, d.vec2f(0.7), 0.25), depth),
    }),
  );

  q = p.sub(slot(3, count, z));
  res = shapeUnion(
    res,
    Shape({
      color: palette(14),
      dist: opExtrudeZ(q, sdPie(q.xy, d.vec2f(std.sin(1), std.cos(1)), 0.8), depth),
    }),
  );

  q = p.sub(slot(4, count, z));
  res = shapeUnion(
    res,
    Shape({
      color: palette(15),
      dist: opExtrudeZ(q, sdArc(q.xy, d.vec2f(std.sin(2), std.cos(2)), 0.7) - THICKNESS, depth),
    }),
  );

  q = p.sub(slot(5, count, z));
  res = shapeUnion(
    res,
    Shape({
      color: palette(16),
      dist: opExtrudeZ(q, sdLine(q.xy, d.vec2f(-0.6, -0.6), d.vec2f(0.6, 0.6)) - THICKNESS, depth),
    }),
  );

  q = p.sub(slot(6, count, z));
  res = shapeUnion(
    res,
    Shape({
      color: palette(17),
      dist: opExtrudeZ(
        q,
        sdBezier(q.xy, d.vec2f(-0.7, -0.6), d.vec2f(0, 1.2), d.vec2f(0.7, -0.6)) - THICKNESS,
        depth,
      ),
    }),
  );

  q = p.sub(slot(7, count, z));
  res = shapeUnion(
    res,
    Shape({
      color: palette(18),
      dist: opExtrudeZ(
        q,
        sdBezierApprox(q.xy, d.vec2f(-0.7, -0.6), d.vec2f(0, 1.2), d.vec2f(0.7, -0.6)) - THICKNESS,
        depth,
      ),
    }),
  );

  q = p.sub(slot(8, count, z));
  res = shapeUnion(
    res,
    Shape({ color: palette(19), dist: opExtrudeZ(q, sdHexagon2d(q.xy, 0.7), depth) }),
  );

  // same hexagon via the gradient variant, so both must render identically
  q = p.sub(slot(9, count, z));
  res = shapeUnion(
    res,
    Shape({ color: palette(20), dist: opExtrudeZ(q, sdgHexagon2d(q.xy, 0.7).x, depth) }),
  );

  return res;
};

const getSceneDist = (p: d.v3f) => {
  'use gpu';
  const floor = Shape({
    color: std.mix(d.vec3f(1), d.vec3f(0.3), checkerBoard(std.mul(p.xz, 0.5))),
    dist: sdPlane(p, d.vec3f(0, 1, 0), 0),
  });
  return shapeUnion(shapeUnion(shapes3d(p), shapes2d(p)), floor);
};

const rayMarch = (ro: d.v3f, rd: d.v3f) => {
  'use gpu';
  let dO = d.f32(0);
  const result = Shape({ dist: d.f32(MAX_DIST), color: d.vec3f(skyColor) });

  for (let i = 0; i < MAX_STEPS; i++) {
    const scene = getSceneDist(ro.add(rd.mul(dO)));
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
      getSceneDist(p.add(d.vec3f(e, 0, 0))).dist - dist,
      getSceneDist(p.add(d.vec3f(0, e, 0))).dist - dist,
      getSceneDist(p.add(d.vec3f(0, 0, e))).dist - dist,
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
  const farView = camera.projectionInverse.mul(d.vec4f(uv, 1, 1));
  const farWorld = camera.viewInverse.mul(d.vec4f(farView.xyz.div(farView.w), 1));
  return Ray({
    origin: camera.pos.xyz,
    direction: std.normalize(farWorld.xyz.sub(camera.pos.xyz)),
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
  const ray = getRayForUV(uv);
  const march = rayMarch(ray.origin, ray.direction);

  if (march.dist >= MAX_DIST) {
    return d.vec4f(skyColor, 1);
  }

  const p = ray.origin.add(ray.direction.mul(march.dist));
  const n = getNormal(p);
  const lightDir = std.normalize(d.vec3f(-0.5, 1, -0.7));
  const diffuse = std.max(std.dot(n, lightDir), 0);
  const color = march.color.mul(diffuse * 0.8 + 0.2);

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
