import tgpu, { common, d, std } from 'typegpu';
import * as sdf from '@typegpu/sdf';

import { randf } from '@typegpu/noise';
import { SwitchBehavior } from './switch.ts';
import { CameraController } from './camera.ts';
import {
  BoundingBox,
  DirectionalLight,
  HitInfo,
  ObjectType,
  Ray,
  rayMarchLayout,
  sampleLayout,
} from './dataTypes.ts';
import {
  beerLambert,
  createBackgroundTexture,
  createTextures,
  fresnelSchlick,
  intersectBox,
} from './utils.ts';
import { TAAResolver } from './taa.ts';
import {
  AMBIENT_COLOR,
  AMBIENT_INTENSITY,
  AO_BIAS,
  AO_INTENSITY,
  AO_RADIUS,
  AO_STEPS,
  DARK_GROUND_ALBEDO,
  JELLY_HALFSIZE,
  JELLY_IOR,
  JELLY_SCATTER_STRENGTH,
  LIGHT_GROUND_ALBEDO,
  MAX_DIST,
  MAX_STEPS,
  SPECULAR_INTENSITY,
  SPECULAR_POWER,
  SURF_DIST,
  SWITCH_RAIL_LENGTH,
} from './constants.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init({
  device: {
    optionalFeatures: ['timestamp-query'],
  },
});
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const hasTimestampQuery = root.enabledFeatures.has('timestamp-query');

const switchBehavior = new SwitchBehavior(root);
await switchBehavior.init();

let qualityScale = 0.5;
let [width, height] = [canvas.width * qualityScale, canvas.height * qualityScale];

let textures = createTextures(root, width, height);
let backgroundTexture = createBackgroundTexture(root, width, height);

const filteringSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const camera = new CameraController(
  root,
  d.vec3f(0.024, 2.7, 1.9),
  d.vec3f(0, 0, 0),
  d.vec3f(0, 1, 0),
  Math.PI / 4,
  width,
  height,
);
const cameraUniform = camera.cameraUniform;

const lightUniform = root.createUniform(DirectionalLight, {
  direction: std.normalize(d.vec3f(0.19, -0.24, 0.75)),
  color: d.vec3f(1, 1, 1),
});

const jellyColorUniform = root.createUniform(d.vec4f, d.vec4f(1.0, 0.45, 0.075, 1.0));

const darkModeUniform = root.createUniform(d.u32);

const randomUniform = root.createUniform(d.vec2f);

const getRay = (ndc: d.v2f) => {
  'use gpu';
  const clipPos = d.vec4f(ndc.x, ndc.y, -1.0, 1.0);

  const invView = cameraUniform.$.viewInv;
  const invProj = cameraUniform.$.projInv;

  const viewPos = invProj.mul(clipPos);
  const viewPosNormalized = d.vec4f(viewPos.xyz.div(viewPos.w), 1.0);

  const worldPos = invView.mul(viewPosNormalized);

  const rayOrigin = invView.columns[3].xyz;
  const rayDir = std.normalize(worldPos.xyz.sub(rayOrigin));

  return Ray({
    origin: rayOrigin,
    direction: rayDir,
  });
};

const getJellyBounds = () => {
  'use gpu';
  return BoundingBox({
    min: d.vec3f(-1, -1, -1),
    max: d.vec3f(1, 1, 1),
  });
};

const GroundParams = {
  groundThickness: 0.03,
  groundRadius: 0.05,
  groundRoundness: 0.02,
};

const rectangleCutoutDist = (position: d.v2f) => {
  'use gpu';
  const groundRoundness = GroundParams.groundRoundness;
  const groundRadius = GroundParams.groundRadius;

  return sdf.sdRoundedBox2d(
    position,
    d.vec2f(SWITCH_RAIL_LENGTH * 0.5 + 0.2 + groundRoundness, groundRadius + groundRoundness),
    groundRadius + groundRoundness,
  );
};

const getMainSceneDist = (position: d.v3f) => {
  'use gpu';
  const groundThickness = GroundParams.groundThickness;
  const groundRoundness = GroundParams.groundRoundness;

  return sdf.opUnion(
    sdf.sdPlane(position, d.vec3f(0, 1, 0), 0.06),
    sdf.opExtrudeY(position, -rectangleCutoutDist(position.xz), groundThickness - groundRoundness) -
      groundRoundness,
  );
};

/**
 * Returns a transformed position.
 */
const opCheapBend = (p: d.v3f, k: number) => {
  'use gpu';
  const c = std.cos(k * p.x);
  const s = std.sin(k * p.x);
  const m = d.mat2x2f(c, -s, s, c);
  return d.vec3f(m.mul(p.xy), p.z);
};

/**
 * Source: https://mini.gmshaders.com/p/3d-rotation
 */
const opRotateAxisAngle = (p: d.v3f, axis: d.v3f, angle: number) => {
  'use gpu';
  return std.add(
    std.mix(axis.mul(std.dot(p, axis)), p, std.cos(angle)),
    std.cross(p, axis).mul(std.sin(angle)),
  );
};

const getJellyDist = (position: d.v3f) => {
  'use gpu';
  const state = switchBehavior.stateUniform.$;
  const jellyOrigin = d.vec3f(
    (state.progress - 0.5) * SWITCH_RAIL_LENGTH - state.squashX * (state.progress - 0.5) * 0.2,
    JELLY_HALFSIZE.y * 0.5,
    0,
  );
  const jellyInvScale = d.vec3f(1 - state.squashX, 1, 1 - state.squashZ);
  const localPos = opRotateAxisAngle(
    position.sub(jellyOrigin).mul(jellyInvScale),
    d.vec3f(0, 0, 1),
    state.wiggleX,
  );
  return sdf.sdRoundedBox3d(opCheapBend(localPos, 0.8), JELLY_HALFSIZE.sub(0.1), 0.1);
};

const getSceneDist = (position: d.v3f) => {
  'use gpu';
  const mainScene = getMainSceneDist(position);
  const jelly = getJellyDist(position);

  const hitInfo = HitInfo();

  if (jelly < mainScene) {
    hitInfo.distance = jelly;
    hitInfo.objectType = ObjectType.SLIDER;
  } else {
    hitInfo.distance = mainScene;
    hitInfo.objectType = ObjectType.BACKGROUND;
  }
  return hitInfo;
};

const getSceneDistForAO = (position: d.v3f) => {
  'use gpu';
  const mainScene = getMainSceneDist(position);
  const jelly = getJellyDist(position);
  return std.min(mainScene, jelly);
};

const getApproxNormal = (p: d.v3f, e: number): d.v3f => {
  'use gpu';
  const dist = getSceneDist(p).distance;

  const n = d.vec3f(
    getSceneDist(std.add(p, d.vec3f(e, 0, 0))).distance - dist,
    getSceneDist(std.add(p, d.vec3f(0, e, 0))).distance - dist,
    getSceneDist(std.add(p, d.vec3f(0, 0, e))).distance - dist,
  );

  return std.normalize(n);
};

const getNormal = (position: d.v3f) => {
  'use gpu';
  if (std.abs(position.z) > 0.5 || std.abs(position.x) > 1.02) {
    return d.vec3f(0, 1, 0);
  }
  return getApproxNormal(position, 0.0001);
};

const sqLength = (a: d.v3f) => {
  'use gpu';
  return std.dot(a, a);
};

const getFakeShadow = (position: d.v3f, lightDir: d.v3f): d.v3f => {
  'use gpu';
  if (position.y < -GroundParams.groundThickness) {
    // Applying darkening under the ground (the shadow cast by the upper ground layer)
    const fadeSharpness = 30;
    const inset = 0.02;
    const cutout = rectangleCutoutDist(position.xz) + inset;
    const edgeDarkening = std.saturate(1 - cutout * fadeSharpness);

    // Applying a slight gradient based on the light direction
    const lightGradient = std.saturate(-position.z * 4 * lightDir.z + 1);

    return d
      .vec3f(1)
      .mul(edgeDarkening)
      .mul(lightGradient * 0.5);
  }

  return d.vec3f(1);
};

const calculateAO = (position: d.v3f, normal: d.v3f) => {
  'use gpu';
  let totalOcclusion = d.f32(0.0);
  let sampleWeight = d.f32(1.0);
  const stepDistance = AO_RADIUS / AO_STEPS;

  for (let i = 1; i <= AO_STEPS; i++) {
    const sampleHeight = stepDistance * d.f32(i);
    const samplePosition = position.add(normal.mul(sampleHeight));
    const distanceToSurface = getSceneDistForAO(samplePosition) - AO_BIAS;
    const occlusionContribution = std.max(0.0, sampleHeight - distanceToSurface);
    totalOcclusion += occlusionContribution * sampleWeight;
    sampleWeight *= 0.5;
    if (totalOcclusion > AO_RADIUS / AO_INTENSITY) {
      break;
    }
  }

  const rawAO = 1.0 - (AO_INTENSITY * totalOcclusion) / AO_RADIUS;
  return std.saturate(rawAO);
};

const calculateLighting = (hitPosition: d.v3f, normal: d.v3f, rayOrigin: d.v3f) => {
  'use gpu';
  const lightDir = std.neg(lightUniform.$.direction);

  const fakeShadow = getFakeShadow(hitPosition, lightDir);
  const diffuse = std.max(std.dot(normal, lightDir), 0.0);

  const viewDir = std.normalize(rayOrigin.sub(hitPosition));
  const reflectDir = std.reflect(std.neg(lightDir), normal);
  const specularFactor = std.max(std.dot(viewDir, reflectDir), 0) ** SPECULAR_POWER;
  const specular = lightUniform.$.color.mul(specularFactor * SPECULAR_INTENSITY);

  const baseColor = d.vec3f(0.9);

  const directionalLight = baseColor.mul(lightUniform.$.color).mul(diffuse).mul(fakeShadow);
  const ambientLight = baseColor.mul(AMBIENT_COLOR).mul(AMBIENT_INTENSITY);

  const finalSpecular = specular.mul(fakeShadow);

  return std.saturate(directionalLight.add(ambientLight).add(finalSpecular));
};

const applyAO = (litColor: d.v3f, hitPosition: d.v3f, normal: d.v3f) => {
  'use gpu';
  const ao = calculateAO(hitPosition, normal);
  const finalColor = litColor.mul(ao);
  return d.vec4f(finalColor, 1.0);
};

const rayMarchNoJelly = (rayOrigin: d.v3f, rayDirection: d.v3f) => {
  'use gpu';
  let distanceFromOrigin = d.f32();
  let hit = d.f32();

  for (let i = 0; i < 6; i++) {
    const p = rayOrigin.add(rayDirection.mul(distanceFromOrigin));
    hit = getMainSceneDist(p);
    distanceFromOrigin += hit;
    if (distanceFromOrigin > MAX_DIST || hit < SURF_DIST * 10) {
      break;
    }
  }

  if (distanceFromOrigin < MAX_DIST) {
    return renderBackground(rayOrigin, rayDirection, distanceFromOrigin).xyz;
  }
  return d.vec3f();
};

const renderBackground = (rayOrigin: d.v3f, rayDirection: d.v3f, backgroundHitDist: number) => {
  'use gpu';
  const state = switchBehavior.stateUniform.$;
  const hitPosition = rayOrigin.add(rayDirection.mul(backgroundHitDist));

  const newNormal = getNormal(hitPosition);

  // Calculate fake bounce lighting
  const switchX = (state.progress - 0.5) * SWITCH_RAIL_LENGTH;
  const jellyColor = jellyColorUniform.$;
  const sqDist = sqLength(hitPosition.sub(d.vec3f(switchX, 0, 0)));
  const bounceLight = jellyColor.rgb.mul((1 / (sqDist * 15 + 1)) * 0.4);
  const sideBounceLight = jellyColor.rgb
    .mul((1 / (sqDist * 40 + 1)) * 0.3)
    .mul(std.abs(newNormal.z));
  const emission = std.smoothstep(0.7, 1, state.progress) * 2 + 0.7;

  const litColor = calculateLighting(hitPosition, newNormal, rayOrigin);
  const backgroundColor = applyAO(
    std.select(LIGHT_GROUND_ALBEDO, DARK_GROUND_ALBEDO, darkModeUniform.$ === 1).mul(litColor),
    hitPosition,
    newNormal,
  )
    .add(d.vec4f(bounceLight.mul(emission), 0))
    .add(d.vec4f(sideBounceLight.mul(emission), 0));

  return d.vec4f(backgroundColor.rgb, 1);
};

const rayMarch = (rayOrigin: d.v3f, rayDirection: d.v3f, _uv: d.v2f) => {
  'use gpu';
  let totalSteps = d.u32();

  let backgroundDist = d.f32();
  for (let i = 0; i < MAX_STEPS; i++) {
    const p = rayOrigin.add(rayDirection.mul(backgroundDist));
    const hit = getMainSceneDist(p);
    backgroundDist += hit;
    if (hit < SURF_DIST) {
      break;
    }
  }
  const background = renderBackground(rayOrigin, rayDirection, backgroundDist);

  const bbox = getJellyBounds();
  const intersection = intersectBox(rayOrigin, rayDirection, bbox);

  if (!intersection.hit) {
    return background;
  }

  let distanceFromOrigin = std.max(d.f32(0.0), intersection.tMin);

  for (let i = 0; i < MAX_STEPS; i++) {
    if (totalSteps >= MAX_STEPS) {
      break;
    }

    const currentPosition = rayOrigin.add(rayDirection.mul(distanceFromOrigin));

    const hitInfo = getSceneDist(currentPosition);
    distanceFromOrigin += hitInfo.distance;
    totalSteps++;

    if (hitInfo.distance < SURF_DIST) {
      const hitPosition = rayOrigin.add(rayDirection.mul(distanceFromOrigin));

      if (!(hitInfo.objectType === ObjectType.SLIDER)) {
        break;
      }

      const N = getNormal(hitPosition);
      const I = rayDirection;
      const cosi = std.min(1.0, std.max(0.0, std.dot(std.neg(I), N)));
      const F = fresnelSchlick(cosi, d.f32(1.0), d.f32(JELLY_IOR));

      const reflection = std.saturate(d.vec3f(hitPosition.y + 0.2));

      const eta = 1.0 / JELLY_IOR;
      const k = 1.0 - eta * eta * (1.0 - cosi * cosi);
      let refractedColor = d.vec3f();
      if (k > 0.0) {
        const refrDir = std.normalize(std.add(I.mul(eta), N.mul(eta * cosi - std.sqrt(k))));
        const p = hitPosition.add(refrDir.mul(SURF_DIST * 2.0));
        const exitPos = p.add(refrDir.mul(SURF_DIST * 2.0));

        const env = rayMarchNoJelly(exitPos, refrDir);
        const jellyColor = jellyColorUniform.$;

        const scatterTint = jellyColor.rgb.mul(1.5);
        const density = d.f32(20.0);
        const absorb = d.vec3f(1.0).sub(jellyColor.rgb).mul(density);

        const state = switchBehavior.stateUniform.$;
        const progress =
          std.saturate(std.mix(1, 0.6, hitPosition.y * (1 / (JELLY_HALFSIZE.y * 2)) + 0.25)) *
          state.progress;
        const T = beerLambert(absorb.mul(progress ** 2), 0.08);

        const lightDir = std.neg(lightUniform.$.direction);

        const forward = std.max(0.0, std.dot(lightDir, refrDir));
        const scatter = scatterTint.mul(JELLY_SCATTER_STRENGTH * forward * progress ** 3);
        refractedColor = env.mul(T).add(scatter);
      }

      const jelly = std.add(reflection.mul(F), refractedColor.mul(1 - F));

      return d.vec4f(jelly, 1.0);
    }

    if (distanceFromOrigin > backgroundDist) {
      break;
    }
  }

  return background;
};

const raymarchFn = tgpu.fragmentFn({
  in: {
    uv: d.vec2f,
  },
  out: d.vec4f,
})(({ uv }) => {
  randf.seed2(randomUniform.$.mul(uv));

  const ndc = d.vec2f(uv.x * 2 - 1, -(uv.y * 2 - 1));
  const ray = getRay(ndc);

  const color = rayMarch(ray.origin, ray.direction, uv);

  const exposure = std.select(1.5, 2, darkModeUniform.$ === 1);
  return d.vec4f(std.tanh(color.rgb.mul(exposure)), 1);
});

const fragmentMain = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  return std.textureSample(sampleLayout.$.currentTexture, filteringSampler.$, input.uv);
});

const rayMarchPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: raymarchFn,
  targets: { format: 'rgba8unorm' },
});

const renderPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: fragmentMain,
  targets: { format: presentationFormat },
});

let lastTimeStamp = performance.now();
let frameCount = 0;
const taaResolver = new TAAResolver(root, width, height);

function createBindGroups() {
  return {
    rayMarch: root.createBindGroup(rayMarchLayout, {
      backgroundTexture: backgroundTexture.sampled,
    }),
    render: [0, 1].map((frame) =>
      root.createBindGroup(sampleLayout, {
        currentTexture: taaResolver.getResolvedTexture(frame),
      }),
    ),
  };
}

let bindGroups = createBindGroups();

let animationFrameHandle: number;
function render(timestamp: number) {
  frameCount++;
  camera.jitter();
  const deltaTime = Math.min((timestamp - lastTimeStamp) * 0.001, 0.1);
  lastTimeStamp = timestamp;

  randomUniform.write(d.vec2f((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2));

  switchBehavior.update(deltaTime);

  const currentFrame = frameCount % 2;

  rayMarchPipeline
    .withColorAttachment({
      view: textures[currentFrame].sampled,
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  taaResolver.resolve(textures[currentFrame].sampled, frameCount, currentFrame);

  renderPipeline
    .withColorAttachment({ view: context })
    .with(bindGroups.render[currentFrame])
    .draw(3);

  animationFrameHandle = requestAnimationFrame(render);
}

function handleResize() {
  [width, height] = [canvas.width * qualityScale, canvas.height * qualityScale];
  camera.updateProjection(Math.PI / 4, width, height);
  textures = createTextures(root, width, height);
  backgroundTexture = createBackgroundTexture(root, width, height);
  taaResolver.resize(width, height);
  frameCount = 0;

  bindGroups = createBindGroups();
}

const resizeObserver = new ResizeObserver(() => {
  handleResize();
});
resizeObserver.observe(canvas);

animationFrameHandle = requestAnimationFrame(render);

// #region Example controls and cleanup

canvas.addEventListener('touchstart', (event) => {
  switchBehavior.pressed = true;
  event.preventDefault();
});

canvas.addEventListener('touchend', () => {
  switchBehavior.pressed = false;
  switchBehavior.toggled = !switchBehavior.toggled;
});

canvas.addEventListener('mousedown', (event) => {
  switchBehavior.pressed = true;
  event.preventDefault();
});

canvas.addEventListener('mouseup', (event) => {
  switchBehavior.pressed = false;
  switchBehavior.toggled = !switchBehavior.toggled;
  event.stopPropagation();
});

window.addEventListener('mouseup', () => {
  switchBehavior.pressed = false;
});

async function autoSetQuaility() {
  if (!hasTimestampQuery) {
    return 0.5;
  }

  const targetFrameTime = 5;
  const tolerance = 2.0;
  let resolutionScale = 0.3;
  let lastTimeMs = 0;

  const measurePipeline = rayMarchPipeline.withPerformanceCallback((start, end) => {
    lastTimeMs = Number(end - start) / 1e6;
  });

  for (let i = 0; i < 8; i++) {
    const testTexture = root['~unstable']
      .createTexture({
        size: [canvas.width * resolutionScale, canvas.height * resolutionScale],
        format: 'rgba8unorm',
      })
      .$usage('render');

    measurePipeline
      .withColorAttachment({
        view: testTexture,
        loadOp: 'clear',
        storeOp: 'store',
      })
      .with(
        root.createBindGroup(rayMarchLayout, {
          backgroundTexture: backgroundTexture.sampled,
        }),
      )
      .draw(3);

    await root.device.queue.onSubmittedWorkDone();
    testTexture.destroy();

    if (Math.abs(lastTimeMs - targetFrameTime) < tolerance) {
      break;
    }

    const adjustment = lastTimeMs > targetFrameTime ? -0.1 : 0.1;
    resolutionScale = Math.max(0.3, Math.min(1.0, resolutionScale + adjustment));
  }

  console.log(`Auto-selected quality scale: ${resolutionScale.toFixed(2)}`);
  return resolutionScale;
}

export const controls = defineControls({
  Quality: {
    initial: 'Auto',
    options: ['Auto', 'Very Low', 'Low', 'Medium', 'High', 'Ultra'],
    onSelectChange: (value) => {
      if (value === 'Auto') {
        void autoSetQuaility().then((scale) => {
          qualityScale = scale;
          handleResize();
        });
        return;
      }

      const qualityMap: { [key: string]: number } = {
        'Very Low': 0.3,
        Low: 0.5,
        Medium: 0.7,
        High: 0.85,
        Ultra: 1.0,
      };

      qualityScale = qualityMap[value] || 0.5;
      handleResize();
    },
  },
  'Light dir': {
    initial: 0,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (v) => {
      const dir1 = std.normalize(d.vec3f(0.18, -0.3, 0.64));
      const dir2 = std.normalize(d.vec3f(-0.5, -0.14, -0.8));
      const finalDir = std.normalize(std.mix(dir1, dir2, v));
      lightUniform.writePartial({
        direction: finalDir,
      });
    },
  },
  'Jelly Color': {
    initial: d.vec3f(0.08, 0.5, 1),
    onColorChange: (c) => {
      jellyColorUniform.write(d.vec4f(c, 1.0));
    },
  },
  'Dark Mode': {
    initial: false,
    onToggleChange: (v: boolean) => {
      darkModeUniform.write(d.u32(v));
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(animationFrameHandle);
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
