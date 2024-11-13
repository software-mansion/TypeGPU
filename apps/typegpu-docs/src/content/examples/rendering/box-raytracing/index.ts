import { arrayOf, bool, f32, struct, u32, vec3f, vec4f } from 'typegpu/data';
import tgpu, {
  asReadonly,
  asUniform,
  builtin,
  std,
  wgsl,
} from 'typegpu/experimental';

const X = 7;
const Y = 7;
const Z = 7;

const MAX_BOX_SIZE = 15;
const cubeSize = vec3f(X * MAX_BOX_SIZE, Y * MAX_BOX_SIZE, Z * MAX_BOX_SIZE);
const boxCenter = std.mul(0.5, cubeSize);
const upAxis = vec3f(0, 1, 0);

let rotationSpeed = 2;
let cameraDistance = 250;
let boxSize = MAX_BOX_SIZE;

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

const boxMatrixBuffer = root
  .createBuffer(
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
  .$usage('storage');
const boxMatrixData = asReadonly(boxMatrixBuffer);

const cameraPositionBuffer = root
  .createBuffer(vec3f)
  .$name('camera_position')
  .$usage('storage');
const cameraPositionData = asReadonly(cameraPositionBuffer);

const cameraAxesBuffer = root
  .createBuffer(
    struct({
      right: vec3f,
      up: vec3f,
      forward: vec3f,
    }),
  )
  .$name('camera_axes')
  .$usage('storage');
const cameraAxesData = asReadonly(cameraAxesBuffer);

const canvasDimsBuffer = root
  .createBuffer(struct({ width: u32, height: u32 }))
  .$name('canvas_dims')
  .$usage('uniform');
const canvasDimsData = asUniform(canvasDimsBuffer);

const boxSizeBuffer = root
  .createBuffer(u32, boxSize)
  .$name('box_size')
  .$usage('uniform');
const boxSizeData = asUniform(boxSizeBuffer);

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

const renderPipeline = root.makeRenderPipeline({
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
      [builtin.position.s]: 'outPos',
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
        ${cubeSize.x},
        ${cubeSize.y},
        ${cubeSize.z},
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

  const cameraPosition = vec3f(
    Math.cos(frame) * cameraDistance + boxCenter.x,
    boxCenter.y,
    Math.sin(frame) * cameraDistance + boxCenter.z,
  );

  const cameraAxes = (() => {
    const forwardAxis = std.normalize(std.sub(boxCenter, cameraPosition));

    return {
      forward: forwardAxis,
      up: upAxis,
      right: std.cross(upAxis, forwardAxis),
    };
  })();

  cameraPositionBuffer.write(cameraPosition);
  cameraAxesBuffer.write(cameraAxes);
  canvasDimsBuffer.write({ width, height });

  frame += (rotationSpeed * deltaTime) / 1000;

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

  root.flush();
});

export function onCleanup() {
  disposed = true;
  root.destroy();
  root.device.destroy();
}

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
    initial: boxSize,
    min: 1,
    max: MAX_BOX_SIZE,
    onSliderChange: (value: number) => {
      boxSize = value;
    },
  },
};
