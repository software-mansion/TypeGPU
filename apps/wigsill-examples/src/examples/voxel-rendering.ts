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
  .$name('vexel_array')
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

const normalizeVectorFn = wgsl.fn('normalize')` (vector: ${vec3f}) -> ${vec3f} {
  let length = sqrt(pow(vector.x, 2) + pow(vector.y, 2) + pow(vector.z, 2));
  return vector / length;
}`;

const crossProductFn = wgsl.fn(
  'cross_product',
)` (vectorA: ${vec3f}, vectorB: ${vec3f}) -> ${vec3f} {
  return vec3f(
    vectorA.y * vectorB.z - vectorA.z * vectorB.y,
		vectorA.z * vectorB.x - vectorA.x * vectorB.z,
		vectorA.x * vectorB.y - vectorA.y * vectorB.x  
  );
}
`;

const getBoxIntersectionFn = wgsl.fn('box_intersection')`(
  boundMin: vec3f,
  boundMax: vec3f,
  ray: ${rayStruct}
) -> ${intersectionStruct} {
    var output = ${intersectionStruct}();

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
      ray.direction += -${crossProductFn}(${cameraAxesData}.forward, ${cameraAxesData}.up) * (pos.x - f32(${canvasDimsData}.width)/2)/minDim;
      ray.direction += ${cameraAxesData}.up * (pos.y - f32(${canvasDimsData}.height)/2)/minDim;
      ray.direction += ${cameraAxesData}.forward;
      ray.direction = ${normalizeVectorFn}(ray.direction);

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
                vec3f(
                  f32(i) * ${cubeSize[0] / X}, 
                  f32(j) * ${cubeSize[1] / Y}, 
                  f32(k) * ${cubeSize[2] / Z},
                ), 
                vec3f(
                  f32(i+1) * ${cubeSize[0] / X}, 
                  f32(j+1) * ${cubeSize[1] / Y}, 
                  f32(k+1) * ${cubeSize[2] / Z},
                ), 
                ray
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

function normalize(vector: Vector) {
  const length = Math.sqrt(vector[0] ** 2 + vector[1] ** 2 + vector[2] ** 2);
  return vector.map((value) => value / length) as Vector;
}

const boxCenter = cubeSize.map((value) => value / 2);

let frame = 0;
let timeDelta = 0.05;
let cameraDist = 350;

onFrame(() => {
  frame += timeDelta;

  const cameraPosition: Vector = [
    Math.cos(frame) * cameraDist + boxCenter[0],
    boxCenter[1],
    Math.sin(frame) * cameraDist + boxCenter[2],
  ];

  cameraPositionBuffer.write(runtime, cameraPosition);

  const forward = normalize(
    cameraPosition.map((value, i) => boxCenter[i] - value) as Vector,
  );

  cameraAxesBuffer.write(runtime, {
    forward: forward,
    up: [0, 1, 0],
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
  'timeDelta',
  {
    initial: timeDelta,
    min: 0,
    max: 1,
  },
  (newValue) => {
    timeDelta = newValue;
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
