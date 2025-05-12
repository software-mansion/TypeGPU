import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import {
  add,
  cross,
  discard,
  div,
  max,
  min,
  mul,
  normalize,
  sub,
} from 'typegpu/std';

// init canvas and values

const X = 7;
const Y = 7;
const Z = 7;

const cubeSize = d.vec3f(X, Y, Z);
const cameraAnchor = mul(0.5, sub(cubeSize, d.vec3f(1)));
let rotationSpeed = 0.5;
let cameraDistance = 16;

let frame = 0;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// structs

const BoxStruct = d.struct({
  isActive: d.u32,
  albedo: d.vec3f,
});

const AxisAlignedBounds = d.struct({
  min: d.vec3f,
  max: d.vec3f,
});

const Ray = d.struct({
  origin: d.vec3f,
  direction: d.vec3f,
});

const IntersectionStruct = d.struct({
  intersects: d.bool,
  tMin: d.f32,
  tMax: d.f32,
});

const CameraAxesStruct = d.struct({
  right: d.vec3f,
  up: d.vec3f,
  forward: d.vec3f,
});

// buffers

const boxMatrixBuffer = root
  .createBuffer(
    d.arrayOf(d.arrayOf(d.arrayOf(BoxStruct, Z), Y), X),
    Array.from(
      { length: X },
      (_, i) =>
        Array.from(
          { length: Y },
          (_, j) =>
            Array.from({ length: Z }, (_, k) => ({
              isActive: X - i + j + (Z - k) > 6 ? 1 : 0,
              albedo: d.vec3f(i / X, j / Y, k / Z),
            })),
        ),
    ),
  )
  .$name('box_array')
  .$usage('storage');

const cameraPositionBuffer = root
  .createBuffer(d.vec3f)
  .$name('camera_position')
  .$usage('storage');

const cameraAxesBuffer = root
  .createBuffer(CameraAxesStruct)
  .$name('camera_axes')
  .$usage('storage');

const canvasDimsUniform = root['~unstable']
  .createUniform(d.vec2f)
  .$name('canvas_dims');

const boxSizeUniform = root['~unstable']
  .createUniform(d.f32, 1)
  .$name('box_size');

// bind groups and layouts

const renderLayout = tgpu.bindGroupLayout({
  boxMatrix: { storage: boxMatrixBuffer.dataType },
  cameraPosition: { storage: cameraPositionBuffer.dataType },
  cameraAxes: { storage: cameraAxesBuffer.dataType },
});

const renderBindGroup = root.createBindGroup(renderLayout, {
  boxMatrix: boxMatrixBuffer,
  cameraPosition: cameraPositionBuffer,
  cameraAxes: cameraAxesBuffer,
});

// functions

const getBoxIntersection = tgpu['~unstable'].fn(
  [AxisAlignedBounds, Ray],
  IntersectionStruct,
) /* wgsl */`(bounds: AxisAlignedBounds, ray: Ray) -> IntersectionStruct {
  var tMin: f32;
  var tMax: f32;
  var tMinY: f32;
  var tMaxY: f32;
  var tMinZ: f32;
  var tMaxZ: f32;

  if (ray.direction.x >= 0) {
    tMin = (bounds.min.x - ray.origin.x) / ray.direction.x;
    tMax = (bounds.max.x - ray.origin.x) / ray.direction.x;
  } else {
    tMin = (bounds.max.x - ray.origin.x) / ray.direction.x;
    tMax = (bounds.min.x - ray.origin.x) / ray.direction.x;
  }

  if (ray.direction.y >= 0) {
    tMinY = (bounds.min.y - ray.origin.y) / ray.direction.y;
    tMaxY = (bounds.max.y - ray.origin.y) / ray.direction.y;
  } else {
    tMinY = (bounds.max.y - ray.origin.y) / ray.direction.y;
    tMaxY = (bounds.min.y - ray.origin.y) / ray.direction.y;
  }

  if (tMin > tMaxY) || (tMinY > tMax) {
    return IntersectionStruct();
  }

  if (tMinY > tMin) {
    tMin = tMinY;
  }

  if (tMaxY < tMax) {
    tMax = tMaxY;
  }

  if (ray.direction.z >= 0) {
    tMinZ = (bounds.min.z - ray.origin.z) / ray.direction.z;
    tMaxZ = (bounds.max.z - ray.origin.z) / ray.direction.z;
  } else {
    tMinZ = (bounds.max.z - ray.origin.z) / ray.direction.z;
    tMaxZ = (bounds.min.z - ray.origin.z) / ray.direction.z;
  }

  if (tMin > tMaxZ) || (tMinZ > tMax) {
    return IntersectionStruct();
  }

  if tMinZ > tMin {
    tMin = tMinZ;
  }

  if tMaxZ < tMax {
    tMax = tMaxZ;
  }

  return IntersectionStruct(tMin > 0 && tMax > 0, tMin, tMax);
}`
  .$uses({ AxisAlignedBounds, Ray, IntersectionStruct })
  .$name('box_intersection');

const vertexFunction = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { outPos: d.builtin.position },
}) /* wgsl */`{
  var pos = array<vec2f, 6>(
    vec2<f32>( 1,  1),
    vec2<f32>( 1, -1),
    vec2<f32>(-1, -1),
    vec2<f32>( 1,  1),
    vec2<f32>(-1, -1),
    vec2<f32>(-1,  1)
  );

  return Out(vec4f(pos[in.vertexIndex], 0, 1));
}`.$name('vertex_main');

const boxSizeAccess = tgpu['~unstable'].accessor(d.f32);
const canvasDimsAccess = tgpu['~unstable'].accessor(d.vec2f);

const fragmentFunction = tgpu['~unstable'].fragmentFn({
  in: { position: d.builtin.position },
  out: d.vec4f,
})((input) => {
  const boxSize3 = d.vec3f(d.f32(boxSizeAccess.value));
  const halfBoxSize3 = mul(0.5, boxSize3);
  const halfCanvasDims = mul(0.5, canvasDimsAccess.value);
  const cameraAxes = renderLayout.$.cameraAxes;
  const minDim = min(canvasDimsAccess.value.x, canvasDimsAccess.value.y);

  const viewCoords = mul(1 / minDim, sub(input.position.xy, halfCanvasDims));

  const ray = Ray({
    origin: renderLayout.$.cameraPosition,
    direction: d.vec3f(),
  });
  ray.direction = add(ray.direction, mul(viewCoords.x, cameraAxes.right));
  ray.direction = add(ray.direction, mul(viewCoords.y, cameraAxes.up));
  ray.direction = add(ray.direction, cameraAxes.forward);
  ray.direction = normalize(ray.direction);

  const bigBoxIntersection = getBoxIntersection(
    AxisAlignedBounds({
      min: mul(-1, halfBoxSize3),
      max: add(cubeSize, halfBoxSize3),
    }),
    ray,
  );

  if (!bigBoxIntersection.intersects) {
    discard();
    return d.vec4f(0, 0, 0, 0);
  }

  let density = d.f32(0);
  let invColor = d.vec3f(0, 0, 0);
  let tMin = d.f32(0);
  let intersectionFound = false;

  for (let i = 0; i < X; i++) {
    for (let j = 0; j < Y; j++) {
      for (let k = 0; k < Z; k++) {
        if (renderLayout.$.boxMatrix[i][j][k].isActive === 0) {
          continue;
        }

        const ijkScaled = d.vec3f(d.f32(i), d.f32(j), d.f32(k));

        const intersection = getBoxIntersection(
          AxisAlignedBounds({
            min: sub(ijkScaled, halfBoxSize3),
            max: add(ijkScaled, halfBoxSize3),
          }),
          ray,
        );

        if (intersection.intersects) {
          const depth = max(0, intersection.tMax - intersection.tMin) * 0.5;
          density += depth;
          invColor = add(
            invColor,
            mul(
              depth,
              div(d.vec3f(1), renderLayout.$.boxMatrix[i][j][k].albedo),
            ),
          );
          tMin = intersection.tMin;
          intersectionFound = true;
        }
      }
    }
  }

  const avgInvColor = mul(1 / density, invColor);

  if (intersectionFound) {
    return mul(
      min(density, 1),
      d.vec4f(min(div(d.vec3f(1), avgInvColor), d.vec3f(1)), 1),
    );
  }

  discard();
  return d.vec4f(0, 0, 0, 0);
});

// pipeline

const pipeline = root['~unstable']
  .with(boxSizeAccess, boxSizeUniform)
  .with(canvasDimsAccess, canvasDimsUniform)
  .withVertex(vertexFunction, {})
  .withFragment(fragmentFunction, {
    format: presentationFormat,
    blend: {
      color: {
        srcFactor: 'one',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
      alpha: {
        srcFactor: 'one',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
    },
  })
  .createPipeline()
  .with(renderLayout, renderBindGroup);

// UI

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
  const width = canvas.width;
  const height = canvas.height;

  const cameraPosition = d.vec3f(
    Math.cos(frame) * cameraDistance + cameraAnchor.x,
    cameraAnchor.y - 5,
    Math.sin(frame) * cameraDistance + cameraAnchor.z,
  );

  const cameraAxes = (() => {
    const forwardAxis = normalize(sub(cameraAnchor, cameraPosition));
    const rightAxis = cross(d.vec3f(0, 1, 0), forwardAxis);
    const upAxis = cross(forwardAxis, rightAxis);
    return {
      forward: forwardAxis,
      up: upAxis,
      right: rightAxis,
    };
  })();

  cameraPositionBuffer.write(cameraPosition);
  cameraAxesBuffer.write(cameraAxes);
  canvasDimsUniform.write(d.vec2f(width, height));

  frame += (rotationSpeed * deltaTime) / 1000;

  const textureView = context.getCurrentTexture().createView();
  pipeline
    .withColorAttachment({
      view: textureView,
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(6);
});

// #region Example controls and cleanup

export const controls = {
  'rotation speed': {
    initial: rotationSpeed,
    min: 0,
    max: 5,
    onSliderChange: (value: number) => {
      rotationSpeed = value;
    },
  },

  'camera distance': {
    initial: cameraDistance,
    min: 1,
    max: 100,
    onSliderChange: (value: number) => {
      cameraDistance = value;
    },
  },

  'box size': {
    initial: 1,
    min: 0.1,
    max: 1,
    onSliderChange: (value: number) => {
      boxSizeUniform.write(value);
    },
  },
};

export function onCleanup() {
  disposed = true;
  root.destroy();
}

// #endregion
