import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as sdf from '@typegpu/sdf';
import { fullScreenTriangle } from 'typegpu/common';

import { randf } from '@typegpu/noise';
import { KnobBehavior } from './knob.ts';
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
  DARK_MODE_LIGHT_DIR,
  JELLY_HALFSIZE,
  JELLY_IOR,
  JELLY_SCATTER_STRENGTH,
  LIGHT_GROUND_ALBEDO,
  LIGHT_MODE_LIGHT_DIR,
  MAX_DIST,
  MAX_STEPS,
  SPECULAR_INTENSITY,
  SPECULAR_POWER,
  SURF_DIST,
} from './constants.ts';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const root = await tgpu.init({
  device: {
    optionalFeatures: ['timestamp-query'],
  },
});
const hasTimestampQuery = root.enabledFeatures.has('timestamp-query');
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const knobBehavior = new KnobBehavior(root);
await knobBehavior.init();

let qualityScale = 0.5;
let [width, height] = [
  canvas.width * qualityScale,
  canvas.height * qualityScale,
];

let textures = createTextures(root, width, height);
let backgroundTexture = createBackgroundTexture(root, width, height);

const filteringSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const camera = new CameraController(
  root,
  d.vec3f(0, 2.7, 0.8),
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

const jellyColorUniform = root.createUniform(
  d.vec4f,
  d.vec4f(1.0, 0.45, 0.075, 1.0),
);

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
  groundRoundness: 0.02,
  jellyCutoutRadius: 0.38,
  meterCutoutRadius: 0.7,
  meterCutoutGirth: 0.08,
};

const sdJellyCutout = (position: d.v2f) => {
  'use gpu';
  const groundRoundness = GroundParams.groundRoundness;
  const groundRadius = GroundParams.jellyCutoutRadius;

  return sdf.sdDisk(
    position,
    groundRadius + groundRoundness,
  );
};

const sdMeterCutout = (position: d.v2f) => {
  'use gpu';
  const groundRoundness = GroundParams.groundRoundness;
  const meterCutoutRadius = GroundParams.meterCutoutRadius;
  const meterCutoutGirth = GroundParams.meterCutoutGirth;
  const angle = Math.PI / 2;

  return sdf.sdArc(
    position,
    d.vec2f(std.sin(angle), std.cos(angle)),
    meterCutoutRadius,
    meterCutoutGirth + groundRoundness,
  );
};

const sdFloorCutout = (position: d.v2f) => {
  'use gpu';
  const jellyCutoutDistance = sdJellyCutout(position);
  const meterCutoutDistance = sdMeterCutout(position);
  return sdf.opUnion(jellyCutoutDistance, meterCutoutDistance);
};

const sdArrowHead = (p: d.v3f) => {
  'use gpu';
  return sdf.sdRhombus(
    p,
    // shorter on one end, longer on the other
    std.select(0.15, 0.05, p.x > 0),
    0.04, // width of the arrow head
    0.001, // thickness
    std.smoothstep(-0.1, 0.1, p.x) * 0.02,
  ) - 0.007;
};

const getBackgroundDist = (position: d.v3f) => {
  'use gpu';
  const state = knobBehavior.stateUniform.$;
  const groundThickness = GroundParams.groundThickness;
  const groundRoundness = GroundParams.groundRoundness;

  let dist = std.min(
    sdf.sdPlane(position, d.vec3f(0, 1, 0), 0.1), // the plane underneath the jelly
    sdf.opExtrudeY(
      position,
      -sdFloorCutout(position.xz),
      groundThickness - groundRoundness,
    ) - groundRoundness,
  );

  // Axis
  dist = std.min(
    dist,
    sdArrowHead(
      rotateY(
        position.sub(d.vec3f(0, 0.5, 0)),
        -state.topProgress * Math.PI,
      ),
    ),
  );

  return dist;
};

const sdMeter = (position: d.v3f) => {
  'use gpu';
  return sdf.sdPlane(position, d.vec3f(0, 1, 0), 0.05);
};

const getMeterDist = (position: d.v3f) => {
  'use gpu';
  return sdMeter(position);
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
const rotateY = (p: d.v3f, angle: number) => {
  'use gpu';
  return std.add(
    std.mix(d.vec3f(0, p.y, 0), p, std.cos(angle)),
    std.cross(p, d.vec3f(0, 1, 0)).mul(std.sin(angle)),
  );
};

/**
 * Returns a transformed position.
 */
const opTwist = (p: d.v3f, k: number): d.v3f => {
  'use gpu';
  const c = std.cos(k * p.y);
  const s = std.sin(k * p.y);
  const m = d.mat2x2f(c, -s, s, c);
  return d.vec3f(m.mul(p.xz), p.y);
};

const getJellySegment = (position: d.v3f) => {
  'use gpu';
  return sdf.sdRoundedBox3d(
    opCheapBend(opCheapBend(position, 0.8).zyx, 0.8).zyx,
    JELLY_HALFSIZE.sub(0.1 / 2),
    0.1,
  );
};

const getJellyDist = (position: d.v3f) => {
  'use gpu';
  const state = knobBehavior.stateUniform.$;
  const origin = d.vec3f(0, 0.18, 0);
  const twist = state.bottomProgress - state.topProgress;
  let localPos = rotateY(
    position.sub(origin),
    -(state.topProgress + twist * 0.5) * Math.PI,
  );
  localPos = opTwist(localPos, twist * 3).xzy;
  const rotated1Pos = rotateY(localPos, Math.PI / 6);
  const rotated2Pos = rotateY(localPos, Math.PI / 3);

  return sdf.opSmoothUnion(
    getJellySegment(localPos),
    sdf.opSmoothUnion(
      getJellySegment(rotated1Pos),
      getJellySegment(rotated2Pos),
      0.01,
    ),
    0.01,
  );
};

const getSceneDist = (position: d.v3f) => {
  'use gpu';
  const jelly = getJellyDist(position);
  const meter = getMeterDist(position);
  const mainScene = getBackgroundDist(position);

  const hitInfo = HitInfo();
  hitInfo.distance = 1e30;

  if (jelly < hitInfo.distance) {
    hitInfo.distance = jelly;
    hitInfo.objectType = ObjectType.JELLY;
  }
  if (meter < hitInfo.distance) {
    hitInfo.distance = mainScene;
    hitInfo.objectType = ObjectType.PROGRESS_METER;
  }
  if (mainScene < hitInfo.distance) {
    hitInfo.distance = mainScene;
    hitInfo.objectType = ObjectType.BACKGROUND;
  }

  return hitInfo;
};

const getSceneDistForAO = (position: d.v3f) => {
  'use gpu';
  const mainScene = getBackgroundDist(position);
  const jelly = getJellyDist(position);
  return std.min(mainScene, jelly);
};

const getApproxNormal = (position: d.v3f, epsilon: number): d.v3f => {
  'use gpu';
  const k = d.vec3f(1, -1, 0);

  const offset1 = k.xyy.mul(epsilon);
  const offset2 = k.yyx.mul(epsilon);
  const offset3 = k.yxy.mul(epsilon);
  const offset4 = k.xxx.mul(epsilon);

  const sample1 = offset1.mul(getSceneDist(position.add(offset1)).distance);
  const sample2 = offset2.mul(getSceneDist(position.add(offset2)).distance);
  const sample3 = offset3.mul(getSceneDist(position.add(offset3)).distance);
  const sample4 = offset4.mul(getSceneDist(position.add(offset4)).distance);

  const gradient = sample1.add(sample2).add(sample3).add(sample4);

  return std.normalize(gradient);
};

const sqLength = (a: d.v2f | d.v3f) => {
  'use gpu';
  return std.dot(a, a);
};

const getFakeShadow = (
  position: d.v3f,
  lightDir: d.v3f,
): d.v3f => {
  'use gpu';
  if (position.y < -GroundParams.groundThickness) {
    // Applying darkening under the ground (the shadow cast by the upper ground layer)
    const fadeSharpness = 30;
    const inset = 0.02;
    const cutout = sdFloorCutout(position.xz) + inset;
    const edgeDarkening = std.saturate(1 - cutout * fadeSharpness);

    // Applying a slight gradient based on the light direction
    const lightGradient = std.saturate(-position.z * 4 * lightDir.z + 1);

    return d.vec3f(1).mul(edgeDarkening).mul(lightGradient * 0.5);
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
    const occlusionContribution = std.max(
      0.0,
      sampleHeight - distanceToSurface,
    );
    totalOcclusion += occlusionContribution * sampleWeight;
    sampleWeight *= 0.5;
    if (totalOcclusion > AO_RADIUS / AO_INTENSITY) {
      break;
    }
  }

  const rawAO = 1.0 - (AO_INTENSITY * totalOcclusion) / AO_RADIUS;
  return std.saturate(rawAO);
};

const calculateLighting = (
  hitPosition: d.v3f,
  normal: d.v3f,
  rayOrigin: d.v3f,
) => {
  'use gpu';
  const lightDir = std.neg(lightUniform.$.direction);

  const fakeShadow = getFakeShadow(hitPosition, lightDir);
  const diffuse = std.max(std.dot(normal, lightDir), 0.0);

  const viewDir = std.normalize(rayOrigin.sub(hitPosition));
  const reflectDir = std.reflect(std.neg(lightDir), normal);
  const specularFactor = std.max(std.dot(viewDir, reflectDir), 0) **
    SPECULAR_POWER;
  const specular = lightUniform.$.color.mul(
    specularFactor * SPECULAR_INTENSITY,
  );

  const baseColor = d.vec3f(0.9);

  const directionalLight = baseColor
    .mul(lightUniform.$.color)
    .mul(diffuse)
    .mul(fakeShadow);
  const ambientLight = baseColor.mul(AMBIENT_COLOR).mul(AMBIENT_INTENSITY);

  const finalSpecular = specular.mul(fakeShadow);

  return std.saturate(directionalLight.add(ambientLight).add(finalSpecular));
};

const applyAO = (
  litColor: d.v3f,
  hitPosition: d.v3f,
  normal: d.v3f,
) => {
  'use gpu';
  const ao = calculateAO(hitPosition, normal);
  const finalColor = litColor.mul(ao);
  return d.vec4f(finalColor, 1.0);
};

// AAA what the hell is this
const rayMarchNoJelly = (rayOrigin: d.v3f, rayDirection: d.v3f) => {
  'use gpu';
  let distanceFromOrigin = d.f32();
  let hit = d.f32();

  for (let i = 0; i < 6; i++) {
    const p = rayOrigin.add(rayDirection.mul(distanceFromOrigin));
    hit = getBackgroundDist(p);
    distanceFromOrigin += hit;
    if (distanceFromOrigin > MAX_DIST || hit < SURF_DIST * 10) {
      break;
    }
  }

  if (distanceFromOrigin < MAX_DIST) {
    return renderBackground(
      rayOrigin,
      rayDirection,
      distanceFromOrigin,
    ).xyz;
  }
  return d.vec3f();
};

const renderBackground = (
  rayOrigin: d.v3f,
  rayDirection: d.v3f,
  backgroundHitDist: number,
) => {
  'use gpu';
  const state = knobBehavior.stateUniform.$;
  const hitPosition = rayOrigin.add(rayDirection.mul(backgroundHitDist));

  let offsetX = d.f32();
  let offsetZ = d.f32(0.05);

  const lightDir = lightUniform.$.direction;
  const causticScale = 0.2;
  offsetX -= lightDir.x * causticScale;
  offsetZ += lightDir.z * causticScale;

  const newNormal = getApproxNormal(hitPosition, 1e-4);

  // Calculate fake bounce lighting
  const switchX = 0;
  const jellyColor = jellyColorUniform.$;
  const sqDist = sqLength(hitPosition.sub(d.vec3f(switchX, 0, 0)));
  const bounceLight = jellyColor.xyz.mul(1 / (sqDist * 15 + 1) * 0.4);
  const sideBounceLight = jellyColor.xyz
    .mul(1 / (sqDist * 40 + 1) * 0.3)
    .mul(std.abs(newNormal.z));
  const emission = 1 + d.f32(state.topProgress) * 2;

  const litColor = calculateLighting(hitPosition, newNormal, rayOrigin);
  const albedo = std.select(
    LIGHT_GROUND_ALBEDO,
    DARK_GROUND_ALBEDO,
    darkModeUniform.$ === 1,
  );

  const backgroundColor = applyAO(
    albedo.mul(litColor),
    hitPosition,
    newNormal,
  )
    .add(d.vec4f(bounceLight.mul(emission), 0))
    .add(d.vec4f(sideBounceLight.mul(emission), 0));

  return d.vec4f(backgroundColor.xyz, 1);
};

const rayMarch = (rayOrigin: d.v3f, rayDirection: d.v3f, uv: d.v2f) => {
  'use gpu';
  // first, generate the scene without a jelly

  let sceneDist = d.f32();
  let point = d.vec3f();
  for (let i = 0; i < MAX_STEPS; i++) {
    point = rayOrigin.add(rayDirection.mul(sceneDist));
    const hit = std.min(getBackgroundDist(point), getMeterDist(point));
    sceneDist += hit;
    if (hit < SURF_DIST) {
      break;
    }
  }
  let scene = d.vec4f();
  if (getBackgroundDist(point) < SURF_DIST) {
    scene = renderBackground(rayOrigin, rayDirection, sceneDist);
  } else {
    scene = d.vec4f(0, 1, 0, 1);
  }

  // second, generate the jelly
  const bbox = getJellyBounds();
  const intersection = intersectBox(rayOrigin, rayDirection, bbox);

  if (!intersection.hit) {
    return scene;
  }

  let distanceFromOrigin = std.max(d.f32(0.0), intersection.tMin);

  for (let i = 0; i < MAX_STEPS; i++) {
    const currentPosition = rayOrigin.add(rayDirection.mul(distanceFromOrigin));

    const hitInfo = getSceneDist(currentPosition);
    distanceFromOrigin += hitInfo.distance;

    if (hitInfo.distance < SURF_DIST) {
      const hitPosition = rayOrigin.add(rayDirection.mul(distanceFromOrigin));

      if (!(hitInfo.objectType === ObjectType.JELLY)) {
        break;
      }

      const N = getApproxNormal(hitPosition, 1e-4);
      const I = rayDirection;
      const cosi = std.min(
        1.0,
        std.max(0.0, std.dot(std.neg(I), N)),
      );
      const F = fresnelSchlick(cosi, d.f32(1.0), d.f32(JELLY_IOR));

      const reflection = std.saturate(d.vec3f(hitPosition.y + 0.2));

      const eta = 1.0 / JELLY_IOR;
      const k = 1.0 - eta * eta * (1.0 - cosi * cosi);
      let refractedColor = d.vec3f();
      if (k > 0.0) {
        const refrDir = std.normalize(
          std.add(I.mul(eta), N.mul(eta * cosi - std.sqrt(k))),
        );
        const p = hitPosition.add(refrDir.mul(SURF_DIST * 2.0));
        const exitPos = p.add(refrDir.mul(SURF_DIST * 2.0));

        const env = rayMarchNoJelly(exitPos, refrDir);
        const jellyColor = jellyColorUniform.$;

        const scatterTint = jellyColor.xyz.mul(1.5);
        const density = d.f32(20.0);
        const absorb = d.vec3f(1.0).sub(jellyColor.xyz).mul(density);

        const state = knobBehavior.stateUniform.$;
        const rotPos = rotateY(hitPosition, -state.topProgress * Math.PI);
        const progress = std.saturate(
          std.mix(
            1,
            0.2,
            -rotPos.x * 5 + 1.5,
          ),
        );
        const T = beerLambert(absorb.mul(progress ** 2), 0.08);

        const lightDir = std.neg(lightUniform.$.direction);

        const forward = std.max(0.0, std.dot(lightDir, refrDir));
        const scatter = scatterTint.mul(
          JELLY_SCATTER_STRENGTH * forward * progress ** 3,
        );
        refractedColor = env.mul(T).add(scatter);
      }

      const jelly = std.add(
        reflection.mul(F),
        refractedColor.mul(1 - F),
      );

      return d.vec4f(jelly, 1.0);
    }

    if (distanceFromOrigin > sceneDist) {
      break;
    }
  }

  return scene;
};

const raymarchFn = tgpu['~unstable'].fragmentFn({
  in: {
    uv: d.vec2f,
  },
  out: d.vec4f,
})(({ uv }) => {
  randf.seed2(randomUniform.$.mul(uv));

  const ndc = d.vec2f(uv.x * 2 - 1, -(uv.y * 2 - 1));
  const ray = getRay(ndc);

  const color = rayMarch(
    ray.origin,
    ray.direction,
    uv,
  );

  const exposure = std.select(1.5, 3, darkModeUniform.$ === 1);
  return d.vec4f(std.tanh(std.pow(color.xyz.mul(exposure), d.vec3f(1.2))), 1);
});

const fragmentMain = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  return std.textureSample(
    sampleLayout.$.currentTexture,
    filteringSampler.$,
    input.uv,
  );
});

const rayMarchPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(raymarchFn, { format: 'rgba8unorm' })
  .createPipeline();

const renderPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .createPipeline();

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
      })
    ),
  };
}

let bindGroups = createBindGroups();

function render(timestamp: number) {
  frameCount++;
  camera.jitter();
  const deltaTime = Math.min((timestamp - lastTimeStamp) * 0.001, 0.1);
  lastTimeStamp = timestamp;

  randomUniform.write(
    d.vec2f((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2),
  );

  knobBehavior.update(deltaTime);

  const currentFrame = frameCount % 2;

  rayMarchPipeline
    .withColorAttachment({
      view: root.unwrap(textures[currentFrame].sampled),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  taaResolver.resolve(
    textures[currentFrame].sampled,
    frameCount,
    currentFrame,
  );

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(bindGroups.render[currentFrame])
    .draw(3);

  requestAnimationFrame(render);
}

function handleResize() {
  [width, height] = [
    canvas.width * qualityScale,
    canvas.height * qualityScale,
  ];
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

requestAnimationFrame(render);

// #region Example controls and cleanup

let prevX = 0;

canvas.addEventListener('touchstart', (event) => {
  knobBehavior.pressed = true;
  event.preventDefault();
  prevX = event.touches[0].clientX;
});

canvas.addEventListener('touchend', (event) => {
  knobBehavior.pressed = false;
  knobBehavior.toggled = !knobBehavior.toggled;
});

canvas.addEventListener('touchmove', (event) => {
  if (!knobBehavior.pressed) return;
  event.preventDefault();
  const x = event.touches[0].clientX;
  knobBehavior.progress += (x - prevX) / canvas.clientHeight * 2;
  prevX = x;
});

canvas.addEventListener('mousedown', (event) => {
  knobBehavior.pressed = true;
  event.preventDefault();
  prevX = event.clientX;
});

canvas.addEventListener('mouseup', (event) => {
  knobBehavior.pressed = false;
  knobBehavior.toggled = !knobBehavior.toggled;
  event.stopPropagation();
});

window.addEventListener('mouseup', (event) => {
  knobBehavior.pressed = false;
});

canvas.addEventListener('mousemove', (event) => {
  if (!knobBehavior.pressed) return;
  event.preventDefault();
  const x = event.clientX;
  knobBehavior.progress += (x - prevX) / canvas.clientHeight * 2;
  prevX = x;
});

async function autoSetQuaility() {
  if (!hasTimestampQuery) {
    return 0.5;
  }

  const targetFrameTime = 5;
  const tolerance = 2.0;
  let resolutionScale = 0.3;
  let lastTimeMs = 0;

  const measurePipeline = rayMarchPipeline
    .withPerformanceCallback((start, end) => {
      lastTimeMs = Number(end - start) / 1e6;
    });

  for (let i = 0; i < 8; i++) {
    const testTexture = root['~unstable'].createTexture({
      size: [canvas.width * resolutionScale, canvas.height * resolutionScale],
      format: 'rgba8unorm',
    }).$usage('render');

    measurePipeline
      .withColorAttachment({
        view: root.unwrap(testTexture).createView(),
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
    resolutionScale = Math.max(
      0.3,
      Math.min(1.0, resolutionScale + adjustment),
    );
  }

  console.log(`Auto-selected quality scale: ${resolutionScale.toFixed(2)}`);
  return resolutionScale;
}

export const controls = {
  'Quality': {
    initial: 'Auto',
    options: [
      'Auto',
      'Very Low',
      'Low',
      'Medium',
      'High',
      'Ultra',
    ],
    onSelectChange: (value: string) => {
      if (value === 'Auto') {
        autoSetQuaility().then((scale) => {
          qualityScale = scale;
          handleResize();
        });
        return;
      }

      const qualityMap: { [key: string]: number } = {
        'Very Low': 0.3,
        'Low': 0.5,
        'Medium': 0.7,
        'High': 0.85,
        'Ultra': 1.0,
      };

      qualityScale = qualityMap[value] || 0.5;
      handleResize();
    },
  },
  'Jelly Color': {
    // initial: [0.63, 0.08, 1],
    initial: [1.0, 0.35, 0.075],
    onColorChange: (c: [number, number, number]) => {
      jellyColorUniform.write(d.vec4f(...c, 1.0));
    },
  },
  'Dark Mode': {
    initial: true,
    onToggleChange: (v: boolean) => {
      darkModeUniform.write(d.u32(v));
      lightUniform.writePartial({
        direction: v ? DARK_MODE_LIGHT_DIR : LIGHT_MODE_LIGHT_DIR,
      });
    },
  },
};

export function onCleanup() {
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
