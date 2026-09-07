import { d, std, tgpu } from 'typegpu';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { defineControls } from '../../common/defineControls.ts';
import { loadModel } from './load-model.ts';
import { createSplitComparison } from '../../common/split-comparison.ts';
import {
  INITIAL_PARAMS,
  MATERIAL_IDS,
  Material,
  Params,
  View,
  modelVertexLayout,
  type MaterialId,
  type ViewMode,
} from './schemas.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const model = await loadModel(root, '/TypeGPU/assets/triplanar-mapping/suzanne.obj');

// #region Material textures

const sampler = root.createSampler({
  addressModeU: 'repeat',
  addressModeV: 'repeat',
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
  maxAnisotropy: 4,
});

const pbrTexture = root
  .createTexture({
    size: [1024, 1024, 5],
    format: 'rgba8unorm',
    viewFormats: ['rgba8unorm-srgb'],
    mipLevelCount: 6,
  })
  .$usage('sampled', 'render');

const albedoView = pbrTexture.createView(d.texture2d(d.f32), {
  format: 'rgba8unorm-srgb',
  baseArrayLayer: 0,
  arrayLayerCount: 1,
});
const narmView = pbrTexture.createView(d.texture2dArray(d.f32), {
  baseArrayLayer: 1,
  arrayLayerCount: 4,
});
const Layer = { normal: 0, ao: 1, roughness: 2, metallic: 3 } as const;

async function loadImage(src: string) {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`Failed to load image: ${src}`);
  }
  return createImageBitmap(await response.blob());
}

let materialLoadRequestId = 0;
async function setMaterial(material: MaterialId) {
  const requestId = ++materialLoadRequestId;
  const images = await Promise.all(
    ['albedo', 'normal', 'ao', 'roughness', 'metallic'].map((map) =>
      loadImage(`/TypeGPU/assets/pom/${material}/${map}.png`),
    ),
  );
  if (requestId === materialLoadRequestId) {
    pbrTexture.write(images);
    pbrTexture.generateMipmaps();
  }
  for (const image of images) {
    image.close();
  }
}

await setMaterial(MATERIAL_IDS[0]);

// #endregion

const cameraUniform = root.createUniform(Camera);
const paramsUniform = root.createUniform(Params, INITIAL_PARAMS);
const meshUvsSlot = tgpu.slot(false);

function sampleAlbedo(uv: d.v2f) {
  'use gpu';
  return std.textureSample(albedoView.$, sampler.$, uv).rgb;
}

function sampleLayer(uv: d.v2f, layer: number) {
  'use gpu';
  return std.textureSample(narmView.$, sampler.$, uv, layer).r;
}

function sampleNormal(uv: d.v2f) {
  'use gpu';
  const decoded = std.textureSample(narmView.$, sampler.$, uv, Layer.normal).rgb * 2 - 1;
  return std.normalize(d.vec3f(decoded.x, -decoded.y, decoded.z));
}

function axisSigns(n: d.v3f) {
  'use gpu';
  return std.select(d.vec3f(-1), d.vec3f(1), std.ge(n, d.vec3f(0)));
}

function triplanarWeights(n: d.v3f, sharpness: number) {
  'use gpu';
  const w = std.pow(std.abs(n), d.vec3f(sharpness));
  return w / std.max(w.x + w.y + w.z, 0.0001);
}

function blendLayer(layer: number, uvX: d.v2f, uvY: d.v2f, uvZ: d.v2f, w: d.v3f) {
  'use gpu';
  return (
    sampleLayer(uvX, layer) * w.x + sampleLayer(uvY, layer) * w.y + sampleLayer(uvZ, layer) * w.z
  );
}

function triplanarNormal(
  n: d.v3f,
  s: d.v3f,
  w: d.v3f,
  uvX: d.v2f,
  uvY: d.v2f,
  uvZ: d.v2f,
  ratio: number,
) {
  'use gpu';
  const tx = sampleNormal(uvX);
  const ty = sampleNormal(uvY);
  const tz = sampleNormal(uvZ);

  const nx = d.vec3f(tx.z * s.x, tx.y, tx.x * s.x);
  const ny = d.vec3f(ty.x * s.y, ty.z * s.y, ty.y);
  const nz = d.vec3f(tz.x * s.z, tz.y, tz.z * s.z);

  const detail =
    (nx - d.vec3f(s.x, 0, 0)) * w.x +
    (ny - d.vec3f(0, s.y, 0)) * w.y +
    (nz - d.vec3f(0, 0, s.z)) * w.z;
  return std.normalize(std.mix(n, std.normalize(n + detail), ratio));
}

function meshUvNormal(uv: d.v2f, n: d.v3f, p: d.v3f, ratio: number) {
  'use gpu';
  const dpx = std.cross(std.dpdy(p), n);
  const dpy = std.cross(n, std.dpdx(p));
  const duv1 = std.dpdx(uv);
  const duv2 = std.dpdy(uv);

  const t = dpx * duv1.x + dpy * duv2.x;
  const b = dpx * duv1.y + dpy * duv2.y;
  const scale = std.inverseSqrt(std.max(std.dot(t, t), std.dot(b, b)));

  const mapped = sampleNormal(uv);
  const normal = std.normalize(t * scale * mapped.x + b * scale * mapped.y + n * mapped.z);
  return std.normalize(std.mix(n, normal, ratio));
}

function shade(material: d.InferGPU<typeof Material>, worldPos: d.v3f, lightDir: d.v3f) {
  'use gpu';
  const L = std.normalize(lightDir);
  const V = std.normalize(cameraUniform.$.position.xyz - worldPos);
  const H = std.normalize(L + V);
  const NdotL = std.max(std.dot(material.normal, L), 0);
  const NdotH = std.max(std.dot(material.normal, H), 0);

  const ambient = material.albedo * (0.08 + material.ao * 0.22);
  const diffuse = material.albedo * (1 - material.metallic) * NdotL * 0.85;
  const specularPower = std.mix(96, 8, material.roughness);
  const specularColor = std.mix(d.vec3f(0.04), material.albedo, material.metallic);
  const specular = specularColor * std.pow(NdotH, specularPower) * (1 - material.roughness) * 0.6;

  return ambient + diffuse + specular;
}

function toDisplay(linear: d.v3f) {
  'use gpu';
  return d.vec4f(std.pow(std.max(linear, d.vec3f(0)), d.vec3f(1 / 2.2)), 1);
}

const vertexShader = tgpu.vertexFn({
  in: { position: d.vec3f, normal: d.vec3f, uv: d.vec2f },
  out: { canvasPosition: d.builtin.position, worldPos: d.vec3f, worldNormal: d.vec3f, uv: d.vec2f },
})((input) => {
  'use gpu';
  const camera = cameraUniform.$;
  return {
    canvasPosition: camera.projection * camera.view * d.vec4f(input.position, 1),
    worldPos: input.position,
    worldNormal: input.normal,
    uv: input.uv,
  };
});

const fragmentShader = tgpu.fragmentFn({
  in: { worldPos: d.vec3f, worldNormal: d.vec3f, uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  'use gpu';
  const params = paramsUniform.$;
  const n = std.normalize(input.worldNormal);
  let material = Material();

  if (meshUvsSlot.$) {
    const uv = d.vec2f(input.uv.x, 1 - input.uv.y) * params.uvScale;
    material = Material({
      albedo: sampleAlbedo(uv),
      normal: meshUvNormal(uv, n, input.worldPos, params.materialNormalRatio),
      ao: sampleLayer(uv, Layer.ao),
      roughness: sampleLayer(uv, Layer.roughness),
      metallic: sampleLayer(uv, Layer.metallic),
    });
  } else {
    const w = triplanarWeights(n, params.sharpness);
    const s = axisSigns(n);
    const p = input.worldPos * params.triplanarScale;
    const uvX = d.vec2f(p.z * s.x, p.y);
    const uvY = d.vec2f(p.x * s.y, p.z);
    const uvZ = d.vec2f(p.x * s.z, p.y);

    if (params.view === View.weights) {
      return d.vec4f(w, 1);
    }
    if (params.view === View.projectionX) {
      return toDisplay(sampleAlbedo(uvX));
    }
    if (params.view === View.projectionY) {
      return toDisplay(sampleAlbedo(uvY));
    }
    if (params.view === View.projectionZ) {
      return toDisplay(sampleAlbedo(uvZ));
    }

    material = Material({
      albedo: sampleAlbedo(uvX) * w.x + sampleAlbedo(uvY) * w.y + sampleAlbedo(uvZ) * w.z,
      normal: triplanarNormal(n, s, w, uvX, uvY, uvZ, params.materialNormalRatio),
      ao: blendLayer(Layer.ao, uvX, uvY, uvZ, w),
      roughness: blendLayer(Layer.roughness, uvX, uvY, uvZ, w),
      metallic: blendLayer(Layer.metallic, uvX, uvY, uvZ, w),
    });
  }

  if (params.view === View.albedo) {
    return toDisplay(material.albedo);
  }
  if (params.view === View.normal) {
    return d.vec4f(material.normal * 0.5 + 0.5, 1);
  }
  return toDisplay(shade(material, input.worldPos, params.lightDir));
});

function createPipeline(meshUvs: boolean) {
  return root
    .with(meshUvsSlot, meshUvs)
    .createRenderPipeline({
      attribs: modelVertexLayout.attrib,
      vertex: vertexShader,
      fragment: fragmentShader,
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    })
    .with(modelVertexLayout, model.vertexBuffer);
}

const triplanarPipeline = createPipeline(false);
const meshUvsPipeline = createPipeline(true);

function createDepthTexture() {
  return root
    .createTexture({ size: [canvas.width, canvas.height], format: 'depth32float' })
    .$usage('render');
}

let depthTexture = createDepthTexture();
let splitRatio = 0.5;

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  { initPos: d.vec4f(0, 1, -5, 1), target: d.vec4f(0, 0, 0, 1), minZoom: 1.5, maxZoom: 8 },
  (updates) => cameraUniform.patch(updates),
);

const splitComparison = createSplitComparison(canvas, 'Triplanar Mapping', 'Mesh UVs', (ratio) => {
  splitRatio = ratio;
});

let frameId: number;
function frame() {
  const splitX = Math.round(canvas.width * splitRatio);
  const encoder = root['~unstable'].createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{ view: context }],
    depthStencilAttachment: { view: depthTexture },
  });

  pass.setScissorRect(0, 0, splitX, canvas.height);
  triplanarPipeline.with(pass).draw(model.vertexCount);
  pass.setScissorRect(splitX, 0, canvas.width - splitX, canvas.height);
  meshUvsPipeline.with(pass).draw(model.vertexCount);

  pass.end();
  encoder.submit();
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);

// #region Example controls and cleanup

export const controls = defineControls({
  material: {
    initial: MATERIAL_IDS[0],
    options: MATERIAL_IDS,
    onSelectChange(material) {
      setMaterial(material).catch(console.error);
    },
  },
  view: {
    initial: 'lit',
    options: Object.keys(View) as ViewMode[],
    onSelectChange(mode) {
      paramsUniform.patch({ view: View[mode] });
    },
  },
  'triplanar scale': {
    initial: INITIAL_PARAMS.triplanarScale,
    min: 0.5,
    max: 10,
    step: 0.1,
    onSliderChange(triplanarScale) {
      paramsUniform.patch({ triplanarScale });
    },
  },
  'UV scale': {
    initial: INITIAL_PARAMS.uvScale,
    min: 0.25,
    max: 6,
    step: 0.05,
    onSliderChange(uvScale) {
      paramsUniform.patch({ uvScale });
    },
  },
  'blend sharpness': {
    initial: INITIAL_PARAMS.sharpness,
    min: 1,
    max: 10,
    step: 0.1,
    onSliderChange(sharpness) {
      paramsUniform.patch({ sharpness });
    },
  },
  'material normal ratio': {
    initial: INITIAL_PARAMS.materialNormalRatio,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange(materialNormalRatio) {
      paramsUniform.patch({ materialNormalRatio });
    },
  },
});

const resizeObserver = new ResizeObserver(() => {
  depthTexture.destroy();
  depthTexture = createDepthTexture();
  splitComparison.sync();
});
resizeObserver.observe(canvas);

export function onCleanup() {
  cancelAnimationFrame(frameId);
  cleanupCamera();
  resizeObserver.disconnect();
  splitComparison.destroy();
  root.destroy();
}

// #endregion
