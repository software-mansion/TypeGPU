/*
{
  "title": "Box Raytracing",
  "category": "rendering"
}
*/

// -- Hooks into the example environment
import {
  addElement,
  addSliderPlumParameter,
  onFrame,
} from '@typegpu/example-toolkit';
// --

import { builtin, createRuntime, wgsl } from 'typegpu';
import { arrayOf, bool, f32, struct, u32, vec3f, vec4f } from 'typegpu/data';

const X = 7;
const Y = 7;
const Z = 7;

const MAX_BOX_SIZE = 15;
const cubeSize = [X * MAX_BOX_SIZE, Y * MAX_BOX_SIZE, Z * MAX_BOX_SIZE];
const boxCenter = cubeSize.map((value) => value / 2);
const upAxis = [0, 1, 0] as Vector;

const rotationSpeedPlum = addSliderPlumParameter('rotation speed', 2, {
  min: 0,
  max: 5,
});

const cameraDistancePlum = addSliderPlumParameter('camera distance', 250, {
  min: 100,
  max: 1200,
});

const boxSizePlum = addSliderPlumParameter('box size', MAX_BOX_SIZE, {
  min: 1,
  max: MAX_BOX_SIZE,
});

const framePlum = wgsl.plum<number>(0);

const cameraPositionPlum = wgsl.plum((get) => {
  const frame = get(framePlum);

  return vec3f(
    Math.cos(frame) * get(cameraDistancePlum) + boxCenter[0],
    boxCenter[1],
    Math.sin(frame) * get(cameraDistancePlum) + boxCenter[2],
  );
});

const cameraAxesPlum = wgsl.plum((get) => {
  const forwardAxis = normalize(
    get(cameraPositionPlum).map((value, i) => boxCenter[i] - value) as Vector,
  );

  return {
    forward: forwardAxis,
    up: upAxis,
    right: crossProduct(upAxis, forwardAxis) as Vector,
  };
});

const canvas = await addElement('canvas');
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const canvasWidthPlum = wgsl.plum(canvas.width).$name('canvas_width');
const canvasHeightPlum = wgsl.plum(canvas.height).$name('canvas_height');

const runtime = await createRuntime();
const device = runtime.device;

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const boxStruct = struct({
  isActive: u32,
  albedo: vec4f,
});

const rayStruct = struct({
  origin: vec3f,
  direction: vec3f,
});

const intersectionStruct = struct({
  intersects: bool,
  tMin: f32,
  tMax: f32,
});

const boxMatrixBuffer = wgsl
  .buffer(
    arrayOf(arrayOf(arrayOf(boxStruct, Z), Y), X),
    Array.from({ length: X }, (_, i) =>
      Array.from({ length: Y }, (_, j) =>
        Array.from({ length: Z }, (_, k) => ({
          isActive: X - i + j + (Z - k) > 6 ? 1 : 0,
          albedo: vec4f(i / X, j / Y, k / Z, 1),
        })),
      ),
    ),
  )
  .$name('box_array')
  .$allowReadonly();
const boxMatrixData = boxMatrixBuffer.asReadonly();

const cameraPositionBuffer = wgsl
  .buffer(vec3f, cameraPositionPlum)
  .$name('camera_position')
  .$allowReadonly();
const cameraPositionData = cameraPositionBuffer.asReadonly();

const cameraAxesBuffer = wgsl
  .buffer(
    struct({
      right: vec3f,
      up: vec3f,
      forward: vec3f,
    }),
    cameraAxesPlum,
  )
  .$name('camera_axes')
  .$allowReadonly();
const cameraAxesData = cameraAxesBuffer.asReadonly();

const canvasDimsBuffer = wgsl
  .buffer(
    struct({ width: u32, height: u32 }),
    wgsl.plum((get) => ({
      width: get(canvasWidthPlum),
      height: get(canvasHeightPlum),
    })),
  )
  .$name('canvas_dims')
  .$allowUniform();
const canvasDimsData = canvasDimsBuffer.asUniform();

const boxSizeBuffer = wgsl
  .buffer(u32, boxSizePlum)
  .$name('box_size')
  .$allowUniform();
const boxSizeData = boxSizeBuffer.asUniform();

const getBoxIntersectionFn = wgsl.fn`(
  boundMin: vec3f,
  boundMax: vec3f,
  ray: ${rayStruct}
) -> ${intersectionStruct} {
  var output: ${intersectionStruct};

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
    return output;
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
    return output;
  }

  if tMinZ > tMin {
    tMin = tMinZ;
  }

  if tMaxZ < tMax {
    tMax = tMaxZ;
  }

  output.intersects = tMin > 0 && tMax > 0;
  output.tMin = tMin;
  output.tMax = tMax;
  return output;
}
`.$name('box_intersection');

const renderPipeline = runtime.makeRenderPipeline({
  vertex: {
    code: wgsl`
      var pos = array<vec2f, 6>(
        vec2<f32>( 1,  1),
        vec2<f32>( 1, -1),
        vec2<f32>(-1, -1),
        vec2<f32>( 1,  1),
        vec2<f32>(-1, -1),
        vec2<f32>(-1,  1)
      );

      let outPos = vec4f(pos[${builtin.vertexIndex}], 0, 1);
    `,
    output: {
      [builtin.position]: 'outPos',
    },
  },

  fragment: {
    code: wgsl`
      let minDim = f32(min(${canvasDimsData}.width, ${canvasDimsData}.height));

      var ray: ${rayStruct};
      ray.origin = ${cameraPositionData};
      ray.direction += ${cameraAxesData}.right * (${builtin.position}.x - f32(${canvasDimsData}.width)/2)/minDim;
      ray.direction += ${cameraAxesData}.up * (${builtin.position}.y - f32(${canvasDimsData}.height)/2)/minDim;
      ray.direction += ${cameraAxesData}.forward;
      ray.direction = normalize(ray.direction);

      let bigBoxIntersection = ${getBoxIntersectionFn}(
        -vec3f(f32(${boxSizeData}))/2,
        vec3f(
          ${cubeSize[0]},
          ${cubeSize[1]},
          ${cubeSize[2]},
        ) + vec3f(f32(${boxSizeData}))/2,
        ray,
      );

      var color = vec4f(0);

      if bigBoxIntersection.intersects {
        var tMin: f32;
        var intersectionFound = false;

        for (var i = 0; i < ${X}; i = i+1) {
          for (var j = 0; j < ${Y}; j = j+1) {
            for (var k = 0; k < ${Z}; k = k+1) {
              if ${boxMatrixData}[i][j][k].isActive == 0 {
                continue;
              }

              let intersection = ${getBoxIntersectionFn}(
                vec3f(f32(i), f32(j), f32(k)) * ${MAX_BOX_SIZE} - vec3f(f32(${boxSizeData}))/2,
                vec3f(f32(i), f32(j), f32(k)) * ${MAX_BOX_SIZE} + vec3f(f32(${boxSizeData}))/2,
                ray,
              );

              if intersection.intersects && (!intersectionFound || intersection.tMin < tMin) {
                color = ${boxMatrixData}[i][j][k].albedo;
                tMin = intersection.tMin;
                intersectionFound = true;
              }
            }
          }
        }
      }

      return color;
    `,
    target: [
      {
        format: presentationFormat,
      },
    ],
  },

  primitive: {
    topology: 'triangle-strip',
  },
});

type Vector = [number, number, number];

function normalize(vector: Vector): Vector {
  const length = Math.sqrt(vector[0] ** 2 + vector[1] ** 2 + vector[2] ** 2);
  return vector.map((value) => value / length) as Vector;
}

function crossProduct(vectorA: Vector, vectorB: Vector): Vector {
  return [
    vectorA[1] * vectorB[2] - vectorA[2] * vectorB[1],
    vectorA[2] * vectorB[0] - vectorA[0] * vectorB[2],
    vectorA[0] * vectorB[1] - vectorA[1] * vectorB[0],
  ];
}

onFrame((deltaTime) => {
  runtime.setPlum(canvasWidthPlum, canvas.width);
  runtime.setPlum(canvasHeightPlum, canvas.height);

  const rotationSpeed = runtime.readPlum(rotationSpeedPlum);

  runtime.setPlum(
    framePlum,
    (prev) => prev + (rotationSpeed * deltaTime) / 1000,
  );

  const textureView = context.getCurrentTexture().createView();

  renderPipeline.execute({
    colorAttachments: [
      {
        view: textureView,
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    vertexCount: 6,
  });

  runtime.flush();
});
