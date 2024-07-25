/*
{
  "title": "Voxel Raytracing"
}
*/

import { addElement, addParameter, onFrame } from '@wigsill/example-toolkit';
import {
  arrayOf,
  bool,
  createRuntime,
  f32,
  struct,
  u32,
  vec3f,
  vec4f,
  wgsl,
} from 'wigsill';

const runtime = await createRuntime();
const device = runtime.device;

const canvas = await addElement('canvas');
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const voxelStruct = struct({
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

const X = 10;
const Y = 11;
const Z = 12;

const VOXEL_SIZE = 15;
const cubeSize = [X * VOXEL_SIZE, Y * VOXEL_SIZE, Z * VOXEL_SIZE];

const voxelMatrixBuffer = wgsl
  .buffer(arrayOf(arrayOf(arrayOf(voxelStruct, Z), Y), X))
  .$name('voxel_array')
  .$allowReadonlyStorage();
const voxelMatrixData = voxelMatrixBuffer.asReadonlyStorage();

const cameraPositionBuffer = wgsl
  .buffer(vec3f)
  .$name('camera_position')
  .$allowReadonlyStorage();
const cameraPositionData = cameraPositionBuffer.asReadonlyStorage();

const cameraAxesBuffer = wgsl
  .buffer(
    struct({
      right: vec3f,
      up: vec3f,
      forward: vec3f,
    }),
  )
  .$name('camera_axes')
  .$allowReadonlyStorage();
const cameraAxesData = cameraAxesBuffer.asReadonlyStorage();

const canvasDimsBuffer = wgsl
  .buffer(struct({ width: u32, height: u32 }))
  .$name('canvas_dims')
  .$allowReadonlyStorage();
const canvasDimsData = canvasDimsBuffer.asReadonlyStorage();

const getBoxIntersectionFn = wgsl.fn('box_intersection')`(
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
`;

const vertexOutputStruct = struct({
  '@builtin(position) pos': vec4f,
});

const renderPipeline = runtime.makeRenderPipeline({
  vertex: {
    args: ['@builtin(vertex_index) VertexIndex: u32'],
    output: vertexOutputStruct,
    code: wgsl`
      var pos = array<vec2f, 6>(
        vec2<f32>( 1,  1),
        vec2<f32>( 1, -1),
        vec2<f32>(-1, -1),
        vec2<f32>( 1,  1),
        vec2<f32>(-1, -1),
        vec2<f32>(-1,  1)
      );

      var output: ${vertexOutputStruct};
      output.pos = vec4f(pos[VertexIndex], 0, 1);
      return output;
    `,
  },

  fragment: {
    args: ['@builtin(position) pos: vec4f'],
    code: wgsl.code`
      let minDim = f32(min(${canvasDimsData}.width, ${canvasDimsData}.height));

      var ray: ${rayStruct};
      ray.origin = ${cameraPositionData};
      ray.direction += ${cameraAxesData}.right * (pos.x - f32(${canvasDimsData}.width)/2)/minDim;
      ray.direction += ${cameraAxesData}.up * (pos.y - f32(${canvasDimsData}.height)/2)/minDim;
      ray.direction += ${cameraAxesData}.forward;
      ray.direction = normalize(ray.direction);

      let bigBoxIntersection = ${getBoxIntersectionFn}(
        vec3f(0), 
        vec3f(
          ${cubeSize[0]}, 
          ${cubeSize[1]}, 
          ${cubeSize[2]},
        ), 
        ray,
      );

      var color = vec4f(0);

      if bigBoxIntersection.intersects {
        var tMin: f32;
        var intersectionFound = false;

        for (var i = 0; i < ${X}; i = i+1) {
          for (var j = 0; j < ${Y}; j = j+1) {
            for (var k = 0; k < ${Z}; k = k+1) {
              if ${voxelMatrixData}[i][j][k].isActive == 0 {
                continue;
              }

              let intersection = ${getBoxIntersectionFn}(
                vec3f(f32(i), f32(j), f32(k)) * ${VOXEL_SIZE}, 
                vec3f(f32(i+1), f32(j+1), f32(k+1)) * ${VOXEL_SIZE}, 
                ray,
              );

              if intersection.intersects && (!intersectionFound || intersection.tMin < tMin) {
                color = ${voxelMatrixData}[i][j][k].albedo;
                tMin = intersection.tMin;
                intersectionFound = true;
              }
            }
          }
        }
      }

      return color;
    `,
    output: '@location(0) vec4f',
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

voxelMatrixBuffer.write(
  runtime,
  Array.from({ length: X }, (_, i) =>
    Array.from({ length: Y }, (_, j) =>
      Array.from({ length: Z }, (_, k) => ({
        isActive: X - i + j + (Z - k) > 10 ? 1 : 0,
        albedo: [i / X, j / Y, k / Z, 1],
      })),
    ),
  ),
);

type Vector = [number, number, number];

const boxCenter = cubeSize.map((value) => value / 2);
const upAxis = [0, 1, 0] as Vector;

let frame = 0;
let radiansPerSecond = 2;
let cameraDist = 350;

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
  frame += (radiansPerSecond * deltaTime) / 1000;

  const cameraPosition: Vector = [
    Math.cos(frame) * cameraDist + boxCenter[0],
    boxCenter[1],
    Math.sin(frame) * cameraDist + boxCenter[2],
  ];

  cameraPositionBuffer.write(runtime, cameraPosition);

  const forwardAxis = normalize(
    cameraPosition.map((value, i) => boxCenter[i] - value) as Vector,
  );

  cameraAxesBuffer.write(runtime, {
    forward: forwardAxis,
    up: upAxis,
    right: crossProduct(upAxis, forwardAxis) as Vector,
  });

  canvasDimsBuffer.write(runtime, {
    width: canvas.width,
    height: canvas.height,
  });

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

addParameter(
  'radiansPerSecond',
  {
    initial: radiansPerSecond,
    min: 0,
    max: 10,
  },
  (newValue) => {
    radiansPerSecond = newValue;
  },
);

addParameter(
  'cameraDistance',
  {
    initial: cameraDist,
    min: 100,
    max: 1200,
  },
  (newValue) => {
    cameraDist = newValue;
  },
);
