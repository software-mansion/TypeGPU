import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { cross, mul, normalize, sub } from 'typegpu/std';

// init canvas and values

const X = 7;
const Y = 7;
const Z = 7;

const MAX_BOX_SIZE = 15;
const cubeSize = d.vec3f(X * MAX_BOX_SIZE, Y * MAX_BOX_SIZE, Z * MAX_BOX_SIZE);
const boxCenter = mul(0.5, cubeSize);
const upAxis = d.vec3f(0, 1, 0);
let rotationSpeed = 2;
let cameraDistance = 250;

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
  albedo: d.vec4f,
});

const RayStruct = d.struct({
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

const CanvasDimsStruct = d.struct({ width: d.u32, height: d.u32 });

// buffers

const boxMatrixBuffer = root
  .createBuffer(
    d.arrayOf(d.arrayOf(d.arrayOf(BoxStruct, Z), Y), X),
    Array.from({ length: X }, (_, i) =>
      Array.from({ length: Y }, (_, j) =>
        Array.from({ length: Z }, (_, k) => ({
          isActive: X - i + j + (Z - k) > 6 ? 1 : 0,
          albedo: d.vec4f(i / X, j / Y, k / Z, 1),
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
  .createUniform(CanvasDimsStruct)
  .$name('canvas_dims');

const boxSizeUniform = root['~unstable']
  .createUniform(d.u32, MAX_BOX_SIZE)
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
  { boundMin: d.vec3f, boundMax: d.vec3f, ray: RayStruct },
  IntersectionStruct,
) /* wgsl */`{
  var tMin: f32;
  var tMax: f32;
  var tMinY: f32;
  var tMaxY: f32;
  var tMinZ: f32;
  var tMaxZ: f32;

  if (ray.direction.x >= 0) {
    tMin = (boundMin.x - ray.origin.x) / ray.direction.x;
    tMax = (boundMax.x - ray.origin.x) / ray.direction.x;
  } else {
    tMin = (boundMax.x - ray.origin.x) / ray.direction.x;
    tMax = (boundMin.x - ray.origin.x) / ray.direction.x;
  }

  if (ray.direction.y >= 0) {
    tMinY = (boundMin.y - ray.origin.y) / ray.direction.y;
    tMaxY = (boundMax.y - ray.origin.y) / ray.direction.y;
  } else {
    tMinY = (boundMax.y - ray.origin.y) / ray.direction.y;
    tMaxY = (boundMin.y - ray.origin.y) / ray.direction.y;
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
    tMinZ = (boundMin.z - ray.origin.z) / ray.direction.z;
    tMaxZ = (boundMax.z - ray.origin.z) / ray.direction.z;
  } else {
    tMinZ = (boundMax.z - ray.origin.z) / ray.direction.z;
    tMaxZ = (boundMin.z - ray.origin.z) / ray.direction.z;
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
  .$uses({ IntersectionStruct })
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

const boxSizeAccessor = tgpu['~unstable'].accessor(d.u32);
const canvasDimsAccessor = tgpu['~unstable'].accessor(CanvasDimsStruct);

const fragmentFunction = tgpu['~unstable'].fragmentFn({
  in: { position: d.builtin.position },
  out: d.vec4f,
}) /* wgsl */`{
  let minDim = f32(min(canvasDims.width, canvasDims.height));

  var ray: RayStruct;
  ray.origin = cameraPosition;
  ray.direction += cameraAxes.right * (in.position.x - f32(canvasDims.width)/2)/minDim;
  ray.direction += cameraAxes.up * (in.position.y - f32(canvasDims.height)/2)/minDim;
  ray.direction += cameraAxes.forward;
  ray.direction = normalize(ray.direction);

  let bigBoxIntersection = getBoxIntersection(
    -vec3f(f32(boxSize))/2,
    vec3f(
      cubeSize.x,
      cubeSize.y,
      cubeSize.z,
    ) + vec3f(f32(boxSize))/2,
    ray,
  );

  var color = vec4f(0);

  if bigBoxIntersection.intersects {
    var tMin: f32;
    var intersectionFound = false;

    for (var i = 0; i < X; i = i+1) {
      for (var j = 0; j < Y; j = j+1) {
        for (var k = 0; k < Z; k = k+1) {
          if boxMatrix[i][j][k].isActive == 0 {
            continue;
          }

          let intersection = getBoxIntersection(
            vec3f(f32(i), f32(j), f32(k)) * MAX_BOX_SIZE - vec3f(f32(boxSize))/2,
            vec3f(f32(i), f32(j), f32(k)) * MAX_BOX_SIZE + vec3f(f32(boxSize))/2,
            ray,
          );

          if intersection.intersects && (!intersectionFound || intersection.tMin < tMin) {
            color = boxMatrix[i][j][k].albedo;
            tMin = intersection.tMin;
            intersectionFound = true;
          }
        }
      }
    }
  }

  return color;
}`
  .$uses({
    ...renderLayout.bound,
    RayStruct,
    getBoxIntersection,
    X,
    Y,
    Z,
    MAX_BOX_SIZE,
    cubeSize,
    boxSize: boxSizeAccessor,
    canvasDims: canvasDimsAccessor,
  })
  .$name('fragment_main');

// pipeline

const pipeline = root['~unstable']
  .with(
    boxSizeAccessor,
    tgpu['~unstable'].fn([], d.u32)`() -> u32 { return boxSize; }`.$uses({
      boxSize: boxSizeUniform,
    }),
  )
  .with(canvasDimsAccessor, canvasDimsUniform)
  .withVertex(vertexFunction, {})
  .withFragment(fragmentFunction, { format: presentationFormat })
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
    Math.cos(frame) * cameraDistance + boxCenter.x,
    boxCenter.y,
    Math.sin(frame) * cameraDistance + boxCenter.z,
  );

  const cameraAxes = (() => {
    const forwardAxis = normalize(sub(boxCenter, cameraPosition));
    return {
      forward: forwardAxis,
      up: upAxis,
      right: cross(upAxis, forwardAxis),
    };
  })();

  cameraPositionBuffer.write(cameraPosition);
  cameraAxesBuffer.write(cameraAxes);
  canvasDimsUniform.write({ width, height });

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
    min: 100,
    max: 1200,
    onSliderChange: (value: number) => {
      cameraDistance = value;
    },
  },

  'box size': {
    initial: MAX_BOX_SIZE,
    min: 1,
    max: MAX_BOX_SIZE,
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
