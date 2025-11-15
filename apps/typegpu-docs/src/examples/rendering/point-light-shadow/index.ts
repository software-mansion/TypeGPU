import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { Camera } from './camera.ts';
import { BoxGeometry } from './box-geometry.ts';
import { CameraData, VertexData } from './types.ts';
import { fullScreenTriangle } from 'typegpu/common';

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
});

const mainCamera = new Camera();
mainCamera.position = d.vec3f(10, 10, 10);
mainCamera.target = d.vec3f(0, 0, 0);
const cameraUniform = root.createUniform(CameraData, mainCamera.data);

const cube = new BoxGeometry();
cube.scale = d.vec3f(3, 1, 0.2);
const floorCube = new BoxGeometry();
floorCube.scale = d.vec3f(10, 0.1, 10);
floorCube.position = d.vec3f(0, -0.5, 0);

const modelMatrixUniform = root.createUniform(d.mat4x4f);
const pointLightWorldPosition = d.vec3f(2, 4, 1);

const shadowCameras = {
  right: new Camera(90, 0.1, 25), // +X
  left: new Camera(90, 0.1, 25), // -X
  up: new Camera(90, 0.1, 25), // +Y
  down: new Camera(90, 0.1, 25), // -Y
  forward: new Camera(90, 0.1, 25), // +Z
  backward: new Camera(90, 0.1, 25), // -Z
};

// Configure each camera for cubemap faces
// Right face (+X)
shadowCameras.right.position = pointLightWorldPosition;
shadowCameras.right.target = pointLightWorldPosition.add(d.vec3f(1, 0, 0));
shadowCameras.right.up = d.vec3f(0, 1, 0);

// Left face (-X)
shadowCameras.left.position = pointLightWorldPosition;
shadowCameras.left.target = pointLightWorldPosition.add(d.vec3f(-1, 0, 0));
shadowCameras.left.up = d.vec3f(0, 1, 0);

// Up face (+Y)
shadowCameras.up.position = pointLightWorldPosition;
shadowCameras.up.target = pointLightWorldPosition.add(d.vec3f(0, 1, 0));
shadowCameras.up.up = d.vec3f(0, 0, 1);

// Down face (-Y)
shadowCameras.down.position = pointLightWorldPosition;
shadowCameras.down.target = pointLightWorldPosition.add(d.vec3f(0, -1, 0));
shadowCameras.down.up = d.vec3f(0, 0, -1);

// Forward face (+Z)
shadowCameras.forward.position = pointLightWorldPosition;
shadowCameras.forward.target = pointLightWorldPosition.add(d.vec3f(0, 0, 1));
shadowCameras.forward.up = d.vec3f(0, 1, 0);

// Backward face (-Z)
shadowCameras.backward.position = pointLightWorldPosition;
shadowCameras.backward.target = pointLightWorldPosition.add(d.vec3f(0, 0, -1));
shadowCameras.backward.up = d.vec3f(0, 1, 0);

const cameraDepthCube = root['~unstable'].createTexture({
  size: [512, 512, 6],
  dimension: '2d',
  format: 'depth24plus',
}).$usage('render', 'sampled');

const vertexData = tgpu.vertexLayout(d.arrayOf(VertexData));
const cubeVertexBuffer = root
  .createBuffer(
    vertexData.schemaForCount(cube.vertices.length),
    cube.vertices,
  )
  .$usage('vertex');
const cubeIndexBuffer = root
  .createBuffer(d.arrayOf(d.u16, cube.indices.length), cube.indices)
  .$usage('index');

const floorVertexBuffer = root
  .createBuffer(
    vertexData.schemaForCount(floorCube.vertices.length),
    floorCube.vertices,
  )
  .$usage('vertex');
const floorIndexBuffer = root
  .createBuffer(d.arrayOf(d.u16, floorCube.indices.length), floorCube.indices)
  .$usage('index');

let depthTexture = root['~unstable']
  .createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
  })
  .$usage('render');

const renderLayout = tgpu.bindGroupLayout({
  camera: { uniform: CameraData },
  modelMatrix: { uniform: d.mat4x4f },
  lightPosition: { uniform: d.vec3f },
});

const renderLayoutWithShadow = tgpu.bindGroupLayout({
  camera: { uniform: CameraData },
  modelMatrix: { uniform: d.mat4x4f },
  shadowDepthCube: { texture: d.textureDepthCube() },
  shadowSampler: { sampler: 'comparison' },
  lightPosition: { uniform: d.vec3f },
});

const debugSampler = root['~unstable'].createSampler({
  minFilter: 'nearest',
  magFilter: 'nearest',
});

const debugView = cameraDepthCube.createView(d.textureDepth2dArray(), {
  baseArrayLayer: 0,
  arrayLayerCount: 6,
  aspect: 'depth-only',
});

const debugFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const localUV = d.vec2f(
    std.fract(uv.x * 3),
    std.fract(uv.y * 2),
  );

  const col = std.floor(uv.x * 3);
  const row = std.floor(uv.y * 2);
  const arrayIndex = d.i32(row * 3 + col);

  const depth = std.textureSample(
    debugView.$,
    debugSampler.$,
    localUV,
    arrayIndex,
  );
  return d.vec4f(d.vec3f(depth), 1.0);
});

const debugPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(debugFragment, { format: presentationFormat })
  .createPipeline();

const vertexDepth = tgpu['~unstable'].vertexFn({
  in: {
    ...VertexData.propTypes,
  },
  out: {
    pos: d.builtin.position,
    worldPos: d.vec3f,
  },
})(({ position }) => {
  const worldPos = renderLayout.$.modelMatrix.mul(d.vec4f(position, 1)).xyz;
  const pos = renderLayout.$.camera.viewProjectionMatrix.mul(
    d.vec4f(worldPos, 1),
  );

  return {
    pos,
    worldPos,
  };
});

const lightFar = 25.0; // must match shadow camera far plane

const fragmentDepth = tgpu['~unstable'].fragmentFn({
  in: {
    worldPos: d.vec3f,
  },
  out: d.builtin.fragDepth,
})(({ worldPos }) => {
  const lightPos = renderLayout.$.lightPosition;

  const lightToFrag = worldPos.sub(lightPos);
  const dist = std.length(lightToFrag);

  // map [0, lightFar] -> [0, 1]
  const depth = dist / lightFar;

  return depth;
});

const vertexMain = tgpu['~unstable'].vertexFn({
  in: {
    ...VertexData.propTypes,
  },
  out: {
    pos: d.builtin.position,
    worldPos: d.vec3f,
    uv: d.vec2f,
    normal: d.vec3f,
  },
})(({ position, uv, normal }) => {
  const worldPos =
    renderLayoutWithShadow.$.modelMatrix.mul(d.vec4f(position, 1)).xyz;
  const pos = renderLayoutWithShadow.$.camera.viewProjectionMatrix.mul(
    d.vec4f(worldPos, 1),
  );

  return {
    pos,
    worldPos,
    uv,
    normal,
  };
});

const debugUniform = root.createUniform(d.f32, 0.0);

const fragmentMain = tgpu['~unstable'].fragmentFn({
  in: {
    worldPos: d.vec3f,
    uv: d.vec2f,
    normal: d.vec3f,
  },
  out: d.vec4f,
})(({ worldPos, normal }) => {
  const lightPos = renderLayoutWithShadow.$.lightPosition;

  // direction from light to fragment (for cubemap)
  const lightToFrag = worldPos.sub(lightPos);
  const dist = std.length(lightToFrag);
  const dir = lightToFrag.div(dist); // normalized direction

  const depthRef = dist / 25.0; // must match lightFar used in depth pass

  // Optional bias to reduce acne
  const bias = 0.002;
  const visibility = std.textureSampleCompare(
    renderLayoutWithShadow.$.shadowDepthCube,
    renderLayoutWithShadow.$.shadowSampler,
    dir,
    depthRef - bias,
  );

  const rawValue = std.textureSample(
    renderLayoutWithShadow.$.shadowDepthCube,
    debugSampler.$,
    dir,
  );

  // return d.vec4f(d.vec3f(rawValue), 1.0);

  // calculate light direction
  const lightDir = std.normalize(lightPos.sub(worldPos));

  // diffuse shading
  const diff = std.max(std.dot(normal, lightDir), 0.0);

  const baseColor = d.vec3f(1.0, 0.5, 0.31);
  const ambient = 0.1;
  const color = baseColor.mul(diff * visibility + ambient);

  return d.vec4f(color, 1.0);
});

const shadowSampler = root['~unstable'].createComparisonSampler({
  compare: 'less-equal',
  magFilter: 'linear',
  minFilter: 'linear',
});

const shadowCubeView = cameraDepthCube.createView(d.textureDepthCube());

const lightPositionUniform = root.createUniform(
  d.vec3f,
  pointLightWorldPosition,
);

const mainBindGroup = root.createBindGroup(renderLayoutWithShadow, {
  camera: cameraUniform.buffer,
  modelMatrix: modelMatrixUniform.buffer,
  shadowDepthCube: shadowCubeView,
  shadowSampler: shadowSampler,
  lightPosition: lightPositionUniform.buffer,
});

const pipelineMain = root['~unstable']
  .withVertex(vertexMain, vertexData.attrib)
  .withFragment(fragmentMain, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .createPipeline();

const pipelineDepthOne = root['~unstable']
  .withVertex(vertexDepth, vertexData.attrib)
  .withFragment(fragmentDepth, {} as never)
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .createPipeline();

const shadowCameraUniforms = Object.fromEntries(
  Object.entries(shadowCameras).map(([key, cam]) => [
    key,
    root.createUniform(CameraData, cam.data),
  ]),
);

const shadowBindGroups = Object.entries(shadowCameras).map(([key, cam]) => {
  return [
    key,
    root.createBindGroup(renderLayout, {
      camera: shadowCameraUniforms[key as keyof typeof shadowCameras].buffer,
      modelMatrix: modelMatrixUniform.buffer,
      lightPosition: lightPositionUniform.buffer,
    }),
  ] as const;
});

function updateShadowMaps() {
  // Update all shadow camera uniforms
  for (const [key, cam] of Object.entries(shadowCameras)) {
    shadowCameraUniforms[key as keyof typeof shadowCameras].write(cam.data);
  }

  for (const [key, bindGroup] of shadowBindGroups) {
    const view = cameraDepthCube.createView(d.textureDepth2d(), {
      baseArrayLayer: {
        right: 0, // +X
        left: 1, // -X
        up: 2, // +Y
        down: 3, // -Y
        forward: 4, // +Z
        backward: 5, // -Z
      }[key as keyof typeof shadowCameras],
      arrayLayerCount: 1,
    });

    // Draw cube
    modelMatrixUniform.write(cube.modelMatrix);
    pipelineDepthOne
      .withDepthStencilAttachment({
        view: root.unwrap(view),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      })
      .with(bindGroup)
      .withIndexBuffer(cubeIndexBuffer)
      .with(vertexData, cubeVertexBuffer)
      .drawIndexed(cube.indices.length);

    // Draw floor
    modelMatrixUniform.write(floorCube.modelMatrix);
    pipelineDepthOne
      .withDepthStencilAttachment({
        view: root.unwrap(view),
        depthClearValue: 1,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
      })
      .with(bindGroup)
      .withIndexBuffer(floorIndexBuffer)
      .with(vertexData, floorVertexBuffer)
      .drawIndexed(floorCube.indices.length);
  }
}

function render() {
  // Update shadow maps every frame
  updateShadowMaps();

  // debugPipeline
  //   .withColorAttachment({
  //     view: context.getCurrentTexture().createView(),
  //     loadOp: 'clear',
  //     storeOp: 'store',
  //   })
  //   .draw(3);
  // requestAnimationFrame(render);
  // return;

  modelMatrixUniform.write(cube.modelMatrix);
  pipelineMain
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(mainBindGroup)
    .withIndexBuffer(cubeIndexBuffer)
    .with(vertexData, cubeVertexBuffer)
    .drawIndexed(cube.indices.length);

  modelMatrixUniform.write(floorCube.modelMatrix);
  pipelineMain
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: 'load',
      depthStoreOp: 'store',
    })
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'load',
      storeOp: 'store',
    })
    .with(mainBindGroup)
    .withIndexBuffer(floorIndexBuffer)
    .with(vertexData, floorVertexBuffer)
    .drawIndexed(floorCube.indices.length);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// Resize observer
const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const width = entry.contentBoxSize[0].inlineSize;
    const height = entry.contentBoxSize[0].blockSize;

    canvas.width = Math.max(
      1,
      Math.min(width, device.limits.maxTextureDimension2D),
    );
    canvas.height = Math.max(
      1,
      Math.min(height, device.limits.maxTextureDimension2D),
    );

    // Recreate depth texture with new size
    depthTexture = root['~unstable']
      .createTexture({
        size: [canvas.width, canvas.height],
        format: 'depth24plus',
      })
      .$usage('render');
  }
});

resizeObserver.observe(canvas);

// Orbit controls
let theta = Math.atan2(10, 10);
let phi = Math.acos(10 / Math.sqrt(10 * 10 + 10 * 10 + 10 * 10));
let radius = Math.sqrt(10 * 10 + 10 * 10 + 10 * 10);

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

function updateCameraPosition() {
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  mainCamera.position = d.vec3f(x, y, z);
  cameraUniform.write(mainCamera.data);
}

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

canvas.addEventListener('mouseup', () => {
  isDragging = false;
});

canvas.addEventListener('mousemove', (e) => {
  if (!isDragging) return;

  const deltaX = e.clientX - lastMouseX;
  const deltaY = e.clientY - lastMouseY;

  lastMouseX = e.clientX;
  lastMouseY = e.clientY;

  theta -= deltaX * 0.01;
  phi -= deltaY * 0.01;

  // Clamp phi to avoid gimbal lock
  phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi));

  updateCameraPosition();
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();

  radius += e.deltaY * 0.01;
  radius = Math.max(1, Math.min(50, radius));

  updateCameraPosition();
});

export const controls = {
  'Debug Val': {
    initial: 0,
    min: 0,
    max: 100,
    step: 0.01,
    onSliderChange: (v: number) => {
      debugUniform.write(v);
    },
  },
};
