import tgpu, { common, d, std } from 'typegpu';
import { BoxGeometry } from './box-geometry.ts';
import { Camera } from './camera.ts';
import { PointLight } from './point-light.ts';
import { Scene } from './scene.ts';
import {
  CameraData,
  InstanceData,
  instanceLayout,
  VertexData,
  vertexLayout,
} from './types.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const mainCamera = new Camera(root);
mainCamera.position = d.vec3f(5, 5, -5);
mainCamera.target = d.vec3f(0, 0, 0);

const pointLight = new PointLight(root, d.vec3f(4.5, 1, 4), {
  far: 100.0,
  shadowMapSize: 1024,
});

const scene = new Scene(root);

const cube = new BoxGeometry(root);
cube.scale = d.vec3f(3, 1, 0.2);

const orbitingCubes: BoxGeometry[] = [];
for (let i = 0; i < 10; i++) {
  const orbitingCube = new BoxGeometry(root);
  const angle = (i / 10) * Math.PI * 2;
  const radius = 4;
  orbitingCube.position = d.vec3f(
    Math.cos(angle) * radius,
    0.5,
    Math.sin(angle) * radius,
  );
  orbitingCube.scale = d.vec3f(0.5, 0.5, 0.5);
  orbitingCubes.push(orbitingCube);
}

const floorCube = new BoxGeometry(root);
floorCube.scale = d.vec3f(10, 0.1, 10);
floorCube.position = d.vec3f(0, -0.5, 0);
scene.add([cube, floorCube, ...orbitingCubes]);

let depthTexture = root['~unstable']
  .createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    sampleCount: 4,
  }).$usage('render');

let msaaTexture = root['~unstable']
  .createTexture({
    size: [canvas.width, canvas.height],
    format: presentationFormat as 'bgra8unorm' | 'rgba8unorm',
    sampleCount: 4,
  })
  .$usage('render');

const shadowSampler = root['~unstable'].createComparisonSampler({
  compare: 'less-equal',
  magFilter: 'linear',
  minFilter: 'linear',
});

const renderLayout = tgpu.bindGroupLayout({
  camera: { uniform: CameraData },
  lightPosition: { uniform: d.vec3f },
});

const renderLayoutWithShadow = tgpu.bindGroupLayout({
  camera: { uniform: CameraData },
  shadowDepthCube: { texture: d.textureDepthCube() },
  shadowSampler: { sampler: 'comparison' },
  lightPosition: { uniform: d.vec3f },
});

const vertexDepth = tgpu.vertexFn({
  in: { ...VertexData.propTypes, ...InstanceData.propTypes },
  out: { pos: d.builtin.position, worldPos: d.vec3f },
})(({ position, column1, column2, column3, column4 }) => {
  const modelMatrix = d.mat4x4f(column1, column2, column3, column4);
  const worldPos = modelMatrix.mul(d.vec4f(position, 1)).xyz;
  const pos = renderLayout.$.camera.viewProjectionMatrix.mul(
    d.vec4f(worldPos, 1),
  );
  return { pos, worldPos };
});

const fragmentDepth = tgpu.fragmentFn({
  in: { worldPos: d.vec3f },
  out: d.builtin.fragDepth,
})(({ worldPos }) => {
  const dist = std.length(worldPos.sub(renderLayout.$.lightPosition));
  return dist / pointLight.far;
});

const vertexMain = tgpu.vertexFn({
  in: { ...VertexData.propTypes, ...InstanceData.propTypes },
  out: {
    pos: d.builtin.position,
    worldPos: d.vec3f,
    uv: d.vec2f,
    normal: d.vec3f,
  },
})(({ position, uv, normal, column1, column2, column3, column4 }) => {
  const modelMatrix = d.mat4x4f(column1, column2, column3, column4);
  const worldPos = modelMatrix.mul(d.vec4f(position, 1)).xyz;
  const pos = renderLayoutWithShadow.$.camera.viewProjectionMatrix.mul(
    d.vec4f(worldPos, 1),
  );
  const worldNormal = std.normalize(modelMatrix.mul(d.vec4f(normal, 0)).xyz);
  return { pos, worldPos, uv, normal: worldNormal };
});

const shadowParams = root.createUniform(
  d.struct({
    pcfSamples: d.u32,
    diskRadius: d.f32,
    normalBiasBase: d.f32,
    normalBiasSlope: d.f32,
  }),
  {
    pcfSamples: 32,
    diskRadius: 0.01,
    normalBiasBase: 0.027,
    normalBiasSlope: 0.335,
  },
);

const MAX_PCF_SAMPLES = 64;
const samplesUniform = root.createUniform(
  d.arrayOf(d.vec4f, MAX_PCF_SAMPLES),
  Array.from({ length: MAX_PCF_SAMPLES }, (_, i) => {
    const index = i;
    const theta = index * 2.3999632; // golden angle
    const r = std.sqrt(index / d.f32(MAX_PCF_SAMPLES));
    return d.vec4f(d.vec2f(std.cos(theta) * r, std.sin(theta) * r), 0, 0);
  }),
);

const fragmentMain = tgpu.fragmentFn({
  in: { worldPos: d.vec3f, uv: d.vec2f, normal: d.vec3f },
  out: d.vec4f,
})(({ worldPos, normal }) => {
  const lightPos = renderLayoutWithShadow.$.lightPosition;
  const toLight = lightPos.sub(worldPos);
  const dist = std.length(toLight);
  const lightDir = toLight.div(dist);
  const ndotl = std.max(std.dot(normal, lightDir), 0.0);

  const normalBiasWorld = shadowParams.$.normalBiasBase +
    shadowParams.$.normalBiasSlope * (1.0 - ndotl);
  const biasedPos = worldPos.add(normal.mul(normalBiasWorld));
  const toLightBiased = biasedPos.sub(lightPos);
  const distBiased = std.length(toLightBiased);
  const dir = toLightBiased.div(distBiased).mul(d.vec3f(-1, 1, 1));
  const depthRef = distBiased / pointLight.far;

  const up = std.select(
    d.vec3f(1, 0, 0),
    d.vec3f(0, 1, 0),
    std.abs(dir.y) < d.f32(0.9999),
  );
  const right = std.normalize(std.cross(up, dir));
  const realUp = std.cross(dir, right);

  const PCF_SAMPLES = shadowParams.$.pcfSamples;
  const diskRadius = shadowParams.$.diskRadius;

  let visibilityAcc = 0.0;
  for (let i = 0; i < PCF_SAMPLES; i++) {
    const o = samplesUniform.$[i].xy.mul(diskRadius);

    const sampleDir = dir
      .add(right.mul(o.x))
      .add(realUp.mul(o.y));

    visibilityAcc += std.textureSampleCompare(
      renderLayoutWithShadow.$.shadowDepthCube,
      renderLayoutWithShadow.$.shadowSampler,
      sampleDir,
      depthRef,
    );
  }

  const rawNdotl = std.dot(normal, lightDir);
  const visibility = std.select(
    visibilityAcc / d.f32(PCF_SAMPLES),
    0.0,
    rawNdotl < 0.0,
  );

  const baseColor = d.vec3f(1.0, 0.5, 0.31);
  const color = baseColor.mul(ndotl * visibility + 0.1);
  return d.vec4f(color, 1.0);
});

const lightIndicatorLayout = tgpu.bindGroupLayout({
  camera: { uniform: CameraData },
  lightPosition: { uniform: d.vec3f },
});

const vertexLightIndicator = tgpu.vertexFn({
  in: { position: d.vec3f },
  out: { pos: d.builtin.position },
})(({ position }) => {
  const worldPos = position.mul(0.15).add(lightIndicatorLayout.$.lightPosition);
  const pos = lightIndicatorLayout.$.camera.viewProjectionMatrix.mul(
    d.vec4f(worldPos, 1),
  );
  return { pos };
});

const fragmentLightIndicator = tgpu.fragmentFn({
  out: d.vec4f,
})(() => d.vec4f(1.0, 1.0, 0.5, 1.0));

const previewSampler = root['~unstable'].createSampler({
  minFilter: 'nearest',
  magFilter: 'nearest',
});
const previewView = pointLight.createDepthArrayView();

const depthToColor = tgpu.fn([d.f32], d.vec3f)((depth) => {
  const linear = std.clamp(1 - depth * 6, 0, 1);
  const t = linear * linear;
  const r = std.clamp(t * 2 - 0.5, 0, 1);
  const g = std.clamp(1 - std.abs(t - 0.5) * 2, 0, 0.9) * t;
  const b = std.clamp(1 - t * 1.5, 0, 1) * t;
  return d.vec3f(r, g, b);
});

const fragmentDistanceView = tgpu.fragmentFn({
  in: { worldPos: d.vec3f, uv: d.vec2f, normal: d.vec3f },
  out: d.vec4f,
})(({ worldPos }) => {
  const lightPos = renderLayoutWithShadow.$.lightPosition;
  const dist = std.length(worldPos.sub(lightPos));
  const color = depthToColor(dist / pointLight.far);
  return d.vec4f(color, 1.0);
});

const previewFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const gridX = d.i32(std.floor(uv.x * 4));
  const gridY = d.i32(std.floor(uv.y * 3));

  const localU = std.fract(uv.x * 4);
  const localV = std.fract(uv.y * 3);
  const localUV = d.vec2f(localU, localV);

  const bgColor = d.vec3f(0.1, 0.1, 0.12);

  let faceIndex = d.i32(-1);

  // Top row: +Y (index 2)
  if (gridY === 0 && gridX === 1) {
    faceIndex = 2;
  }
  // Middle row: -X, +Z, +X, -Z
  if (gridY === 1) {
    if (gridX === 0) {
      faceIndex = 0; // -X
    }
    if (gridX === 1) {
      faceIndex = 4; // +Z
    }
    if (gridX === 2) {
      faceIndex = 1; // +X
    }
    if (gridX === 3) {
      faceIndex = 5; // -Z
    }
  }
  // Bottom row: -Y (index 3)
  if (gridY === 2 && gridX === 1) {
    faceIndex = 3;
  }

  const depth = std.textureSample(
    previewView.$,
    previewSampler.$,
    localUV,
    faceIndex,
  );

  if (faceIndex < 0) {
    return d.vec4f(bgColor, 1.0);
  }

  const color = depthToColor(depth);

  const border = 0.02;
  const isBorder = localU < border || localU > 1 - border || localV < border ||
    localV > 1 - border;
  const finalColor = std.select(color, std.mul(0.5, color), isBorder);

  return d.vec4f(finalColor, 1.0);
});

const pipelineDepthOne = root.createRenderPipeline({
  attribs: { ...vertexLayout.attrib, ...instanceLayout.attrib },
  vertex: vertexDepth,
  fragment: fragmentDepth,
  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
});

const pipelineMain = root.createRenderPipeline({
  attribs: { ...vertexLayout.attrib, ...instanceLayout.attrib },
  vertex: vertexMain,
  fragment: fragmentMain,
  targets: { format: presentationFormat },
  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
  multisample: { count: 4 },
});

const pipelinePreview = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: previewFragment,
  targets: { format: presentationFormat },
});

const pipelineLightIndicator = root.createRenderPipeline({
  attribs: vertexLayout.attrib,
  vertex: vertexLightIndicator,
  fragment: fragmentLightIndicator,
  targets: { format: presentationFormat },
  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
  multisample: { count: 4 },
});

const pipelineDistanceView = root.createRenderPipeline({
  attribs: { ...vertexLayout.attrib, ...instanceLayout.attrib },
  vertex: vertexMain,
  fragment: fragmentDistanceView,
  targets: { format: presentationFormat },
  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
  multisample: { count: 4 },
});

const mainBindGroup = root.createBindGroup(renderLayoutWithShadow, {
  camera: mainCamera.uniform.buffer,
  shadowDepthCube: pointLight.createCubeView(),
  shadowSampler,
  lightPosition: pointLight.positionUniform.buffer,
});

const lightIndicatorBindGroup = root.createBindGroup(lightIndicatorLayout, {
  camera: mainCamera.uniform.buffer,
  lightPosition: pointLight.positionUniform.buffer,
});

let showDepthPreview = false;
let showDistanceView = false;
let lastTime = performance.now();
let time = 0;

function render(timestamp: number) {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  time += dt;

  for (let i = 0; i < orbitingCubes.length; i++) {
    const offset = (i / orbitingCubes.length) * Math.PI * 2;
    const angle = time * 0.5 + offset;
    const radius = 4 + Math.sin(time * 2 + offset * 3) * 0.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = 2 + Math.sin(time * 1.5 + offset * 2) * 1.5;
    orbitingCubes[i].position = d.vec3f(x, y, z);
    orbitingCubes[i].rotation = d.vec3f(time, time * 0.5, 0);
  }

  scene.update();
  pointLight.renderShadowMaps(pipelineDepthOne, renderLayout, scene);

  if (showDepthPreview) {
    pipelinePreview
      .withColorAttachment({ view: context })
      .draw(3);
    requestAnimationFrame(render);
    return;
  }

  const mainPipeline = showDistanceView ? pipelineDistanceView : pipelineMain;

  mainPipeline
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .withColorAttachment({
      resolveTarget: context,
      view: msaaTexture,
    })
    .with(mainBindGroup)
    .withIndexBuffer(BoxGeometry.indexBuffer)
    .with(vertexLayout, BoxGeometry.vertexBuffer)
    .with(instanceLayout, scene.instanceBuffer)
    .drawIndexed(BoxGeometry.indexCount, scene.instanceCount);

  pipelineLightIndicator
    .withDepthStencilAttachment({
      view: depthTexture,
      depthLoadOp: 'load',
      depthStoreOp: 'store',
    })
    .withColorAttachment({
      resolveTarget: context,
      view: msaaTexture,
      loadOp: 'load',
    })
    .with(lightIndicatorBindGroup)
    .withIndexBuffer(BoxGeometry.indexBuffer)
    .with(vertexLayout, BoxGeometry.vertexBuffer)
    .drawIndexed(BoxGeometry.indexCount);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

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

    depthTexture = root['~unstable']
      .createTexture({
        size: [canvas.width, canvas.height],
        format: 'depth24plus',
        sampleCount: 4,
      })
      .$usage('render');
    msaaTexture = root['~unstable']
      .createTexture({
        size: [canvas.width, canvas.height],
        format: presentationFormat as 'bgra8unorm' | 'rgba8unorm',
        sampleCount: 4,
      })
      .$usage('render');
  }
});
resizeObserver.observe(canvas);

const initialCamPos = { x: 5, y: 5, z: -5 };
let theta = Math.atan2(initialCamPos.z, initialCamPos.x);
let phi = Math.acos(
  initialCamPos.y /
    Math.sqrt(
      initialCamPos.x ** 2 + initialCamPos.y ** 2 + initialCamPos.z ** 2,
    ),
);
let radius = Math.sqrt(
  initialCamPos.x ** 2 + initialCamPos.y ** 2 + initialCamPos.z ** 2,
);

let isDragging = false;
let prevX = 0;
let prevY = 0;
let lastPinchDist = 0;

function updateCameraPosition() {
  mainCamera.position = d.vec3f(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function updateCameraOrbit(dx: number, dy: number) {
  theta += dx * 0.01;
  phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi - dy * 0.01));
  updateCameraPosition();
}

function zoomCamera(delta: number) {
  radius = Math.max(1, Math.min(50, radius + delta));
  updateCameraPosition();
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomCamera(e.deltaY * 0.01);
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  prevX = e.clientX;
  prevY = e.clientY;
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (e.touches.length === 1) {
    isDragging = true;
    prevX = e.touches[0].clientX;
    prevY = e.touches[0].clientY;
  } else if (e.touches.length === 2) {
    isDragging = false;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastPinchDist = Math.sqrt(dx * dx + dy * dy);
  }
}, { passive: false });

const mouseUpEventListener = () => {
  isDragging = false;
};
window.addEventListener('mouseup', mouseUpEventListener);

const touchEndEventListener = (e: TouchEvent) => {
  if (e.touches.length === 1) {
    isDragging = true;
    prevX = e.touches[0].clientX;
    prevY = e.touches[0].clientY;
  } else {
    isDragging = false;
  }
};
window.addEventListener('touchend', touchEndEventListener);

const mouseMoveEventListener = (e: MouseEvent) => {
  if (!isDragging) return;
  const dx = e.clientX - prevX;
  const dy = e.clientY - prevY;
  prevX = e.clientX;
  prevY = e.clientY;
  updateCameraOrbit(dx, dy);
};
window.addEventListener('mousemove', mouseMoveEventListener);

const touchMoveEventListener = (e: TouchEvent) => {
  if (e.touches.length === 1 && isDragging) {
    e.preventDefault();
    const dx = e.touches[0].clientX - prevX;
    const dy = e.touches[0].clientY - prevY;
    prevX = e.touches[0].clientX;
    prevY = e.touches[0].clientY;
    updateCameraOrbit(dx, dy);
  }
};
window.addEventListener('touchmove', touchMoveEventListener, {
  passive: false,
});

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const pinchDist = Math.sqrt(dx * dx + dy * dy);
    zoomCamera((lastPinchDist - pinchDist) * 0.05);
    lastPinchDist = pinchDist;
  }
}, { passive: false });

// #region Example controls and cleanup

export const controls = defineControls({
  'Light X': {
    initial: 4.5,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange: (v) => {
      pointLight.position = d.vec3f(
        v,
        pointLight.position.y,
        pointLight.position.z,
      );
    },
  },
  'Light Y': {
    initial: 1,
    min: 0.5,
    max: 10,
    step: 0.1,
    onSliderChange: (v) => {
      pointLight.position = d.vec3f(
        pointLight.position.x,
        v,
        pointLight.position.z,
      );
    },
  },
  'Light Z': {
    initial: 4,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange: (v) => {
      pointLight.position = d.vec3f(
        pointLight.position.x,
        pointLight.position.y,
        v,
      );
    },
  },
  'Show Depth Cubemap': {
    initial: false,
    onToggleChange: (v) => {
      showDepthPreview = v;
    },
  },
  'Show Distance View': {
    initial: false,
    onToggleChange: (v) => {
      showDistanceView = v;
    },
  },
  'PCF Samples': {
    initial: 16,
    min: 1,
    max: 64,
    step: 1,
    onSliderChange: (v) => {
      shadowParams.writePartial({ pcfSamples: v });
    },
  },
  'PCF Disk Radius': {
    initial: 0.01,
    min: 0.0,
    max: 0.1,
    step: 0.001,
    onSliderChange: (v) => {
      shadowParams.writePartial({ diskRadius: v });
    },
  },
  'Normal Bias Base': {
    initial: 0.027,
    min: 0.0,
    max: 0.1,
    step: 0.0001,
    onSliderChange: (v) => {
      shadowParams.writePartial({ normalBiasBase: v });
    },
  },
  'Normal Bias Slope': {
    initial: 0.335,
    min: 0.0,
    max: 0.5,
    step: 0.0005,
    onSliderChange: (v) => {
      shadowParams.writePartial({ normalBiasSlope: v });
    },
  },
});

export function onCleanup() {
  BoxGeometry.clearBuffers();
  window.removeEventListener('mouseup', mouseUpEventListener);
  window.removeEventListener('mousemove', mouseMoveEventListener);
  window.removeEventListener('touchend', touchEndEventListener);
  window.removeEventListener('touchmove', touchMoveEventListener);
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
