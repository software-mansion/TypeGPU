import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';

const root = await tgpu.init();

/**
 * Creates an icosphere with the specified level of subdivision
 * @param subdivisions Number of recursive subdivisions to apply
 * @returns Array of vertices defining the icosphere triangles
 */
function createIcosphere(subdivisions: number): d.Infer<typeof Vertex>[] {
  // Golden ratio for icosahedron construction
  const goldenRatio = (1 + Math.sqrt(5)) / 2;

  // Define initial icosahedron vertices
  const initialVertices: d.v4f[] = [
    // Top group
    d.vec4f(-1, goldenRatio, 0, 1),
    d.vec4f(1, goldenRatio, 0, 1),
    d.vec4f(-1, -goldenRatio, 0, 1),
    d.vec4f(1, -goldenRatio, 0, 1),

    // Middle group
    d.vec4f(0, -1, goldenRatio, 1),
    d.vec4f(0, 1, goldenRatio, 1),
    d.vec4f(0, -1, -goldenRatio, 1),
    d.vec4f(0, 1, -goldenRatio, 1),

    // Bottom group
    d.vec4f(goldenRatio, 0, -1, 1),
    d.vec4f(goldenRatio, 0, 1, 1),
    d.vec4f(-goldenRatio, 0, -1, 1),
    d.vec4f(-goldenRatio, 0, 1, 1),
  ].map((v) => d.vec4f(std.normalize(v).xyz, 1));

  // Define the 20 triangular faces of the icosahedron using vertex indices
  const faces: [number, number, number][] = [
    // 5 faces around vertex 0
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    // 5 adjacent faces
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    // 5 faces around vertex 3
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    // 5 adjacent faces
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  // Container for the final vertex list
  const vertices: d.Infer<typeof Vertex>[] = [];

  // Subdivide each face recursively
  for (const [i1, i2, i3] of faces) {
    subdivideTriangle(
      initialVertices[i1],
      initialVertices[i2],
      initialVertices[i3],
      subdivisions,
      vertices,
    );
  }

  return vertices;
}

/**
 * Recursively subdivides a triangle until desired depth is reached
 */
function subdivideTriangle(
  v1: d.v4f,
  v2: d.v4f,
  v3: d.v4f,
  depth: number,
  vertices: ReturnType<typeof Vertex>[],
): void {
  if (depth === 0) {
    // Base case: add the triangle vertices
    vertices.push(createVertex(v1));
    vertices.push(createVertex(v2));
    vertices.push(createVertex(v3));
    return;
  }

  // Calculate midpoints of each edge and project them onto the unit sphere
  const v12 = d.vec4f(std.normalize(calculateMidpoint(v1, v2).xyz), 1);
  const v23 = d.vec4f(std.normalize(calculateMidpoint(v2, v3).xyz), 1);
  const v31 = d.vec4f(std.normalize(calculateMidpoint(v3, v1).xyz), 1);

  // Recursively subdivide the four resulting triangles
  subdivideTriangle(v1, v12, v31, depth - 1, vertices);
  subdivideTriangle(v2, v23, v12, depth - 1, vertices);
  subdivideTriangle(v3, v31, v23, depth - 1, vertices);
  subdivideTriangle(v12, v23, v31, depth - 1, vertices);
}

/**
 * Calculates the midpoint between two vertices
 */
function calculateMidpoint(v1: d.v4f, v2: d.v4f): d.v4f {
  return d.vec4f((v1.x + v2.x) / 2, (v1.y + v2.y) / 2, (v1.z + v2.z) / 2, 1);
}

/**
 * Creates a vertex with position, color, and normal
 * For a unit sphere, the normal equals the normalized position
 */
function createVertex(position: d.v4f): ReturnType<typeof Vertex> {
  const color = d.vec4f(0.8, 1, 1, 1); // White color
  const normal = std.normalize(position);

  return Vertex({
    position,
    color,
    normal,
  });
}

const cubemapUrls = [
  'cubemapTest/posx.jpg', // right
  'cubemapTest/negx.jpg', // left
  'cubemapTest/posy.jpg', // top
  'cubemapTest/negy.jpg', // bottom
  'cubemapTest/posz.jpg', // front
  'cubemapTest/negz.jpg', // back
];

async function loadCubemap(device: GPUDevice, urls: string[]) {
  const size = 512;

  const texture = root['~unstable']
    .createTexture({
      dimension: '2d',
      size: [size, size, 6],
      format: 'rgba8unorm',
    })
    .$usage('sampled', 'render', 'storage');

  // Load each face
  for (let i = 0; i < 6; i++) {
    const response = await fetch(urls[i]);
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);

    device.queue.copyExternalImageToTexture(
      { source: imageBitmap },
      { texture: root.unwrap(texture), mipLevel: 0, origin: [0, 0, i] },
      [size, size],
    );
  }

  return texture;
}

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const Camera = d.struct({
  view: d.mat4x4f,
  projection: d.mat4x4f,
  position: d.vec4f,
});

const Vertex = d.struct({
  position: d.vec4f,
  color: d.vec4f,
  normal: d.vec4f,
});

const DirectionalLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
  intensity: d.f32,
});

const Material = d.struct({
  ambient: d.vec3f,
  diffuse: d.vec3f,
  specular: d.vec3f,
  shininess: d.f32,
  reflectivity: d.f32,
});

const subdivisions = 6;
const vertices = createIcosphere(subdivisions);

const vertexBuffer = root
  .createBuffer(d.arrayOf(Vertex, vertices.length), vertices)
  .$usage('vertex');

const cameraPosition = d.vec4f(0, 0, 5, 1); // Camera position for specular lighting
const cameraInitialPos = d.vec3f(0, 0, 5);
const cameraBuffer = root
  .createBuffer(Camera, {
    view: m.mat4.lookAt(cameraInitialPos, [0, 0, 0], [0, 1, 0], d.mat4x4f()),
    projection: m.mat4.perspective(
      Math.PI / 4,
      canvas.width / canvas.height,
      0.1,
      100,
      d.mat4x4f(),
    ),
    position: cameraPosition,
  })
  .$usage('uniform');

const lightBuffer = root
  .createBuffer(DirectionalLight, {
    direction: d.vec3f(0, 0, 1),
    color: d.vec3f(1, 1, 1),
    intensity: 1,
  })
  .$usage('uniform');

const materialBuffer = root
  .createBuffer(Material, {
    ambient: d.vec3f(0.2, 0.2, 0.2),
    diffuse: d.vec3f(0.7, 0.7, 0.7),
    specular: d.vec3f(1.0, 1.0, 1.0),
    shininess: 21,
    reflectivity: 0.6,
  })
  .$usage('uniform');

const cubemapTexture = await loadCubemap(root.device, cubemapUrls);

const rederLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  light: { uniform: DirectionalLight },
  material: { uniform: Material },
  cubemap: {
    texture: 'float',
    viewDimension: 'cube',
  },
  sampler: {
    sampler: 'filtering',
  },
});
const { camera, light, material } = rederLayout.bound;

const renderBindGroup = root.createBindGroup(rederLayout, {
  camera: cameraBuffer,
  light: lightBuffer,
  material: materialBuffer,
  cubemap: cubemapTexture,
  sampler: tgpu['~unstable'].sampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
  }),
});

const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(Vertex, n));

const vertexFn = tgpu['~unstable']
  .vertexFn({
    in: {
      position: d.vec4f,
      color: d.vec4f,
      normal: d.vec4f,
    },
    out: {
      pos: d.builtin.position,
      color: d.vec4f,
      normal: d.vec4f,
      worldPos: d.vec4f,
    },
  })
  .does((input) => {
    const worldPos = input.position;
    const pos = std.mul(camera.value.view, input.position);
    const normal = std.mul(camera.value.view, input.normal);
    return {
      pos: std.mul(camera.value.projection, pos),
      color: input.color,
      normal: normal,
      worldPos: worldPos,
    };
  });

const fragmentFn = tgpu['~unstable']
  .fragmentFn({
    in: {
      color: d.vec4f,
      normal: d.vec4f,
      worldPos: d.vec4f,
    },
    out: d.vec4f,
  })
  .does((input) => {
    // Normalize vectors
    const normal = std.normalize(input.normal);
    const lightDir = std.normalize(light.value.direction);

    // Ambient component
    const ambient = std.mul(material.value.ambient, light.value.color);

    // Diffuse component (Lambert's cosine law)
    const diffuseFactor = std.max(std.dot(normal.xyz, lightDir), 0.0);
    const diffuse = std.mul(
      diffuseFactor * light.value.intensity,
      std.mul(material.value.diffuse, light.value.color),
    );

    // Specular component (Phong reflection model)
    // Calculate reflection vector
    const viewDir = std.normalize(
      std.sub(camera.value.position.xyz, input.worldPos.xyz),
    );
    const reflectDir = std.normalize(
      std.reflect(d.vec3f(-lightDir.x, -lightDir.y, -lightDir.z), normal.xyz),
    );

    const specularFactor = std.pow(
      std.max(std.dot(viewDir, reflectDir), 0.0),
      material.value.shininess,
    );
    const specular = std.mul(
      specularFactor * light.value.intensity,
      std.mul(material.value.specular, light.value.color),
    );

    // Combine lighting components for the base color
    const baseColor = std.add(std.add(ambient, diffuse), specular);
    const baseResult = std.mul(baseColor, input.color.xyz);

    // Calculate reflection vector for cubemap sampling
    const reflectionVector = std.reflect(
      std.mul(-1, viewDir),
      std.normalize(input.normal).xyz,
    );

    // @ts-ignore
    const cubemapColor = std.sampleTexture(cubemap, sampler, reflectionVector);

    // Mix the base color with the cubemap reflection based on the material's reflectivity
    const finalColor = std.mix(
      d.vec3f(baseResult),
      d.vec3f(reflectionVector.xyz),
      material.value.reflectivity,
    );

    return d.vec4f(finalColor, 1.0);
  });

const pipeline = root['~unstable']
  .withVertex(vertexFn, vertexLayout.attrib)
  .withFragment(fragmentFn, { format: presentationFormat })
  .withPrimitive({
    cullMode: 'back',
  })
  .createPipeline();

function render() {
  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(vertexLayout, vertexBuffer)
    .with(rederLayout, renderBindGroup)
    .draw(vertices.length);

  root['~unstable'].flush();
}

function loop() {
  render();
  requestAnimationFrame(loop);
}

loop();

// #region Example controls and cleanup

// Variables for mouse interaction.
let isDragging = false;
let prevX = 0;
let prevY = 0;
let orbitRadius = std.length(cameraInitialPos);

// Yaw and pitch angles facing the origin.
let orbitYaw = Math.atan2(cameraInitialPos.x, cameraInitialPos.z);
let orbitPitch = Math.asin(cameraInitialPos.y / orbitRadius);

function updateCameraOrbit(dx: number, dy: number) {
  const orbitSensitivity = 0.005;
  orbitYaw += -dx * orbitSensitivity;
  orbitPitch += dy * orbitSensitivity;
  // if we didn't limit pitch, it would lead to flipping the camera which is disorienting.
  const maxPitch = Math.PI / 2 - 0.01;
  if (orbitPitch > maxPitch) orbitPitch = maxPitch;
  if (orbitPitch < -maxPitch) orbitPitch = -maxPitch;
  // basically converting spherical coordinates to cartesian.
  // like sampling points on a unit sphere and then scaling them by the radius.
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);

  const newView = m.mat4.lookAt(
    newCameraPos,
    d.vec3f(0, 0, 0),
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.writePartial({ view: newView, position: newCameraPos });
}

canvas.addEventListener('wheel', (event: WheelEvent) => {
  event.preventDefault();
  const zoomSensitivity = 0.05;
  orbitRadius = Math.max(1, orbitRadius + event.deltaY * zoomSensitivity);
  const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
  const newCamY = orbitRadius * Math.sin(orbitPitch);
  const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
  const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);
  const newView = m.mat4.lookAt(
    newCameraPos,
    d.vec3f(0, 0, 0),
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
  cameraBuffer.writePartial({ view: newView });
});

canvas.addEventListener('mousedown', (event) => {
  isDragging = true;
  prevX = event.clientX;
  prevY = event.clientY;
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

canvas.addEventListener('mousemove', (event) => {
  const dx = event.clientX - prevX;
  const dy = event.clientY - prevY;
  prevX = event.clientX;
  prevY = event.clientY;

  if (isDragging) {
    updateCameraOrbit(dx, dy);
  }
});

export function onCleanup() {
  cubemapTexture.destroy();
  root.destroy();
}

// #endregion
