import tgpu, { type Render, type TgpuTexture } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

// Initialization
const SHADOW_MAP_SIZE = 1024;

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const startTime = performance.now();

// --- Minimal debug controls (set to true only while diagnosing) ---
const DEBUG_USE_GE_COMPARE = false; // Switch comparison op (less-equal vs greater-equal)
const DEBUG_SHOW_FACE_ID = true; // Colorize selected cubemap face
const DEBUG_SHOW_SHADOW_TERM = false; // Visualize shadow compare result (grayscale)
const DEBUG_INVERT_Y_FACES = false; // If true, swap +Y / -Y face forward vectors (diagnose flipped up/down shadows)
const DEBUG_BIAS = d.f32(0.0008); // Extra ref depth bias (prefer depthBias in shadow pass)

import { Object3D, VertexInfo } from './object3d.ts';
import {
  createBoxGeometry,
  createPlaneGeometry,
  createUvSphereGeometry,
} from './geometry.ts';
import { CameraInfo, createCamera } from './camera.ts';
import { AmbientLight, DirectionalLight, PointLight } from './lights.ts';
import * as m from 'wgpu-matrix';

const comparisonSamplerLE = tgpu['~unstable'].comparisonSampler({
  compare: 'less-equal',
  magFilter: 'linear',
  minFilter: 'linear',
});
const comparisonSamplerGE = tgpu['~unstable'].comparisonSampler({
  compare: 'greater-equal',
  magFilter: 'linear',
  minFilter: 'linear',
});

const layout = tgpu.bindGroupLayout({
  camera: { uniform: CameraInfo },
  model: { uniform: d.mat4x4f },
  normalMatrix: { uniform: d.mat3x3f },
  shadowMap: { texture: 'depth', viewDimension: 'cube' },
  shadowSampler: { sampler: 'comparison' },
  light: { uniform: DirectionalLight },
  ambientLight: { uniform: AmbientLight },
  pointLight: { uniform: PointLight },
});
const test = layout.$.shadowMap;

// Shadow map layout for depth-only rendering
const shadowLayout = tgpu.bindGroupLayout({
  lightCamera: { uniform: CameraInfo },
  model: { uniform: d.mat4x4f },
});

const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(VertexInfo, n));

// Shadow map vertex shader (depth-only rendering)
const shadowVertex = tgpu['~unstable'].vertexFn({
  in: {
    position: d.vec4f,
    normal: d.vec4f,
    color: d.vec4f,
  },
  out: {
    pos: d.builtin.position,
  },
})(({ position }) => {
  const modelMatrix = shadowLayout.$.model;
  const projectionMatrix = shadowLayout.$.lightCamera.projectionMatrix;
  const viewMatrix = shadowLayout.$.lightCamera.viewMatrix;

  const worldPosition = std.mul(modelMatrix, position);
  const viewPosition = std.mul(viewMatrix, worldPosition);
  const pos = std.mul(projectionMatrix, viewPosition);

  return { pos };
});

// Main rendering vertex shader
const vertex = tgpu['~unstable'].vertexFn({
  in: {
    position: d.vec4f,
    normal: d.vec4f,
    color: d.vec4f,
  },
  out: {
    pos: d.builtin.position,
    normal: d.vec4f,
    color: d.vec4f,
    worldPos: d.vec4f,
  },
})(({ position, normal, color }) => {
  const modelMatrix = layout.$.model;
  const projectionMatrix = layout.$.camera.projectionMatrix;
  const viewMatrix = layout.$.camera.viewMatrix;

  const worldPosition = std.mul(modelMatrix, position);
  const viewPosition = std.mul(viewMatrix, worldPosition);
  const pos = std.mul(projectionMatrix, viewPosition);

  const transformedNormal = std.normalize(
    std.mul(layout.$.normalMatrix, normal.xyz),
  );

  return {
    pos,
    normal: d.vec4f(transformedNormal, 0),
    color,
    worldPos: worldPosition,
  };
});

const fragment = tgpu['~unstable'].fragmentFn({
  in: {
    normal: d.vec4f,
    color: d.vec4f,
    worldPos: d.vec4f,
  },
  out: d.vec4f,
})(({ normal, color, worldPos }) => {
  const shininess = d.f32(32.0);

  // Active (minimal) debug flags
  const SH_DEBUG_SHOW_FACE_ID = DEBUG_SHOW_FACE_ID;
  const SH_DEBUG_SHOW_SHADOW_TERM = DEBUG_SHOW_SHADOW_TERM;
  const SH_DEBUG_BIAS = DEBUG_BIAS;

  const light = layout.$.light;
  const lightDir = std.normalize(light.direction);
  const invLightDir = std.neg(lightDir);

  const ambientLight = layout.$.ambientLight;
  const ambientColor = std.mul(ambientLight.color, ambientLight.intensity);

  // Directional light - Lambertian diffuse reflection
  const diffuse = std.max(std.dot(normal.xyz, invLightDir), 0.0);
  const diffuseColor = std.mul(color.xyz, light.color);
  const diffuseLight = std.mul(diffuseColor, diffuse * light.intensity);

  // Directional light - Blinn-Phong specular reflection
  const specular = std.pow(
    std.max(std.dot(normal.xyz, invLightDir), 0.0),
    shininess,
  );
  const specularColor = std.mul(light.color, specular * light.intensity * 0.05);

  // Point light calculations
  const pointLight = layout.$.pointLight;

  // Shadow mapping (depth cubemap + comparison) --------------------
  // Direction from light to fragment
  const delta = std.sub(worldPos.xyz, pointLight.position); // light -> fragment
  const sampleDir = std.normalize(delta);
  const lightDistance = std.length(delta);
  const pointLightDir = std.normalize(
    std.sub(pointLight.position, worldPos.xyz),
  ); // fragment -> light (for shading)

  // Face selection by dominant axis
  const ax = std.abs(sampleDir.x);
  const ay = std.abs(sampleDir.y);
  const az = std.abs(sampleDir.z);

  let faceForward = d.vec3f(1.0, 0.0, 0.0);
  let faceColor = d.vec3f(1.0, 0.0, 0.0); // +X (red)
  if (ax >= ay && ax >= az) {
    if (sampleDir.x >= 0.0) {
      faceForward = d.vec3f(1.0, 0.0, 0.0);
      faceColor = d.vec3f(1.0, 0.0, 0.0); // +X
    } else {
      faceForward = d.vec3f(-1.0, 0.0, 0.0);
      faceColor = d.vec3f(0.5, 0.0, 0.0); // -X
    }
  } else if (ay >= ax && ay >= az) {
    // Y faces (optionally invert)
    let posY = d.vec3f(0.0, 1.0, 0.0);
    if (DEBUG_INVERT_Y_FACES) {
      posY = d.vec3f(0.0, -1.0, 0.0);
    }
    let negY = d.vec3f(0.0, -1.0, 0.0);
    if (DEBUG_INVERT_Y_FACES) {
      negY = d.vec3f(0.0, 1.0, 0.0);
    }
    if (sampleDir.y >= 0.0) {
      faceForward = posY;
      faceColor = d.vec3f(0.0, 1.0, 0.0); // +Y
    } else {
      faceForward = negY;
      faceColor = d.vec3f(0.0, 0.5, 0.0); // -Y
    }
  } else {
    if (sampleDir.z >= 0.0) {
      faceForward = d.vec3f(0.0, 0.0, 1.0);
      faceColor = d.vec3f(0.0, 0.0, 1.0); // +Z
    } else {
      faceForward = d.vec3f(0.0, 0.0, -1.0);
      faceColor = d.vec3f(0.0, 0.0, 0.5); // -Z
    }
  }
  if (SH_DEBUG_SHOW_FACE_ID) {
    return d.vec4f(faceColor, 1.0);
  }

  if (SH_DEBUG_SHOW_FACE_ID) {
    return d.vec4f(faceColor, 1.0);
  }

  // Reconstruct zEye (distance along face forward)
  let zEye = std.dot(delta, faceForward);
  zEye = std.max(0.0001, zEye);

  // Perspective depth mapping (0..1) : depth = a + b / zEye
  const shadowNear = d.f32(0.1); // must match shadow cameras
  const shadowFar = pointLight.range; // must match shadow cameras
  const a = std.div(shadowFar, std.sub(shadowFar, shadowNear));
  const b = std.div(
    std.mul(shadowNear, shadowFar),
    std.sub(shadowNear, shadowFar),
  ); // negative
  let refDepth = std.clamp(std.add(a, std.div(b, zEye)), 0.0, 1.0);
  refDepth = std.max(0.0, std.sub(refDepth, SH_DEBUG_BIAS)); // small bias (additional to depthBias)

  const shadowTerm = std.textureSampleCompare(
    layout.$.shadowMap,
    layout.$.shadowSampler,
    sampleDir,
    refDepth,
  );
  if (SH_DEBUG_SHOW_SHADOW_TERM) {
    return d.vec4f(d.vec3f(shadowTerm, shadowTerm, shadowTerm), 1.0);
  }

  // Attenuation - range-based with linear + quadratic falloff
  const attenuation = std.clamp(
    std.div(
      1.0,
      std.add(
        std.add(1.0, lightDistance * 0.1),
        lightDistance * lightDistance * 0.01,
      ),
    ),
    0.0,
    1.0,
  );

  // Apply range cutoff
  const rangeAttenuation = std.select(
    d.f32(0.0),
    d.f32(1.0),
    lightDistance <= pointLight.range,
  );
  const finalAttenuation = std.mul(
    std.mul(attenuation, rangeAttenuation),
    shadowTerm,
  );

  // Point light diffuse
  const pointDiffuse = std.max(std.dot(normal.xyz, pointLightDir), 0.0);
  const pointDiffuseColor = std.mul(color.xyz, pointLight.color);
  const pointDiffuseLight = std.mul(
    std.mul(pointDiffuseColor, pointDiffuse),
    std.mul(pointLight.intensity, finalAttenuation),
  );

  // Point light specular
  const pointSpecular = std.pow(
    std.max(std.dot(normal.xyz, pointLightDir), 0.0),
    shininess,
  );
  const pointSpecularColor = std.mul(
    std.mul(pointLight.color, pointSpecular),
    std.mul(pointLight.intensity * 0.1, finalAttenuation),
  );

  const finalColor = std.add(
    ambientColor,
    std.add(
      std.add(diffuseLight, specularColor),
      std.add(pointDiffuseLight, pointSpecularColor),
    ),
  );

  return d.vec4f(std.clamp(finalColor, d.vec3f(0.0), d.vec3f(1.0)), 1.0);
});

// Shadow map pipeline (depth-only rendering)
const shadowPipeline = root['~unstable']
  .withVertex(shadowVertex, vertexLayout.attrib)
  .withPrimitive({
    cullMode: 'back',
  })
  .withDepthStencil({
    format: 'depth32float',
    depthWriteEnabled: true,
    depthCompare: 'less',
    depthBias: 2,
    depthBiasSlopeScale: 2.0,
    depthBiasClamp: 0.0,
  })
  .createPipeline();

// Main rendering pipeline
const pipeline = root['~unstable']
  .withVertex(vertex, vertexLayout.attrib)
  .withFragment(fragment, { format: presentationFormat })
  .withPrimitive({
    cullMode: 'none',
  })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .createPipeline();

// Create Cornell Box scene
const boxSize = 5;

// Back wall (light gray) - normal points toward +Z (into scene)
const backWallGeometry = createPlaneGeometry(
  d.vec4f(0.75, 0.75, 0.75, 1.0),
  d.vec3f(0, 0, 1),
);
const backWall = new Object3D(
  root,
  root.createBuffer(
    d.arrayOf(VertexInfo, backWallGeometry.vertices.length),
    backWallGeometry.vertices,
  ).$usage('vertex'),
  root.createBuffer(
    d.arrayOf(d.u16, backWallGeometry.indices.length),
    backWallGeometry.indices,
  ).$usage('index'),
);
backWall.translate(0, 0, -boxSize);
backWall.scale(boxSize, boxSize, 1);

// Left wall (red) - normal points toward +X (into scene)
const leftWallGeometry = createPlaneGeometry(
  d.vec4f(0.7, 0.2, 0.2, 1.0),
  d.vec3f(0, 0, 1),
);
const leftWall = new Object3D(
  root,
  root.createBuffer(
    d.arrayOf(VertexInfo, leftWallGeometry.vertices.length),
    leftWallGeometry.vertices,
  ).$usage('vertex'),
  root.createBuffer(
    d.arrayOf(d.u16, leftWallGeometry.indices.length),
    leftWallGeometry.indices,
  ).$usage('index'),
);
leftWall.translate(-boxSize, 0, 0);
leftWall.rotateY(Math.PI / 2);
leftWall.scale(boxSize, boxSize, 1);

// Right wall (green) - normal points toward -X (into scene)
const rightWallGeometry = createPlaneGeometry(
  d.vec4f(0.2, 0.7, 0.2, 1.0),
  d.vec3f(0, 0, 1),
);
const rightWall = new Object3D(
  root,
  root.createBuffer(
    d.arrayOf(VertexInfo, rightWallGeometry.vertices.length),
    rightWallGeometry.vertices,
  ).$usage('vertex'),
  root.createBuffer(
    d.arrayOf(d.u16, rightWallGeometry.indices.length),
    rightWallGeometry.indices,
  ).$usage('index'),
);
rightWall.translate(boxSize, 0, 0);
rightWall.rotateY(-Math.PI / 2);
rightWall.scale(boxSize, boxSize, 1);

// Floor (light gray) - normal points toward +Y (into scene)
const floorGeometry = createPlaneGeometry(
  d.vec4f(0.8, 0.8, 0.8, 1.0),
  d.vec3f(0, 0, 1),
);
const floor = new Object3D(
  root,
  root.createBuffer(
    d.arrayOf(VertexInfo, floorGeometry.vertices.length),
    floorGeometry.vertices,
  ).$usage('vertex'),
  root.createBuffer(
    d.arrayOf(d.u16, floorGeometry.indices.length),
    floorGeometry.indices,
  ).$usage('index'),
);
floor.translate(0, -boxSize, 0);
floor.rotateX(-Math.PI / 2);
floor.scale(boxSize, boxSize, 1);

// Ceiling (light gray) - normal points toward -Y (into scene)
const ceilingGeometry = createPlaneGeometry(
  d.vec4f(0.8, 0.8, 0.8, 1.0),
  d.vec3f(0, 0, 1),
);
const ceiling = new Object3D(
  root,
  root.createBuffer(
    d.arrayOf(VertexInfo, ceilingGeometry.vertices.length),
    ceilingGeometry.vertices,
  ).$usage('vertex'),
  root.createBuffer(
    d.arrayOf(d.u16, ceilingGeometry.indices.length),
    ceilingGeometry.indices,
  ).$usage('index'),
);
ceiling.translate(0, boxSize, 0);
ceiling.rotateX(Math.PI / 2);
ceiling.scale(boxSize, boxSize, 1);

// Two boxes in the scene with better colors and positioning
const box1Geometry = createBoxGeometry(d.vec4f(0.7, 0.7, 0.7, 1.0)); // Neutral gray
const box1 = new Object3D(
  root,
  root.createBuffer(
    d.arrayOf(VertexInfo, box1Geometry.vertices.length),
    box1Geometry.vertices,
  ).$usage('vertex'),
  root.createBuffer(
    d.arrayOf(d.u16, box1Geometry.indices.length),
    box1Geometry.indices,
  ).$usage('index'),
);
box1.translate(-2, -2.5, -1);
box1.rotateY(Math.PI / 6);
box1.scale(1.2, 2.5, 1.2);

const box2Geometry = createBoxGeometry(d.vec4f(0.65, 0.65, 0.65, 1.0)); // Slightly darker gray
const box2 = new Object3D(
  root,
  root.createBuffer(
    d.arrayOf(VertexInfo, box2Geometry.vertices.length),
    box2Geometry.vertices,
  ).$usage('vertex'),
  root.createBuffer(
    d.arrayOf(d.u16, box2Geometry.indices.length),
    box2Geometry.indices,
  ).$usage('index'),
);
box2.translate(2, -3.5, 1.5);
box2.rotateY(-Math.PI / 8);
box2.scale(1.5, 1.5, 1.5);

// Debug light marker (white sphere) - excluded from shadows
const lightMarkerGeometry = createUvSphereGeometry(
  d.vec4f(1.0, 1.0, 1.0, 1.0),
  24,
  16,
);
const lightMarker = new Object3D(
  root,
  root.createBuffer(
    d.arrayOf(VertexInfo, lightMarkerGeometry.vertices.length),
    lightMarkerGeometry.vertices,
  ).$usage('vertex'),
  root.createBuffer(
    d.arrayOf(d.u16, lightMarkerGeometry.indices.length),
    lightMarkerGeometry.indices,
  ).$usage('index'),
);
// Initialize small size; position updated each frame in updateLighting()
lightMarker.setTransform(m.mat4.identity(d.mat4x4f()));
lightMarker.scale(0.25, 0.25, 0.25);

const sceneObjects = [
  backWall,
  leftWall,
  rightWall,
  floor,
  ceiling,
  box1,
  box2,
];

const directionalLightUniform = root.createBuffer(DirectionalLight, {
  direction: d.vec3f(0.3, -0.8, -0.5),
  color: d.vec3f(1.0, 0.95, 0.8),
  intensity: 0.0,
}).$usage('uniform');

const ambientLightUniform = root.createBuffer(AmbientLight, {
  color: d.vec3f(0.15, 0.15, 0.2),
  intensity: 0.1,
}).$usage('uniform');

const pointLightUniform = root.createBuffer(PointLight, {
  position: d.vec3f(0, 0, 0),
  color: d.vec3f(1.0, 0.9, 0.7),
  intensity: 2.0,
  range: 8.0,
}).$usage('uniform');

// Create shadow map cube texture
const shadowMapTexture = root['~unstable'].createTexture({
  size: [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, 6],
  format: 'depth32float',
}).$usage('render', 'sampled');

// Create shadow cameras for each cube face
const shadowCameras = [
  // +X face
  createCamera(root, {
    position: d.vec3f(0, 0, 0),
    target: d.vec3f(1, 0, 0),
    up: d.vec3f(0, -1, 0),
    fov: Math.PI / 2,
    aspect: 1,
    near: 0.1,
    far: 50,
  }),
  // -X face
  createCamera(root, {
    position: d.vec3f(0, 0, 0),
    target: d.vec3f(-1, 0, 0),
    up: d.vec3f(0, -1, 0),
    fov: Math.PI / 2,
    aspect: 1,
    near: 0.1,
    far: 50,
  }),
  // +Y face
  createCamera(root, {
    position: d.vec3f(0, 0, 0),
    target: d.vec3f(0, 1, 0),
    up: d.vec3f(0, 0, 1),
    fov: Math.PI / 2,
    aspect: 1,
    near: 0.1,
    far: 50,
  }),
  // -Y face
  createCamera(root, {
    position: d.vec3f(0, 0, 0),
    target: d.vec3f(0, -1, 0),
    up: d.vec3f(0, 0, -1),
    fov: Math.PI / 2,
    aspect: 1,
    near: 0.1,
    far: 50,
  }),
  // +Z face
  createCamera(root, {
    position: d.vec3f(0, 0, 0),
    target: d.vec3f(0, 0, 1),
    up: d.vec3f(0, -1, 0),
    fov: Math.PI / 2,
    aspect: 1,
    near: 0.1,
    far: 50,
  }),
  // -Z face
  createCamera(root, {
    position: d.vec3f(0, 0, 0),
    target: d.vec3f(0, 0, -1),
    up: d.vec3f(0, -1, 0),
    fov: Math.PI / 2,
    aspect: 1,
    near: 0.1,
    far: 50,
  }),
];

const camera = createCamera(root, {
  position: d.vec3f(0, 0, 20),
  target: d.vec3f(0, 0, 0),
  up: d.vec3f(0, 1, 0),
  fov: Math.PI / 4,
  aspect: 1,
  near: 0.1,
  far: 100,
});

// Create bind groups for each object (main rendering)
const bindGroupsLE = sceneObjects.map((obj) =>
  root.createBindGroup(layout, {
    camera: camera.shaderInfo,
    model: obj.modelMatrixBuffer,
    normalMatrix: obj.normalMatrixBuffer,
    light: directionalLightUniform,
    ambientLight: ambientLightUniform,
    pointLight: pointLightUniform,
    shadowMap: shadowMapTexture,
    shadowSampler: comparisonSamplerLE,
  })
);
const bindGroupsGE = sceneObjects.map((obj) =>
  root.createBindGroup(layout, {
    camera: camera.shaderInfo,
    model: obj.modelMatrixBuffer,
    normalMatrix: obj.normalMatrixBuffer,
    light: directionalLightUniform,
    ambientLight: ambientLightUniform,
    pointLight: pointLightUniform,
    shadowMap: shadowMapTexture,
    shadowSampler: comparisonSamplerGE,
  })
);

// Bind groups for light marker (not included in shadow pass)
const lightMarkerBindGroupLE = root.createBindGroup(layout, {
  camera: camera.shaderInfo,
  model: lightMarker.modelMatrixBuffer,
  normalMatrix: lightMarker.normalMatrixBuffer,
  light: directionalLightUniform,
  ambientLight: ambientLightUniform,
  pointLight: pointLightUniform,
  shadowMap: shadowMapTexture,
  shadowSampler: comparisonSamplerLE,
});
const lightMarkerBindGroupGE = root.createBindGroup(layout, {
  camera: camera.shaderInfo,
  model: lightMarker.modelMatrixBuffer,
  normalMatrix: lightMarker.normalMatrixBuffer,
  light: directionalLightUniform,
  ambientLight: ambientLightUniform,
  pointLight: pointLightUniform,
  shadowMap: shadowMapTexture,
  shadowSampler: comparisonSamplerGE,
});

// Create shadow bind groups for each cube face and each object
const shadowBindGroups = shadowCameras.map((shadowCamera) =>
  sceneObjects.map((obj) =>
    root.createBindGroup(shadowLayout, {
      lightCamera: shadowCamera.shaderInfo,
      model: obj.modelMatrixBuffer,
    })
  )
);

// Camera controls
const keys = new Set<string>();
const moveSpeed = 0.1;
const rotationSpeed = 0.02;

document.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
});

document.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
});

function updateCameraControls() {
  // WASD controls for movement
  if (keys.has('w')) camera.moveForward(moveSpeed);
  if (keys.has('s')) camera.moveForward(-moveSpeed);
  if (keys.has('a')) camera.moveRight(-moveSpeed);
  if (keys.has('d')) camera.moveRight(moveSpeed);
  if (keys.has(' ')) camera.moveUp(moveSpeed);
  if (keys.has('shift')) camera.moveUp(-moveSpeed);

  // Arrow key controls for looking around
  if (keys.has('arrowup')) camera.rotatePitch(rotationSpeed);
  if (keys.has('arrowdown')) camera.rotatePitch(-rotationSpeed);
  if (keys.has('arrowleft')) camera.rotateYaw(-rotationSpeed);
  if (keys.has('arrowright')) camera.rotateYaw(rotationSpeed);
}

function updateLighting() {
  const t = (performance.now() - startTime) * 0.001;
  const radius = 2.0;
  const height = 2.0;
  const x = radius * Math.cos(t * 0.7);
  const z = radius * Math.sin(t * 0.9);
  const lightPosition = d.vec3f(x, height, z);
  pointLightUniform.write({
    position: lightPosition,
    color: d.vec3f(1.0, 0.9, 0.7),
    intensity: 2.0,
    range: 50.0,
  });

  // Update debug light marker transform (does not cast shadows)
  lightMarker.setTransform(m.mat4.identity(d.mat4x4f()));
  lightMarker.translate(lightPosition[0], lightPosition[1], lightPosition[2]);
  lightMarker.scale(0.25, 0.25, 0.25);

  updateShadowCameras(lightPosition);
}

function updateShadowCameras(lightPosition: d.v3f) {
  // Update shadow camera positions to match the point light
  for (const shadowCamera of shadowCameras) {
    shadowCamera.position = lightPosition;
    shadowCamera.near = 0.1;
    shadowCamera.far = 50.0;
  }
}

let depthTexture:
  | TgpuTexture<{
    size: [number, number];
    format: 'depth24plus';
  }>
    & Render
  | null = null;

function render() {
  updateCameraControls();
  updateLighting();

  // Shadow cameras are synced in updateLighting()

  if (!depthTexture) {
    depthTexture = root['~unstable'].createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
    }).$usage('render');
  }

  // Render shadow map for each cube face
  shadowCameras.forEach((_, faceIndex) => {
    sceneObjects.forEach((obj, objIndex) => {
      const shadowPass = shadowPipeline
        .withDepthStencilAttachment({
          view: root.unwrap(
            shadowMapTexture.createView('sampled', {
              dimension: '2d-array',
              baseArrayLayer: faceIndex,
              arrayLayerCount: 1,
            }),
          ),
          depthLoadOp: objIndex === 0 ? 'clear' : 'load',
          depthStoreOp: 'store',
          depthClearValue: 1.0,
        });

      shadowPass
        .with(vertexLayout, obj.vertexBuffer)
        .withIndexBuffer(obj.indexBuffer)
        .with(shadowLayout, shadowBindGroups[faceIndex][objIndex])
        .drawIndexed(obj.indexBuffer.dataType.elementCount);
    });
  });

  // Render main scene (pick chosen comparison op once)
  const chosenBG = DEBUG_USE_GE_COMPARE ? bindGroupsGE : bindGroupsLE;

  sceneObjects.forEach((obj, index) => {
    const renderPass = pipeline
      .withColorAttachment({
        view: context.getCurrentTexture().createView(),
        loadOp: index === 0 ? 'clear' : 'load',
        storeOp: 'store',
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
      })
      .withDepthStencilAttachment({
        view: depthTexture as
          & TgpuTexture<{
            size: [number, number];
            format: 'depth24plus';
          }>
          & Render,
        depthLoadOp: index === 0 ? 'clear' : 'load',
        depthStoreOp: 'store',
        depthClearValue: 1.0,
      });

    renderPass
      .with(vertexLayout, obj.vertexBuffer)
      .withIndexBuffer(obj.indexBuffer)
      .with(layout, chosenBG[index])
      .drawIndexed(obj.indexBuffer.dataType.elementCount);
  });

  // Draw light marker (does not cast shadows)
  {
    const renderPass = pipeline
      .withColorAttachment({
        view: context.getCurrentTexture().createView(),
        loadOp: 'load',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      })
      .withDepthStencilAttachment({
        view: depthTexture as
          & TgpuTexture<{
            size: [number, number];
            format: 'depth24plus';
          }>
          & Render,
        depthLoadOp: 'load',
        depthStoreOp: 'store',
        depthClearValue: 1.0,
      });

    renderPass
      .with(vertexLayout, lightMarker.vertexBuffer)
      .withIndexBuffer(lightMarker.indexBuffer)
      .with(
        layout,
        DEBUG_USE_GE_COMPARE ? lightMarkerBindGroupGE : lightMarkerBindGroupLE,
      )
      .drawIndexed(lightMarker.indexBuffer.dataType.elementCount);
  }

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

export function onCleanup() {
  root.destroy();
}

// #endregion
