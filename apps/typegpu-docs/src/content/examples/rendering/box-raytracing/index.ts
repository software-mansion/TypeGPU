import { arrayOf, bool, f32, struct, u32, vec3f, vec4f } from 'typegpu/data';
import tgpu, { std, builtin } from 'typegpu/experimental';

// init canvas and values

const X = 7;
const Y = 7;
const Z = 7;

const MAX_BOX_SIZE = 15;
const cubeSize = vec3f(X * MAX_BOX_SIZE, Y * MAX_BOX_SIZE, Z * MAX_BOX_SIZE);
const boxCenter = std.mul(0.5, cubeSize);
const upAxis = vec3f(0, 1, 0);
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

const BoxStruct = struct({
  isActive: u32,
  albedo: vec4f,
});

const RayStruct = struct({
  origin: vec3f,
  direction: vec3f,
});

const IntersectionStruct = struct({
  intersects: bool,
  tMin: f32,
  tMax: f32,
});

const CameraAxesStruct = struct({
  right: vec3f,
  up: vec3f,
  forward: vec3f,
});

const CanvasDimsStruct = struct({ width: u32, height: u32 });

// buffers

const boxMatrixBuffer = root
  .createBuffer(
    arrayOf(arrayOf(arrayOf(BoxStruct, Z), Y), X),
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

const cameraPositionBuffer = root
  .createBuffer(vec3f)
  .$name('camera_position')
  .$usage('storage');

const cameraAxesBuffer = root
  .createBuffer(CameraAxesStruct)
  .$name('camera_axes')
  .$usage('storage');

const canvasDimsBuffer = root
  .createBuffer(CanvasDimsStruct)
  .$name('canvas_dims')
  .$usage('uniform');

const boxSizeBuffer = root
  .createBuffer(u32, MAX_BOX_SIZE)
  .$name('box_size')
  .$usage('uniform');

// bind groups and layouts

const renderBindGroupLayout = tgpu.bindGroupLayout({
  boxMatrix: { storage: boxMatrixBuffer.dataType },
  cameraPosition: { storage: cameraPositionBuffer.dataType },
  cameraAxes: { storage: cameraAxesBuffer.dataType },
  canvasDims: { uniform: canvasDimsBuffer.dataType },
  boxSize: { uniform: boxSizeBuffer.dataType },
});

const renderBindGroup = renderBindGroupLayout.populate({
  boxMatrix: boxMatrixBuffer,
  cameraPosition: cameraPositionBuffer,
  cameraAxes: cameraAxesBuffer,
  canvasDims: canvasDimsBuffer,
  boxSize: boxSizeBuffer,
});

// functions

const getBoxIntersection = tgpu
  .fn([vec3f, vec3f, RayStruct], IntersectionStruct)
  .does(/* wgsl */ `(
  boundMin: vec3f,
  boundMax: vec3f,
  ray: RayStruct
) -> IntersectionStruct {
  var output: IntersectionStruct;

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
`)
  .$uses({ RayStruct, IntersectionStruct })
  .$name('box_intersection');

const vertexFunction = tgpu
  .vertexFn({ vertexIndex: builtin.vertexIndex }, { outPos: builtin.position })
  .does(/* wgsl */ `(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2f, 6>(
    vec2<f32>( 1,  1),
    vec2<f32>( 1, -1),
    vec2<f32>(-1, -1),
    vec2<f32>( 1,  1),
    vec2<f32>(-1, -1),
    vec2<f32>(-1,  1)
  );

  var output: VertexOutput;
  output.outPos = vec4f(pos[vertexIndex], 0, 1);
  return output;
}`)
  .$name('vertex_main')
  .$uses({
    get VertexOutput() {
      return vertexFunction.Output;
    },
  });

const fragmentFunction = tgpu
  .fragmentFn({ position: builtin.position }, vec4f)
  .does(/* wgsl */ `(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let minDim = f32(min(canvasDims.width, canvasDims.height));

  var ray: RayStruct;
  ray.origin = cameraPosition;
  ray.direction += cameraAxes.right * (position.x - f32(canvasDims.width)/2)/minDim;
  ray.direction += cameraAxes.up * (position.y - f32(canvasDims.height)/2)/minDim;
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
}`)
  .$uses({
    ...renderBindGroupLayout.bound,
    RayStruct,
    getBoxIntersection,
    X,
    Y,
    Z,
    MAX_BOX_SIZE,
    cubeSize,
  })
  .$name('fragment_main');

// pipeline

const resolved = tgpu.resolve({
  input: [vertexFunction, fragmentFunction],
});

const resolvedModule = root.device.createShaderModule({
  code: resolved,
});

const pipeline = root.device.createRenderPipeline({
  layout: root.device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(renderBindGroupLayout)],
  }),
  vertex: { module: resolvedModule },
  fragment: {
    module: resolvedModule,
    targets: [{ format: presentationFormat }],
  },
  primitive: { topology: 'triangle-strip' },
});

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

  const commandEncoder = root.device.createCommandEncoder();

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: textureView,
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };
  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, root.unwrap(renderBindGroup));
  passEncoder.draw(6);
  passEncoder.end();

  root.device.queue.submit([commandEncoder.finish()]);

  root.flush();
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
      boxSizeBuffer.write(value);
    },
  },
};

export function onCleanup() {
  disposed = true;
  root.destroy();
}

// #endregion
