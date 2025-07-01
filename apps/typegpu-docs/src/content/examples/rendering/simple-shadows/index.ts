import tgpu, {
  type IndexFlag,
  type Render,
  type TgpuBuffer,
  type TgpuTexture,
  type UniformFlag,
  type VertexFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';

// Initialization

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const VertexInfo = d.struct({
  position: d.vec4f,
  normal: d.vec4f,
  color: d.vec4f,
});
type VertexInfo = typeof VertexInfo;

type Object3D = {
  vertexBuffer: TgpuBuffer<d.WgslArray<VertexInfo>> & VertexFlag;
  indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag;
  modelMatrixBuffer: TgpuBuffer<d.Mat4x4f> & UniformFlag;
  parent: Object3D | null;
  children: Object3D[];
};

const DirectionalLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
  intensity: d.f32,
});
type DirectionalLight = typeof DirectionalLight;
const AmbientLight = d.struct({
  color: d.vec3f,
  intensity: d.f32,
});
type AmbientLight = typeof AmbientLight;

const PointLight = d.struct({
  position: d.vec3f,
  color: d.vec3f,
  intensity: d.f32,
  range: d.f32,
});
type PointLight = typeof PointLight;

const CameraInfo = d.struct({
  projectionMatrix: d.mat4x4f,
  viewMatrix: d.mat4x4f,
});
type CameraInfo = typeof CameraInfo;

class PerspectiveCamera {
  shaderInfo: TgpuBuffer<CameraInfo> & UniformFlag;

  private _position: d.v3f;
  private _forward: d.v3f = d.vec3f(0, 0, -1);
  private _right: d.v3f = d.vec3f(1, 0, 0);
  private _up: d.v3f;
  private _fov: number;
  private _aspect: number;
  private _near: number;
  private _far: number;
  private _yaw = 0;
  private _pitch = 0;

  constructor(
    shaderInfo: TgpuBuffer<CameraInfo> & UniformFlag,
    position: d.v3f,
    target: d.v3f,
    up: d.v3f,
    fov: number,
    aspect: number,
    near: number,
    far: number,
  ) {
    this.shaderInfo = shaderInfo;
    this._position = position;
    this._up = up;
    this._fov = fov;
    this._aspect = aspect;
    this._near = near;
    this._far = far;

    // Calculate initial yaw and pitch from position and target
    const direction = [
      target[0] - position[0],
      target[1] - position[1],
      target[2] - position[2],
    ];
    const length = Math.sqrt(
      direction[0] * direction[0] + direction[1] * direction[1] +
        direction[2] * direction[2],
    );
    direction[0] /= length;
    direction[1] /= length;
    direction[2] /= length;

    this._yaw = Math.atan2(direction[0], direction[2]);
    this._pitch = Math.asin(-direction[1]);

    this.updateVectors();
    this.updateProjectionMatrix();
    this.updateViewMatrix();
  }

  get position() {
    return this._position;
  }
  set position(v: d.v3f) {
    this._position = v;
    this.updateViewMatrix();
  }

  get forward() {
    return this._forward;
  }

  get fov() {
    return this._fov;
  }
  set fov(v: number) {
    this._fov = v;
    this.updateProjectionMatrix();
  }

  get aspectRatio() {
    return this._aspect;
  }
  set aspectRatio(v: number) {
    this._aspect = v;
    this.updateProjectionMatrix();
  }

  get near() {
    return this._near;
  }
  set near(v: number) {
    this._near = v;
    this.updateProjectionMatrix();
  }

  get far() {
    return this._far;
  }
  set far(v: number) {
    this._far = v;
    this.updateProjectionMatrix();
  }

  moveForward(distance: number) {
    this._position = d.vec3f(
      this._position[0] + this._forward[0] * distance,
      this._position[1] + this._forward[1] * distance,
      this._position[2] + this._forward[2] * distance,
    );
    this.updateViewMatrix();
  }

  moveRight(distance: number) {
    this._position = d.vec3f(
      this._position[0] + this._right[0] * distance,
      this._position[1] + this._right[1] * distance,
      this._position[2] + this._right[2] * distance,
    );
    this.updateViewMatrix();
  }

  moveUp(distance: number) {
    this._position = d.vec3f(
      this._position[0] + this._up[0] * distance,
      this._position[1] + this._up[1] * distance,
      this._position[2] + this._up[2] * distance,
    );
    this.updateViewMatrix();
  }

  rotateYaw(delta: number) {
    this._yaw += delta;
    this.updateVectors();
    this.updateViewMatrix();
  }

  rotatePitch(delta: number) {
    this._pitch = Math.max(
      -Math.PI / 2 + 0.1,
      Math.min(Math.PI / 2 - 0.1, this._pitch + delta),
    );
    this.updateVectors();
    this.updateViewMatrix();
  }

  private updateVectors() {
    // Calculate forward vector from yaw and pitch
    this._forward = d.vec3f(
      Math.sin(this._yaw) * Math.cos(this._pitch),
      -Math.sin(this._pitch),
      Math.cos(this._yaw) * Math.cos(this._pitch),
    );

    // Calculate right vector (cross product of forward and world up)
    const worldUp = d.vec3f(0, 1, 0);
    this._right = d.vec3f(
      this._forward[2] * worldUp[1] - this._forward[1] * worldUp[2],
      this._forward[0] * worldUp[2] - this._forward[2] * worldUp[0],
      this._forward[1] * worldUp[0] - this._forward[0] * worldUp[1],
    );

    // Normalize right vector
    const rightLength = Math.sqrt(
      this._right[0] * this._right[0] + this._right[1] * this._right[1] +
        this._right[2] * this._right[2],
    );
    this._right = d.vec3f(
      this._right[0] / rightLength,
      this._right[1] / rightLength,
      this._right[2] / rightLength,
    );

    // Calculate up vector (cross product of right and forward)
    this._up = d.vec3f(
      this._right[1] * this._forward[2] - this._right[2] * this._forward[1],
      this._right[2] * this._forward[0] - this._right[0] * this._forward[2],
      this._right[0] * this._forward[1] - this._right[1] * this._forward[0],
    );
  }

  private updateProjectionMatrix() {
    this.shaderInfo.writePartial({
      projectionMatrix: m.mat4.perspective(
        this._fov,
        this._aspect,
        this._near,
        this._far,
        d.mat4x4f(),
      ),
    });
  }

  private updateViewMatrix() {
    const target = d.vec3f(
      this._position[0] + this._forward[0],
      this._position[1] + this._forward[1],
      this._position[2] + this._forward[2],
    );

    this.shaderInfo.writePartial({
      viewMatrix: m.mat4.lookAt(
        this._position,
        target,
        this._up,
        d.mat4x4f(),
      ),
    });
  }
}

function createCamera(
  position: d.v3f,
  target: d.v3f,
  up: d.v3f,
  fov: number,
  aspect: number,
  near: number,
  far: number,
): PerspectiveCamera {
  return new PerspectiveCamera(
    root.createBuffer(CameraInfo).$usage('uniform'),
    position,
    target,
    up,
    fov,
    aspect,
    near,
    far,
  );
}

function createBoxGeometry(color: d.v4f): {
  vertexBuffer: TgpuBuffer<d.WgslArray<VertexInfo>> & VertexFlag;
  indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag;
} {
  // deno-fmt-ignore
  const indices = [
    0, 1, 2,  0, 2, 3,    // Front face
    4, 5, 6,  4, 6, 7,    // Back face
    8, 9, 10, 8, 10, 11,  // Left face
    12, 13, 14, 12, 14, 15, // Right face
    16, 17, 18, 16, 18, 19, // Top face
    20, 21, 22, 20, 22, 23, // Bottom face
  ];

  // Create separate vertices for each face with correct normals
  const vertices: d.Infer<VertexInfo>[] = [
    // Front face (-Z)
    { position: d.vec4f(-1, -1, -1, 1), normal: d.vec4f(0, 0, -1, 0), color },
    { position: d.vec4f(1, -1, -1, 1), normal: d.vec4f(0, 0, -1, 0), color },
    { position: d.vec4f(1, 1, -1, 1), normal: d.vec4f(0, 0, -1, 0), color },
    { position: d.vec4f(-1, 1, -1, 1), normal: d.vec4f(0, 0, -1, 0), color },

    // Back face (+Z)
    { position: d.vec4f(1, -1, 1, 1), normal: d.vec4f(0, 0, 1, 0), color },
    { position: d.vec4f(-1, -1, 1, 1), normal: d.vec4f(0, 0, 1, 0), color },
    { position: d.vec4f(-1, 1, 1, 1), normal: d.vec4f(0, 0, 1, 0), color },
    { position: d.vec4f(1, 1, 1, 1), normal: d.vec4f(0, 0, 1, 0), color },

    // Left face (-X)
    { position: d.vec4f(-1, -1, 1, 1), normal: d.vec4f(-1, 0, 0, 0), color },
    { position: d.vec4f(-1, -1, -1, 1), normal: d.vec4f(-1, 0, 0, 0), color },
    { position: d.vec4f(-1, 1, -1, 1), normal: d.vec4f(-1, 0, 0, 0), color },
    { position: d.vec4f(-1, 1, 1, 1), normal: d.vec4f(-1, 0, 0, 0), color },

    // Right face (+X)
    { position: d.vec4f(1, -1, -1, 1), normal: d.vec4f(1, 0, 0, 0), color },
    { position: d.vec4f(1, -1, 1, 1), normal: d.vec4f(1, 0, 0, 0), color },
    { position: d.vec4f(1, 1, 1, 1), normal: d.vec4f(1, 0, 0, 0), color },
    { position: d.vec4f(1, 1, -1, 1), normal: d.vec4f(1, 0, 0, 0), color },

    // Top face (+Y)
    { position: d.vec4f(-1, 1, -1, 1), normal: d.vec4f(0, 1, 0, 0), color },
    { position: d.vec4f(1, 1, -1, 1), normal: d.vec4f(0, 1, 0, 0), color },
    { position: d.vec4f(1, 1, 1, 1), normal: d.vec4f(0, 1, 0, 0), color },
    { position: d.vec4f(-1, 1, 1, 1), normal: d.vec4f(0, 1, 0, 0), color },

    // Bottom face (-Y)
    { position: d.vec4f(-1, -1, 1, 1), normal: d.vec4f(0, -1, 0, 0), color },
    { position: d.vec4f(1, -1, 1, 1), normal: d.vec4f(0, -1, 0, 0), color },
    { position: d.vec4f(1, -1, -1, 1), normal: d.vec4f(0, -1, 0, 0), color },
    { position: d.vec4f(-1, -1, -1, 1), normal: d.vec4f(0, -1, 0, 0), color },
  ];

  const vertexBuffer = root
    .createBuffer(d.arrayOf(VertexInfo, vertices.length), vertices)
    .$usage('vertex');

  const indexBuffer = root
    .createBuffer(d.arrayOf(d.u16, indices.length), indices)
    .$usage('index');

  return { vertexBuffer, indexBuffer };
}

function createPlaneGeometry(color: d.v4f, normal: d.v3f): {
  vertexBuffer: TgpuBuffer<d.WgslArray<VertexInfo>> & VertexFlag;
  indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag;
} {
  const indices = [0, 1, 2, 0, 2, 3];

  const vertices: d.Infer<VertexInfo>[] = [
    {
      position: d.vec4f(-1, -1, 0, 1),
      normal: d.vec4f(normal[0], normal[1], normal[2], 0),
      color,
    },
    {
      position: d.vec4f(1, -1, 0, 1),
      normal: d.vec4f(normal[0], normal[1], normal[2], 0),
      color,
    },
    {
      position: d.vec4f(1, 1, 0, 1),
      normal: d.vec4f(normal[0], normal[1], normal[2], 0),
      color,
    },
    {
      position: d.vec4f(-1, 1, 0, 1),
      normal: d.vec4f(normal[0], normal[1], normal[2], 0),
      color,
    },
  ];

  const vertexBuffer = root
    .createBuffer(d.arrayOf(VertexInfo, vertices.length), vertices)
    .$usage('vertex');

  const indexBuffer = root
    .createBuffer(d.arrayOf(d.u16, indices.length), indices)
    .$usage('index');

  return { vertexBuffer, indexBuffer };
}

function createObject3D(
  vertexBuffer: TgpuBuffer<d.WgslArray<VertexInfo>> & VertexFlag,
  indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag,
  transform: d.m4x4f = m.mat4.identity(d.mat4x4f()),
): Object3D {
  return {
    vertexBuffer,
    indexBuffer,
    modelMatrixBuffer: root.createBuffer(d.mat4x4f, transform).$usage(
      'uniform',
    ),
    parent: null,
    children: [],
  };
}

const layout = tgpu.bindGroupLayout({
  camera: { uniform: CameraInfo },
  model: { uniform: d.mat4x4f },
  light: { uniform: DirectionalLight },
  ambientLight: { uniform: AmbientLight },
  pointLight: { uniform: PointLight },
});

const vertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(VertexInfo, n));
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

  // For uniform scaling and rotation/translation, we can use the upper 3x3 part
  // of the model matrix. For non-uniform scaling, we'd need the inverse transpose.
  const normalMatrix = d.mat3x3f(
    modelMatrix.columns[0].xyz,
    modelMatrix.columns[1].xyz,
    modelMatrix.columns[2].xyz,
  );

  const transformedNormal = std.normalize(std.mul(normalMatrix, normal.xyz));

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
  const lightToVertex = std.sub(pointLight.position, worldPos.xyz);
  const lightDistance = std.length(lightToVertex);
  const pointLightDir = std.normalize(lightToVertex);

  // Attenuation - linear + quadratic falloff
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

  // Point light diffuse
  const pointDiffuse = std.max(std.dot(normal.xyz, pointLightDir), 0.0);
  const pointDiffuseColor = std.mul(color.xyz, pointLight.color);
  const pointDiffuseLight = std.mul(
    std.mul(pointDiffuseColor, pointDiffuse),
    std.mul(pointLight.intensity, attenuation),
  );

  // Point light specular
  const pointSpecular = std.pow(
    std.max(std.dot(normal.xyz, pointLightDir), 0.0),
    shininess,
  );
  const pointSpecularColor = std.mul(
    std.mul(pointLight.color, pointSpecular),
    std.mul(pointLight.intensity * 0.1, attenuation),
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

const pipeline = root['~unstable']
  .withVertex(vertex, vertexLayout.attrib)
  .withFragment(fragment, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .createPipeline();

// Create Cornell Box scene
const boxSize = 5;

// Back wall (light gray)
const backWallGeometry = createPlaneGeometry(
  d.vec4f(0.75, 0.75, 0.75, 1.0),
  d.vec3f(0, 0, 1),
);
const backWall = createObject3D(
  backWallGeometry.vertexBuffer,
  backWallGeometry.indexBuffer,
  m.mat4.multiply(
    m.mat4.translation(d.vec3f(0, 0, -boxSize)),
    m.mat4.scaling(d.vec3f(boxSize, boxSize, 1)),
    d.mat4x4f(),
  ),
);

// Left wall (red)
const leftWallGeometry = createPlaneGeometry(
  d.vec4f(0.7, 0.2, 0.2, 1.0),
  d.vec3f(1, 0, 0),
);
const leftWall = createObject3D(
  leftWallGeometry.vertexBuffer,
  leftWallGeometry.indexBuffer,
  m.mat4.multiply(
    m.mat4.multiply(
      m.mat4.translation(d.vec3f(-boxSize, 0, 0)),
      m.mat4.rotationY(Math.PI / 2),
      d.mat4x4f(),
    ),
    m.mat4.scaling(d.vec3f(boxSize, boxSize, 1)),
    d.mat4x4f(),
  ),
);

// Right wall (green)
const rightWallGeometry = createPlaneGeometry(
  d.vec4f(0.2, 0.7, 0.2, 1.0),
  d.vec3f(-1, 0, 0),
);
const rightWall = createObject3D(
  rightWallGeometry.vertexBuffer,
  rightWallGeometry.indexBuffer,
  m.mat4.multiply(
    m.mat4.multiply(
      m.mat4.translation(d.vec3f(boxSize, 0, 0)),
      m.mat4.rotationY(-Math.PI / 2),
      d.mat4x4f(),
    ),
    m.mat4.scaling(d.vec3f(boxSize, boxSize, 1)),
    d.mat4x4f(),
  ),
);

// Floor (light gray)
const floorGeometry = createPlaneGeometry(
  d.vec4f(0.8, 0.8, 0.8, 1.0),
  d.vec3f(0, 1, 0),
);
const floor = createObject3D(
  floorGeometry.vertexBuffer,
  floorGeometry.indexBuffer,
  m.mat4.multiply(
    m.mat4.multiply(
      m.mat4.translation(d.vec3f(0, -boxSize, 0)),
      m.mat4.rotationX(-Math.PI / 2),
      d.mat4x4f(),
    ),
    m.mat4.scaling(d.vec3f(boxSize, boxSize, 1)),
    d.mat4x4f(),
  ),
);

// Ceiling (light gray)
const ceilingGeometry = createPlaneGeometry(
  d.vec4f(0.8, 0.8, 0.8, 1.0),
  d.vec3f(0, -1, 0),
);
const ceiling = createObject3D(
  ceilingGeometry.vertexBuffer,
  ceilingGeometry.indexBuffer,
  m.mat4.multiply(
    m.mat4.multiply(
      m.mat4.translation(d.vec3f(0, boxSize, 0)),
      m.mat4.rotationX(Math.PI / 2),
      d.mat4x4f(),
    ),
    m.mat4.scaling(d.vec3f(boxSize, boxSize, 1)),
    d.mat4x4f(),
  ),
);

// Two boxes in the scene with better colors and positioning
const box1Geometry = createBoxGeometry(d.vec4f(0.7, 0.7, 0.7, 1.0)); // Neutral gray
const box1 = createObject3D(
  box1Geometry.vertexBuffer,
  box1Geometry.indexBuffer,
  m.mat4.multiply(
    m.mat4.multiply(
      m.mat4.translation(d.vec3f(-2, -2.5, -1)),
      m.mat4.rotationY(Math.PI / 6),
      d.mat4x4f(),
    ),
    m.mat4.scaling(d.vec3f(1.2, 2.5, 1.2)),
    d.mat4x4f(),
  ),
);

const box2Geometry = createBoxGeometry(d.vec4f(0.65, 0.65, 0.65, 1.0)); // Slightly darker gray
const box2 = createObject3D(
  box2Geometry.vertexBuffer,
  box2Geometry.indexBuffer,
  m.mat4.multiply(
    m.mat4.multiply(
      m.mat4.translation(d.vec3f(2, -3.5, 1.5)),
      m.mat4.rotationY(-Math.PI / 8),
      d.mat4x4f(),
    ),
    m.mat4.scaling(d.vec3f(1.5, 1.5, 1.5)),
    d.mat4x4f(),
  ),
);

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
  intensity: 0.1,
}).$usage('uniform');

const ambientLightUniform = root.createBuffer(AmbientLight, {
  color: d.vec3f(0.15, 0.15, 0.2),
  intensity: 0.1,
}).$usage('uniform');

const pointLightUniform = root.createBuffer(PointLight, {
  position: d.vec3f(0, 3, 0),
  color: d.vec3f(1.0, 0.9, 0.7),
  intensity: 2.0,
  range: 8.0,
}).$usage('uniform');

const camera = createCamera(
  d.vec3f(0, 0, 4),
  d.vec3f(0, 0, 0),
  d.vec3f(0, 1, 0),
  Math.PI / 4,
  1,
  0.1,
  100,
);

// Create bind groups for each object
const bindGroups = sceneObjects.map((obj) =>
  root.createBindGroup(layout, {
    camera: camera.shaderInfo,
    model: obj.modelMatrixBuffer,
    light: directionalLightUniform,
    ambientLight: ambientLightUniform,
    pointLight: pointLightUniform,
  })
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
  // Animate the point light in a subtle circular motion
  const time = Date.now() * 0.001;
  const lightX = Math.sin(time * 0.5) * 1.5;
  const lightZ = Math.cos(time * 0.5) * 1.5;

  pointLightUniform.write({
    position: d.vec3f(lightX, 3, lightZ),
    color: d.vec3f(1.0, 0.9, 0.7),
    intensity: 2.0,
    range: 8.0,
  });
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

  if (!depthTexture) {
    depthTexture = root['~unstable'].createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
    }).$usage('render');
  }

  // Render each object
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
      .with(layout, bindGroups[index])
      .drawIndexed(obj.indexBuffer.dataType.elementCount);
  });

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
