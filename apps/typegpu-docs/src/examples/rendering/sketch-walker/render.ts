import { common, d, std, tgpu, type TgpuRoot } from 'typegpu';
import { perlin2d } from '@typegpu/noise';
import {
  buildShapes,
  MeshVertex,
  TREE_BOUNDS,
  TREE_FOLIAGE,
  TREE_TRUNK,
  type ShapeName,
} from './geometry.ts';
import {
  blendedViews,
  CAPTURE_RADIUS,
  frameBasis,
  frameLayer,
  impostorLayout,
  octDecode,
  sampleView,
  toFrameSpace,
  treeLayout,
} from './impostor.ts';
import { BIRD_COUNT, birdLayout, type Birds } from './birds.ts';
import { PARTICLE_COUNT, PUFF, type Particles } from './particles.ts';
import { Material, type Part } from './rig.ts';
import { MAX_PULSES, PULSE_LIFE, PULSE_SPEED, REVEAL_TIME } from './sonar.ts';
import { LEVELS, type Terrain } from './terrain.ts';
import type { Trees } from './trees.ts';

// #region Schemas

/** Mirrors the CPU-side `Part`: a `math` quaternion maps straight onto a `vec4f`. */
export const PartData = d.struct({
  rotation: d.vec4f,
  position: d.vec3f,
  material: d.u32,
  scale: d.vec3f,
});

export const Frame = d.struct({
  viewProj: d.mat4x4f,
  view: d.mat4x4f,
  invViewProj: d.mat4x4f,
  lightViewProj: d.mat4x4f,
  cameraPosition: d.vec3f,
  time: d.f32,
  sunDirection: d.vec3f,
  sketchStep: d.f32,
  walker: d.vec3f,
  wobble: d.f32,
  resolution: d.vec2f,
  hatching: d.f32,
  pixelRatio: d.f32,
  // Sonar pulses: xyz = where it started, w = when (in seconds of `time`).
  pulses: d.arrayOf(d.vec4f, MAX_PULSES),
  // The goal's pillar of light: xyz = its base, w = brightness.
  pillar: d.vec4f,
  // The glow at the antenna tip when a pulse goes out: xyz = position, w = brightness.
  flash: d.vec4f,
});

const meshLayout = tgpu.vertexLayout(d.arrayOf(MeshVertex));

const shadowLayout = tgpu.bindGroupLayout({
  shadowMap: { texture: d.textureDepth2d() },
  shadowSampler: { sampler: 'comparison' },
});

const gBufferLayout = tgpu.bindGroupLayout({
  albedo: { texture: d.texture2d(d.f32) },
  normalDepth: { texture: d.texture2d(d.f32) },
  ids: { texture: d.texture2d(d.f32) },
  color: { texture: d.texture2d(d.f32) },
  linear: { sampler: 'filtering' },
});

// #endregion

// #region Palette

const TERRAIN_MATERIAL = 5;
const CONTOUR_INTERVAL = 1.25;
const FAR = 4000;
const SHADOW_MAP_SIZE = 3072;
// Half-size of the area the shadow map covers. Wide enough that trees switch between meshes
// and impostors well inside it.
const SHADOW_EXTENT = 85;
const FOG_START = 220;
const FOG_END = 720;

const PAPER = d.vec3f(0.95, 0.93, 0.88);
const INK = d.vec3f(0.12, 0.11, 0.13);

const palette = tgpu.const(d.arrayOf(d.vec3f, 5), [
  PAPER, // paper
  d.vec3f(0.86, 0.85, 0.82), // light
  d.vec3f(0.64, 0.63, 0.62), // mid
  d.vec3f(0.36, 0.35, 0.37), // dark
  d.vec3f(0.98, 0.26, 0.12), // accent - the only colour in the scene
]);

// The colours everything really has. The sketch hides them, and a sonar pulse brings them
// back for a moment.
const robotColors = tgpu.const(d.arrayOf(d.vec3f, 5), [
  d.vec3f(0.95, 0.93, 0.88),
  d.vec3f(0.95, 0.68, 0.2), // light panels: signal yellow
  d.vec3f(0.26, 0.42, 0.62), // mid panels: steel blue
  d.vec3f(0.17, 0.17, 0.2), // joints: graphite
  d.vec3f(0.98, 0.26, 0.12),
]);
const GRASS = d.vec3f(0.42, 0.62, 0.27);
const ROCK = d.vec3f(0.56, 0.52, 0.47);
const FOLIAGE = d.vec3f(0.16, 0.44, 0.26);
const BARK = d.vec3f(0.44, 0.29, 0.17);
const FEATHERS = d.vec3f(0.08, 0.08, 0.1);
const DUST = d.vec3f(0.74, 0.64, 0.48);
const GRIT = d.vec3f(0.36, 0.31, 0.25);
const FLASH_COLOR = d.vec3f(1, 0.45, 0.2);
const PILLAR_COLOR = d.vec3f(1, 0.82, 0.4);

// #endregion

const GBuffer = d.struct({
  albedo: d.vec4f,
  normalDepth: d.vec4f,
  ids: d.vec4f,
  color: d.vec4f,
});

const gBufferTargets = {
  albedo: { format: 'rgba8unorm' },
  normalDepth: { format: 'rgba16float' },
  ids: { format: 'r8unorm' },
  color: { format: 'rgba8unorm' },
} as const;

const depthStencil = {
  format: 'depth24plus',
  depthWriteEnabled: true,
  depthCompare: 'less',
} as const;

const shadowDepthStencil = {
  format: 'depth32float',
  depthWriteEnabled: true,
  depthCompare: 'less',
  depthBias: 2,
  depthBiasSlopeScale: 2.5,
} as const;

const rotate = (q: d.v4f, v: d.v3f) => {
  'use gpu';
  const t = std.cross(q.xyz, v) * 2;
  return v + t * q.w + std.cross(q.xyz, t);
};

const rotateY = (v: d.v3f, angle: number) => {
  'use gpu';
  const c = std.cos(angle);
  const s = std.sin(angle);
  return d.vec3f(v.x * c + v.z * s, v.y, v.z * c - v.x * s);
};

export function createRenderer(
  root: TgpuRoot,
  context: GPUCanvasContext,
  canvas: HTMLCanvasElement,
  terrain: Terrain,
  trees: Trees,
  birds: Birds,
  particles: Particles,
  partsByShape: Record<ShapeName, Part[]>,
) {
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  // #region Resources

  const frame = root.createUniform(Frame);

  const { vertices, ranges } = buildShapes();
  const meshBuffer = root
    .createBuffer(d.arrayOf(MeshVertex, vertices.length), vertices)
    .$usage('vertex');

  // Parts are stored grouped by shape, so each shape is one instanced draw over a slice.
  const shapeNames = Object.keys(partsByShape) as ShapeName[];
  const allParts = shapeNames.flatMap((shape) => partsByShape[shape]);
  const draws = shapeNames.map((shape, i) => ({
    ...ranges[shape],
    instanceCount: partsByShape[shape].length,
    firstInstance: shapeNames.slice(0, i).reduce((n, s) => n + partsByShape[s].length, 0),
  }));
  const parts = root.createReadonly(d.arrayOf(PartData, allParts.length));

  const shadowMap = root
    .createTexture({ size: [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE], format: 'depth32float' })
    .$usage('render', 'sampled');
  const shadowBindGroup = root.createBindGroup(shadowLayout, {
    shadowMap: shadowMap.createView(d.textureDepth2d()),
    shadowSampler: root.createComparisonSampler({
      compare: 'less-equal',
      magFilter: 'linear',
      minFilter: 'linear',
    }),
  });

  const linearSampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
  });

  const impostorBindGroup = root.createBindGroup(impostorLayout, {
    colorAtlas: trees.atlas.colorAtlas,
    depthAtlas: trees.atlas.depthAtlas,
    atlasSampler: linearSampler,
  });

  function createGBuffer() {
    const size = [canvas.width, canvas.height] as const;
    const albedo = root.createTexture({ size, format: 'rgba8unorm' }).$usage('render', 'sampled');
    const normalDepth = root
      .createTexture({ size, format: 'rgba16float' })
      .$usage('render', 'sampled');
    const ids = root.createTexture({ size, format: 'r8unorm' }).$usage('render', 'sampled');
    const color = root.createTexture({ size, format: 'rgba8unorm' }).$usage('render', 'sampled');
    const depth = root.createTexture({ size, format: 'depth24plus' }).$usage('render');
    return {
      albedo,
      normalDepth,
      ids,
      color,
      depth,
      bindGroup: root.createBindGroup(gBufferLayout, {
        albedo: albedo.createView(d.texture2d(d.f32)),
        normalDepth: normalDepth.createView(d.texture2d(d.f32)),
        ids: ids.createView(d.texture2d(d.f32)),
        color: color.createView(d.texture2d(d.f32)),
        linear: linearSampler,
      }),
      destroy() {
        albedo.destroy();
        normalDepth.destroy();
        ids.destroy();
        color.destroy();
        depth.destroy();
      },
    };
  }
  let gBuffer = createGBuffer();

  // #endregion

  // #region Shading shared by everything in the scene

  /** 0 in shadow, 1 in light - with only a sliver of transition in between. */
  const lightAmount = (worldPos: d.v3f, normal: d.v3f) => {
    'use gpu';
    const facing = std.smoothstep(0, 0.08, std.dot(normal, frame.$.sunDirection));

    const lightPos = frame.$.lightViewProj * d.vec4f(worldPos + normal * 0.12, 1);
    const ndc = lightPos.xyz / lightPos.w;
    const uv = d.vec2f(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    const texel = 1 / SHADOW_MAP_SIZE;
    let visible = d.f32(0);
    for (const x of tgpu.unroll([-1, 0, 1])) {
      for (const y of tgpu.unroll([-1, 0, 1])) {
        visible += std.textureSampleCompare(
          shadowLayout.$.shadowMap,
          shadowLayout.$.shadowSampler,
          uv + d.vec2f(x, y) * texel * 1.5,
          ndc.z - 0.0015,
        );
      }
    }
    // Shadows fade out towards the edge of the shadow map instead of ending abruptly.
    const edge = std.max(std.abs(ndc.x), std.abs(ndc.y));
    const coverage = 1 - std.smoothstep(0.8, 0.97, edge);
    const shadow = std.mix(1, std.smoothstep(0.4, 0.6, visible / 9), coverage);
    return facing * shadow;
  };

  /** Everything the sketch pass needs to know about a visible surface. */
  const surface = (worldPos: d.v3f, normal: d.v3f, material: number, id: number, hue: d.v3f) => {
    'use gpu';
    let tone = d.vec3f(PAPER);
    let light = lightAmount(worldPos, normal);
    if (material === TERRAIN_MATERIAL) {
      // Steep slopes read as bare rock, a shade darker than the paper.
      tone = std.mix(PAPER, palette.$[1], std.smoothstep(0.35, 0.55, 1 - normal.y));
    } else {
      tone = d.vec3f(palette.$[material]);
    }
    if (material === Material.accent) {
      light = 1; // emissive
    }
    const viewNormal = (frame.$.view * d.vec4f(normal, 0)).xyz;
    return GBuffer({
      albedo: d.vec4f(tone, light),
      normalDepth: d.vec4f(viewNormal, std.distance(worldPos, frame.$.cameraPosition)),
      ids: d.vec4f(d.f32(id) / 255, 0, 0, 1),
      color: d.vec4f(hue, 1),
    });
  };

  const Varyings = {
    worldPos: d.vec3f,
    normal: d.vec3f,
    material: d.interpolate('flat', d.u32),
    id: d.interpolate('flat', d.u32),
    hue: d.interpolate('flat', d.vec3f),
  };

  const meshFragment = tgpu.fragmentFn({
    in: Varyings,
    out: { albedo: d.vec4f, normalDepth: d.vec4f, ids: d.vec4f, color: d.vec4f },
  })((input) => {
    'use gpu';
    const g = surface(
      input.worldPos,
      std.normalize(input.normal),
      input.material,
      input.id,
      input.hue,
    );
    return { albedo: g.albedo, normalDepth: g.normalDepth, ids: g.ids, color: g.color };
  });

  // #endregion

  // #region Terrain

  const terrainVertex = tgpu.vertexFn({
    in: { index: d.builtin.vertexIndex, level: d.builtin.instanceIndex },
    out: {
      pos: d.builtin.position,
      worldPos: d.vec3f,
      normal: d.vec3f,
      level: d.interpolate('flat', d.u32),
    },
  })((input) => {
    'use gpu';
    const point = terrain.ringVertex(input.index, input.level);
    return {
      pos: frame.$.viewProj * d.vec4f(point.position, 1),
      worldPos: d.vec3f(point.position),
      normal: d.vec3f(point.normal),
      level: input.level,
    };
  });

  const terrainFragment = tgpu.fragmentFn({
    in: { worldPos: d.vec3f, normal: d.vec3f, level: d.interpolate('flat', d.u32) },
    out: { albedo: d.vec4f, normalDepth: d.vec4f, ids: d.vec4f, color: d.vec4f },
  })((input) => {
    'use gpu';
    if (terrain.coveredByInnerRing(input.worldPos.xz, input.level)) {
      std.discard();
    }
    // The terrain alternates between two ids at every contour interval, so edge detection
    // draws topographic lines for free.
    const band = std.abs(std.floor(input.worldPos.y / CONTOUR_INTERVAL) % 2);
    const normal = std.normalize(input.normal);
    const hue = std.mix(GRASS, ROCK, std.smoothstep(0.3, 0.5, 1 - normal.y));
    const g = surface(input.worldPos, normal, TERRAIN_MATERIAL, d.u32(250 + band), hue);
    return { albedo: g.albedo, normalDepth: g.normalDepth, ids: g.ids, color: g.color };
  });

  const terrainPipeline = root
    .createRenderPipeline({
      vertex: terrainVertex,
      fragment: terrainFragment,
      targets: gBufferTargets,
      depthStencil,
      primitive: { cullMode: 'back' },
    })
    .with(shadowBindGroup)
    .withIndexBuffer(terrain.indexBuffer);

  const terrainShadowPipeline = root
    .createRenderPipeline({
      vertex: tgpu.vertexFn({
        in: { index: d.builtin.vertexIndex, level: d.builtin.instanceIndex },
        out: {
          pos: d.builtin.position,
          worldPos: d.vec3f,
          level: d.interpolate('flat', d.u32),
        },
      })((input) => {
        'use gpu';
        const point = terrain.ringVertex(input.index, input.level);
        return {
          pos: frame.$.lightViewProj * d.vec4f(point.position, 1),
          worldPos: d.vec3f(point.position),
          level: input.level,
        };
      }),
      fragment: tgpu.fragmentFn({
        in: {
          pos: d.builtin.position,
          worldPos: d.vec3f,
          level: d.interpolate('flat', d.u32),
        },
        out: { depth: d.builtin.fragDepth },
      })((input) => {
        'use gpu';
        if (terrain.coveredByInnerRing(input.worldPos.xz, input.level)) {
          std.discard();
        }
        return { depth: input.pos.z };
      }),
      depthStencil: shadowDepthStencil,
    })
    .withIndexBuffer(terrain.indexBuffer);

  // #endregion

  // #region Robot

  const partWorldPosition = (instance: number, local: d.v3f) => {
    'use gpu';
    const part = parts.$[instance];
    return part.position + rotate(part.rotation, local * part.scale);
  };

  const robotPipeline = root
    .createRenderPipeline({
      attribs: meshLayout.attrib,
      vertex: tgpu.vertexFn({
        in: { position: d.vec3f, normal: d.vec3f, instance: d.builtin.instanceIndex },
        out: { pos: d.builtin.position, ...Varyings },
      })((input) => {
        'use gpu';
        const part = parts.$[input.instance];
        const world = partWorldPosition(input.instance, input.position);
        return {
          pos: frame.$.viewProj * d.vec4f(world, 1),
          worldPos: world,
          normal: rotate(part.rotation, input.normal / part.scale),
          material: part.material,
          id: input.instance + 1,
          hue: d.vec3f(robotColors.$[part.material]),
        };
      }),
      fragment: meshFragment,
      targets: gBufferTargets,
      depthStencil,
      primitive: { cullMode: 'back' },
    })
    .with(shadowBindGroup)
    .with(meshLayout, meshBuffer);

  const robotShadowPipeline = root
    .createRenderPipeline({
      attribs: { position: meshLayout.attrib.position },
      vertex: tgpu.vertexFn({
        in: { position: d.vec3f, instance: d.builtin.instanceIndex },
        out: { pos: d.builtin.position },
      })((input) => {
        'use gpu';
        const world = partWorldPosition(input.instance, input.position);
        return { pos: frame.$.lightViewProj * d.vec4f(world, 1) };
      }),
      depthStencil: shadowDepthStencil,
    })
    .with(meshLayout, meshBuffer);

  // #endregion

  // #region Trees up close: full meshes

  /** Trees right next to the walker bend out of its way. */
  const treeWorldPosition = (instance: number, local: d.v3f) => {
    'use gpu';
    const tree = trees.nearTrees.$[instance];
    const offset = rotateY(local * tree.scale, tree.yaw);
    const away = tree.position.xz - frame.$.walker.xz;
    const distance = std.max(std.length(away), 0.01);
    const push = std.smoothstep(7, 2.5, distance) * std.pow(std.saturate(local.y / 9), 1.5) * 3.2;
    const bend = (away / distance) * push;
    return tree.position + offset + d.vec3f(bend.x, -push * 0.3, bend.y);
  };

  const treePipeline = root
    .createRenderPipeline({
      attribs: treeLayout.attrib,
      vertex: tgpu.vertexFn({
        in: {
          position: d.vec3f,
          normal: d.vec3f,
          material: d.u32,
          instance: d.builtin.instanceIndex,
        },
        out: { pos: d.builtin.position, ...Varyings },
      })((input) => {
        'use gpu';
        const tree = trees.nearTrees.$[input.instance];
        const world = treeWorldPosition(input.instance, input.position);
        return {
          pos: frame.$.viewProj * d.vec4f(world, 1),
          worldPos: world,
          normal: rotateY(input.normal, tree.yaw),
          material: input.material,
          id: tree.id,
          hue: std.select(BARK, FOLIAGE, input.material === TREE_FOLIAGE),
        };
      }),
      fragment: meshFragment,
      targets: gBufferTargets,
      depthStencil,
      primitive: { cullMode: 'back' },
    })
    .with(shadowBindGroup)
    .with(treeLayout, trees.meshBuffer);

  const treeShadowPipeline = root
    .createRenderPipeline({
      attribs: { position: treeLayout.attrib.position },
      vertex: tgpu.vertexFn({
        in: { position: d.vec3f, instance: d.builtin.instanceIndex },
        out: { pos: d.builtin.position },
      })((input) => {
        'use gpu';
        const world = treeWorldPosition(input.instance, input.position);
        return { pos: frame.$.lightViewProj * d.vec4f(world, 1) };
      }),
      depthStencil: shadowDepthStencil,
    })
    .with(treeLayout, trees.meshBuffer);

  // #endregion

  // #region Birds

  const birdPipeline = root
    .createRenderPipeline({
      attribs: birdLayout.attrib,
      vertex: tgpu.vertexFn({
        in: { position: d.vec3f, wing: d.f32, instance: d.builtin.instanceIndex },
        out: { pos: d.builtin.position, ...Varyings },
      })((input) => {
        'use gpu';
        const bird = birds.birds.$[input.instance];
        // Build the bird's frame from its velocity, rolled by how hard it is turning.
        const forward = std.normalize(bird.velocity);
        const flatRight = std.normalize(std.cross(forward, d.vec3f(0, 1, 0)));
        const flatUp = std.cross(flatRight, forward);
        const right = flatRight * std.cos(bird.bank) + flatUp * std.sin(bird.bank);
        const up = std.cross(right, forward);
        // Flap: wingtips move the most, and the stroke is quicker going down than up.
        const beat = std.sin(frame.$.time * 11 + bird.phase);
        const flap = (beat * 0.45 + 0.1) * input.wing * input.wing;
        const local = input.position * 1.4;
        const world = bird.position + right * local.x + up * (local.y + flap) + forward * local.z;
        return {
          pos: frame.$.viewProj * d.vec4f(world, 1),
          worldPos: world,
          normal: up,
          material: d.u32(Material.dark),
          id: 190 + (input.instance % 50),
          hue: FEATHERS,
        };
      }),
      fragment: meshFragment,
      targets: gBufferTargets,
      depthStencil,
    })
    .with(shadowBindGroup)
    .with(birdLayout, birds.meshBuffer);

  // #endregion

  // #region Dust

  const DustVaryings = {
    corner: d.vec2f,
    center: d.interpolate('flat', d.vec3f),
    radius: d.interpolate('flat', d.f32),
    kind: d.interpolate('flat', d.u32),
    id: d.interpolate('flat', d.u32),
  };

  const billboardBasis = (center: d.v3f) => {
    'use gpu';
    const toCamera = std.normalize(frame.$.cameraPosition - center);
    const right = std.normalize(std.cross(d.vec3f(0, 1, 0), toCamera));
    return d.mat3x3f(right, std.cross(toCamera, right), toCamera);
  };

  const dustPipeline = root
    .createRenderPipeline({
      vertex: tgpu.vertexFn({
        in: { index: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
        out: { pos: d.builtin.position, ...DustVaryings },
      })((input) => {
        'use gpu';
        const particle = particles.particles.$[input.instance];
        const t = particle.age / std.max(particle.life, 0.001);
        // Puffs swell as they spread, then shrink away; grit just vanishes at the end.
        let radius = particle.size * (1 - std.smoothstep(0.8, 1, t));
        if (particle.kind === PUFF) {
          radius = particle.size * (0.6 + 0.9 * t) * (1 - std.smoothstep(0.5, 1, t));
        }
        radius = std.select(0, radius, t < 1);
        const corner = d.vec2f(d.f32(input.index & 1), d.f32(input.index >>> 1)) * 2 - 1;
        const basis = billboardBasis(particle.position);
        const world =
          particle.position + (basis.columns[0] * corner.x + basis.columns[1] * corner.y) * radius;
        return {
          pos: frame.$.viewProj * d.vec4f(world, 1),
          corner,
          center: d.vec3f(particle.position),
          radius,
          kind: particle.kind,
          id: 184 + (input.instance % 6),
        };
      }),
      fragment: tgpu.fragmentFn({
        in: DustVaryings,
        out: {
          albedo: d.vec4f,
          normalDepth: d.vec4f,
          ids: d.vec4f,
          color: d.vec4f,
          depth: d.builtin.fragDepth,
        },
      })((input) => {
        'use gpu';
        const r2 = std.dot(input.corner, input.corner);
        if (r2 > 1) {
          std.discard();
        }
        // Shade and depth-test each particle as a little sphere.
        const basis = billboardBasis(input.center);
        const normal = basis * d.vec3f(input.corner, std.sqrt(1 - r2));
        const surfacePoint = input.center + normal * input.radius;
        const clip = frame.$.viewProj * d.vec4f(surfacePoint, 1);
        const material = std.select(
          d.u32(Material.dark),
          d.u32(Material.light),
          input.kind === PUFF,
        );
        const hue = std.select(GRIT, DUST, input.kind === PUFF);
        const g = surface(surfacePoint, normal, material, input.id, hue);
        return {
          albedo: g.albedo,
          normalDepth: g.normalDepth,
          ids: g.ids,
          color: g.color,
          depth: clip.z / clip.w,
        };
      }),
      targets: gBufferTargets,
      depthStencil,
      primitive: { topology: 'triangle-strip' },
    })
    .with(shadowBindGroup);

  // #endregion

  // #region Trees far away: octahedral impostors

  const ImpostorVaryings = {
    worldPos: d.vec3f,
    p0: d.vec3f,
    c0: d.interpolate('flat', d.vec3f),
    p1: d.vec3f,
    c1: d.interpolate('flat', d.vec3f),
    p2: d.vec3f,
    c2: d.interpolate('flat', d.vec3f),
    layers: d.interpolate('flat', d.vec3u),
    weights: d.interpolate('flat', d.vec3f),
    yaw: d.interpolate('flat', d.f32),
    scale: d.interpolate('flat', d.f32),
    id: d.interpolate('flat', d.u32),
  };

  const impostorVertex = tgpu.vertexFn({
    in: { index: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
    out: { pos: d.builtin.position, ...ImpostorVaryings },
  })((input) => {
    'use gpu';
    const tree = trees.farTrees.$[input.instance];
    const center = tree.position + d.vec3f(0, TREE_BOUNDS.center[1] * tree.scale, 0);
    // The camera, in the space the tree was captured in: no rotation, no scale.
    const camera = rotateY(frame.$.cameraPosition - center, -tree.yaw) / tree.scale;
    const direction = std.normalize(camera);
    const basis = frameBasis(direction);
    const corner = d.vec2f(d.f32(input.index & 1), d.f32(input.index >>> 1)) * 2 - 1;
    const local = (basis.right * corner.x + basis.up * corner.y) * CAPTURE_RADIUS;
    const world = center + rotateY(local, tree.yaw) * tree.scale;
    const views = blendedViews(direction);
    return {
      pos: frame.$.viewProj * d.vec4f(world, 1),
      worldPos: world,
      p0: toFrameSpace(local, views.frames[0]),
      c0: toFrameSpace(camera, views.frames[0]),
      p1: toFrameSpace(local, views.frames[1]),
      c1: toFrameSpace(camera, views.frames[1]),
      p2: toFrameSpace(local, views.frames[2]),
      c2: toFrameSpace(camera, views.frames[2]),
      layers: d.vec3u(
        frameLayer(views.frames[0]),
        frameLayer(views.frames[1]),
        frameLayer(views.frames[2]),
      ),
      weights: views.weights,
      yaw: tree.yaw,
      scale: tree.scale,
      id: tree.id,
    };
  });

  const impostorFragment = tgpu.fragmentFn({
    in: ImpostorVaryings,
    out: {
      albedo: d.vec4f,
      normalDepth: d.vec4f,
      ids: d.vec4f,
      color: d.vec4f,
      depth: d.builtin.fragDepth,
    },
  })((input) => {
    'use gpu';
    const a = sampleView(input.p0, input.c0, input.layers.x);
    const b = sampleView(input.p1, input.c1, input.layers.y);
    const c = sampleView(input.p2, input.c2, input.layers.z);
    const w = input.weights;
    const sample = a.surface * w.x + b.surface * w.y + c.surface * w.z;
    if (sample.a < 0.5) {
      std.discard();
    }
    // The atlas mips are premultiplied by coverage.
    const encoded = sample.xyz / sample.a;
    const normal = rotateY(octDecode(encoded.xy), input.yaw);
    const material = std.select(d.u32(TREE_TRUNK), d.u32(TREE_FOLIAGE), encoded.z > 0.5);

    // Push the flat quad towards the camera by the captured height, so the tree gets proper
    // depth - and its outline gets drawn against whatever is behind it.
    const height = (a.height * w.x + b.height * w.y + c.height * w.z) * input.scale;
    const toCamera = std.normalize(frame.$.cameraPosition - input.worldPos);
    const surfacePoint = input.worldPos + toCamera * height;
    const clip = frame.$.viewProj * d.vec4f(surfacePoint, 1);

    const hue = std.select(BARK, FOLIAGE, material === TREE_FOLIAGE);
    const g = surface(surfacePoint, normal, material, input.id, hue);
    return {
      albedo: g.albedo,
      normalDepth: g.normalDepth,
      ids: g.ids,
      color: g.color,
      depth: clip.z / clip.w,
    };
  });

  /**
   * Impostors cast shadows too, so a tree's shadow doesn't vanish when it switches from a mesh
   * to an impostor. From the sun's point of view, it's just another camera to face.
   */
  const impostorShadowPipeline = root
    .createRenderPipeline({
      vertex: tgpu.vertexFn({
        in: { index: d.builtin.vertexIndex, instance: d.builtin.instanceIndex },
        out: { pos: d.builtin.position, ...ImpostorVaryings },
      })((input) => {
        'use gpu';
        const tree = trees.farTrees.$[input.instance];
        const center = tree.position + d.vec3f(0, TREE_BOUNDS.center[1] * tree.scale, 0);
        const direction = rotateY(frame.$.sunDirection, -tree.yaw);
        // The sun is far away: put its "camera" far along the light direction.
        const sun = direction * 1000;
        const basis = frameBasis(direction);
        const corner = d.vec2f(d.f32(input.index & 1), d.f32(input.index >>> 1)) * 2 - 1;
        const local = (basis.right * corner.x + basis.up * corner.y) * CAPTURE_RADIUS;
        const world = center + rotateY(local, tree.yaw) * tree.scale;
        const views = blendedViews(direction);
        return {
          pos: frame.$.lightViewProj * d.vec4f(world, 1),
          worldPos: world,
          p0: toFrameSpace(local, views.frames[0]),
          c0: toFrameSpace(sun, views.frames[0]),
          p1: toFrameSpace(local, views.frames[1]),
          c1: toFrameSpace(sun, views.frames[1]),
          p2: toFrameSpace(local, views.frames[2]),
          c2: toFrameSpace(sun, views.frames[2]),
          layers: d.vec3u(
            frameLayer(views.frames[0]),
            frameLayer(views.frames[1]),
            frameLayer(views.frames[2]),
          ),
          weights: views.weights,
          yaw: tree.yaw,
          scale: tree.scale,
          id: tree.id,
        };
      }),
      fragment: tgpu.fragmentFn({
        in: ImpostorVaryings,
        out: { depth: d.builtin.fragDepth },
      })((input) => {
        'use gpu';
        const a = sampleView(input.p0, input.c0, input.layers.x);
        const b = sampleView(input.p1, input.c1, input.layers.y);
        const c = sampleView(input.p2, input.c2, input.layers.z);
        const w = input.weights;
        if (a.surface.a * w.x + b.surface.a * w.y + c.surface.a * w.z < 0.5) {
          std.discard();
        }
        const height = (a.height * w.x + b.height * w.y + c.height * w.z) * input.scale;
        const surfacePoint = input.worldPos + frame.$.sunDirection * height;
        const clip = frame.$.lightViewProj * d.vec4f(surfacePoint, 1);
        return { depth: clip.z / clip.w };
      }),
      depthStencil: shadowDepthStencil,
      primitive: { topology: 'triangle-strip' },
    })
    .with(impostorBindGroup);

  const impostorPipeline = root
    .createRenderPipeline({
      vertex: impostorVertex,
      fragment: impostorFragment,
      targets: gBufferTargets,
      depthStencil,
      primitive: { topology: 'triangle-strip' },
    })
    .with(shadowBindGroup)
    .with(impostorBindGroup);

  // #endregion

  // #region Sketch stage

  const loadNormalDepth = (px: d.v2f) => {
    'use gpu';
    return std.textureSampleLevel(
      gBufferLayout.$.normalDepth,
      gBufferLayout.$.linear,
      px / frame.$.resolution,
      0,
    );
  };

  const loadAlbedo = (px: d.v2f) => {
    'use gpu';
    return std.textureSampleLevel(
      gBufferLayout.$.albedo,
      gBufferLayout.$.linear,
      px / frame.$.resolution,
      0,
    );
  };

  const loadId = (px: d.v2f) => {
    'use gpu';
    return std.textureSampleLevel(
      gBufferLayout.$.ids,
      gBufferLayout.$.linear,
      px / frame.$.resolution,
      0,
    ).x;
  };

  const loadColor = (px: d.v2f) => {
    'use gpu';
    return std.textureSampleLevel(
      gBufferLayout.$.color,
      gBufferLayout.$.linear,
      px / frame.$.resolution,
      0,
    ).rgb;
  };

  /**
   * How the sonar pulses touch a point: (reveal, front). `front` is the bright ring itself,
   * `reveal` is how much of its true colour the point shows, fading a moment after the ring
   * has passed.
   */
  const pulsesAt = (point: d.v3f) => {
    'use gpu';
    let reveal = d.f32(0);
    let front = d.f32(0);
    for (const i of tgpu.unroll(std.range(MAX_PULSES))) {
      const pulse = frame.$.pulses[i];
      const age = frame.$.time - pulse.w;
      if (age >= 0 && age < PULSE_LIFE) {
        const fade = 1 - std.smoothstep(0.6, 1, age / PULSE_LIFE);
        // How far the ring has travelled past this point.
        const behind = age * PULSE_SPEED - std.distance(point, pulse.xyz);
        front = std.max(front, std.exp(-(behind * behind) / 2.5) * fade);
        const afterglow = std.exp(-std.max(behind, 0) / (PULSE_SPEED * REVEAL_TIME));
        reveal = std.max(reveal, std.smoothstep(-1.5, 0.5, behind) * afterglow * fade);
      }
    }
    return d.vec2f(reveal, front);
  };

  /** A soft glow around a point in space, as seen along `ray`, hidden behind geometry. */
  const pointGlow = (point: d.v3f, ray: d.v3f, sceneDepth: number, size: number) => {
    'use gpu';
    const along = std.max(std.dot(point - frame.$.cameraPosition, ray), 0);
    const miss = std.distance(frame.$.cameraPosition + ray * along, point);
    const visible = 1 - std.smoothstep(sceneDepth - 1, sceneDepth + 1, along - size);
    return (std.exp(-(miss * miss) / (size * size)) + 0.3 * std.exp(-miss / (size * 3))) * visible;
  };

  /** A column of light standing on `base`, as seen along `ray`. */
  const pillarGlow = (base: d.v3f, ray: d.v3f, sceneDepth: number) => {
    'use gpu';
    const origin = frame.$.cameraPosition;
    const flat = std.max(std.dot(ray.xz, ray.xz), 0.0001);
    const along = std.max(std.dot(base.xz - origin.xz, ray.xz) / flat, 0);
    const closest = origin + ray * along;
    const miss = std.distance(closest.xz, base.xz);
    const height = closest.y - base.y;
    const span = std.smoothstep(-1, 2, height) * (1 - std.smoothstep(120, 220, height));
    const visible = 1 - std.smoothstep(sceneDepth - 2, sceneDepth + 2, along);
    // Never thinner than a few pixels, so it can be spotted from far away.
    const width = std.max(1.8, along * 0.012);
    const core = std.exp(-(miss * miss) / (width * width));
    const halo = 0.45 * std.exp(-miss / (width * 4));
    return (core + halo) * span * visible;
  };

  const luma = (c: d.v3f) => {
    'use gpu';
    return std.dot(c, d.vec3f(0.3, 0.59, 0.11));
  };

  /** How different the neighbour at `px` is from the center sample. */
  const difference = (center: d.v4f, centerTone: number, centerId: number, px: d.v2f) => {
    'use gpu';
    const other = loadNormalDepth(px);
    // Surfaces seen edge-on change depth quickly, so they get a more forgiving threshold.
    const grazing = 1 - std.abs(center.z);
    const depth = std.abs(other.w - center.w) / std.min(other.w, center.w) / (0.04 + grazing * 0.2);
    const normal = (1 - std.dot(other.xyz, center.xyz)) / 0.3;
    const tone = std.abs(luma(loadAlbedo(px).rgb) - centerTone) / 0.12;
    // Contour lines crowd together in the distance, so they fade out first.
    const idFade = 1 - std.smoothstep(120, 260, center.w);
    const id = std.abs(loadId(px) - centerId) * 600 * idFade;
    return std.max(std.max(depth, id), std.max(normal, tone));
  };

  /** Edge detection on the G-buffer, around pixel `px`. */
  const edgeAt = (px: d.v2f) => {
    'use gpu';
    const center = loadNormalDepth(px);
    const tone = luma(loadAlbedo(px).rgb);
    const id = loadId(px);
    const r = frame.$.pixelRatio * 1.4;
    const edge = std.max(
      std.max(
        difference(center, tone, id, px + d.vec2f(r, 0)),
        difference(center, tone, id, px - d.vec2f(r, 0)),
      ),
      std.max(
        difference(center, tone, id, px + d.vec2f(0, r)),
        difference(center, tone, id, px - d.vec2f(0, r)),
      ),
    );
    return std.smoothstep(0.6, 1.2, edge);
  };

  /** A wobbly UV offset that jumps to a new shape once per sketch step - the "line boil". */
  const sketchOffset = (uv: d.v2f, seed: number, amplitude: number) => {
    'use gpu';
    const s = d.vec2f(std.fract(seed * 0.6180339) * 157, std.fract(seed * 0.4142135) * 113);
    const p = uv * d.vec2f(frame.$.resolution.x / frame.$.resolution.y, 1);
    const coarse = d.vec2f(
      perlin2d.sample(p * 5 + s),
      perlin2d.sample(p * 5 + s + d.vec2f(31.4, 17.9)),
    );
    const fine = d.vec2f(
      perlin2d.sample(p * 23 + s.yx),
      perlin2d.sample(p * 23 + s.yx + d.vec2f(-9.2, 44.1)),
    );
    return (coarse + fine * 0.35) * amplitude * frame.$.wobble;
  };

  const postFragment = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    'use gpu';
    const res = frame.$.resolution;
    const step = frame.$.sketchStep;
    const px = input.uv * res;

    const albedo = loadAlbedo(px);
    const depth = loadNormalDepth(px).w;
    const isSky = depth > FAR * 0.5;
    const fog = std.select(std.smoothstep(FOG_START, FOG_END, depth), 1, isSky);

    // Paper texture: a faint fibrous grain.
    const paperPx = px / frame.$.pixelRatio;
    const grain =
      perlin2d.sample(paperPx * d.vec2f(0.9, 0.12)) * 0.5 + perlin2d.sample(paperPx * 0.35) * 0.5;
    const paper = PAPER * (0.975 + grain * 0.035);

    // Two passes of ink, each distorted differently in UV space: a messy double stroke.
    const uvA = input.uv + sketchOffset(input.uv, step, 0.0035);
    const uvB = input.uv + sketchOffset(input.uv, step + 71, 0.006);
    const pressure = 0.75 + 0.25 * perlin2d.sample(input.uv * 4 + d.vec2f(step * 0.37, 0));
    let ink = std.max(edgeAt(uvA * res), edgeAt(uvB * res) * 0.55) * pressure;

    // Shadows are flat, plus diagonal hatching that boils along with the lines.
    const hatchUv = (uvA * res) / frame.$.pixelRatio;
    const hatchLine =
      1 - std.smoothstep(0.12, 0.3, std.abs(std.fract((hatchUv.x + hatchUv.y * 0.55) / 6.5) - 0.5));
    const shadow = 1 - albedo.a;
    const hatch = hatchLine * shadow * frame.$.hatching * 0.4 * (1 - fog);

    const ndc = d.vec4f(input.uv.x * 2 - 1, 1 - input.uv.y * 2, 1, 1);
    const far = frame.$.invViewProj * ndc;
    const ray = std.normalize(far.xyz / far.w - frame.$.cameraPosition);

    // Where a sonar pulse sweeps by, the sketch briefly shows what things really look like.
    const pulse = pulsesAt(frame.$.cameraPosition + ray * depth);
    const reveal = std.select(pulse.x, 0, isSky);
    const front = std.select(pulse.y, 0, isSky) * (1 - fog);
    const albedoColor = loadColor(px);
    const trueColor = albedoColor * std.mix(0.5, 1.05, albedo.a);

    let color = albedo.rgb * std.mix(0.62, 1, albedo.a);
    color = std.mix(color, INK, hatch * (1 - reveal * 0.6));
    color = std.mix(color, trueColor, reveal * (1 - fog));

    if (isSky) {
      // A pencilled sun.
      const angle = std.acos(std.clamp(std.dot(ray, frame.$.sunDirection), -1, 1));
      const offset = sketchOffset(input.uv, step + 13, 0.004);
      const ring = 1 - std.smoothstep(0.002, 0.005, std.abs(angle - 0.09 + offset.x * 3));
      ink = std.max(ink * (1 - fog), ring * 0.8);
      color = d.vec3f(paper);
    } else {
      ink = ink * (1 - fog * fog);
      color = std.mix(color * (0.975 + grain * 0.035), paper, fog);
    }

    color = std.mix(color, INK, ink * (1 - front));
    // The ring's edge is the surface's own colour, washed halfway to white.
    const ringColor = std.mix(albedoColor, d.vec3f(1), 0.5);
    color = std.mix(color, ringColor, std.saturate(front * 0.9));

    // Light sources glow on top of everything: the antenna's flash and the goal's pillar.
    const flash = frame.$.flash;
    color = std.mix(
      color,
      FLASH_COLOR,
      std.saturate(pointGlow(flash.xyz, ray, depth, 0.9) * flash.w),
    );
    const pillar = frame.$.pillar;
    color = std.mix(
      color,
      PILLAR_COLOR,
      std.saturate(pillarGlow(pillar.xyz, ray, depth) * pillar.w),
    );

    const vignette = 1 - std.dot(input.uv - 0.5, input.uv - 0.5) * 0.35;
    return d.vec4f(color * vignette, 1);
  });

  const postPipeline = root.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: postFragment,
    targets: { format: presentationFormat },
  });

  // #endregion

  function render() {
    parts.write(allParts);

    const encoder = root['~unstable'].createCommandEncoder();

    const shadowPass = encoder.beginRenderPass({
      depthStencilAttachment: { view: shadowMap, depthClearValue: 1 },
    });
    // Only the two innermost terrain rings fall within the shadow map.
    terrainShadowPipeline.with(shadowPass).drawIndexed(terrain.indexCount, 2);
    treeShadowPipeline.with(shadowPass).drawIndirect(trees.nearArgs);
    impostorShadowPipeline.with(shadowPass).drawIndirect(trees.farArgs);
    for (const draw of draws) {
      robotShadowPipeline
        .with(shadowPass)
        .draw(draw.vertexCount, draw.instanceCount, draw.firstVertex, draw.firstInstance);
    }
    shadowPass.end();

    const scenePass = encoder.beginRenderPass({
      colorAttachments: [
        { view: gBuffer.albedo, clearValue: [0, 0, 0, 1] },
        { view: gBuffer.normalDepth, clearValue: [0, 0, 1, FAR] },
        { view: gBuffer.ids, clearValue: [0, 0, 0, 1] },
        { view: gBuffer.color, clearValue: [0, 0, 0, 1] },
      ],
      depthStencilAttachment: { view: gBuffer.depth, depthClearValue: 1 },
    });
    for (const draw of draws) {
      robotPipeline
        .with(scenePass)
        .draw(draw.vertexCount, draw.instanceCount, draw.firstVertex, draw.firstInstance);
    }
    treePipeline.with(scenePass).drawIndirect(trees.nearArgs);
    birdPipeline.with(scenePass).draw(birds.vertexCount, BIRD_COUNT);
    dustPipeline.with(scenePass).draw(4, PARTICLE_COUNT);
    impostorPipeline.with(scenePass).drawIndirect(trees.farArgs);
    terrainPipeline.with(scenePass).drawIndexed(terrain.indexCount, LEVELS);
    scenePass.end();

    const postPass = encoder.beginRenderPass({ colorAttachments: [{ view: context }] });
    postPipeline.with(postPass).with(gBuffer.bindGroup).draw(3);
    postPass.end();

    encoder.submit();
  }

  function resize() {
    gBuffer.destroy();
    gBuffer = createGBuffer();
  }

  return { frame, render, resize, shadowExtent: SHADOW_EXTENT, shadowMapSize: SHADOW_MAP_SIZE };
}
