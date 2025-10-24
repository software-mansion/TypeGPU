import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { randf } from '@typegpu/noise';

const root = await tgpu.init();
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const resolution = d.vec2f(canvas.width, canvas.height);

const Agent = d.struct({
  position: d.vec2f,
  angle: d.f32,
});

const Params = d.struct({
  moveSpeed: d.f32,
  sensorAngle: d.f32,
  sensorDistance: d.f32,
  turnSpeed: d.f32,
  evaporationRate: d.f32,
});
const defaultParams = {
  moveSpeed: 50.0,
  sensorAngle: 0.5,
  sensorDistance: 15.0,
  turnSpeed: 2.0,
  evaporationRate: 0.05,
};

const NUM_AGENTS = 200_000;
const agentsData = root.createMutable(d.arrayOf(Agent, NUM_AGENTS));

root['~unstable'].prepareDispatch((x) => {
  'use gpu';
  randf.seed(x / NUM_AGENTS + 0.1);
  const pos = randf.inUnitCircle().mul(resolution.x / 2 - 10).add(
    resolution.div(2),
  );
  const angle = std.atan2(
    resolution.y / 2 - pos.y,
    resolution.x / 2 - pos.x,
  );
  agentsData.$[x] = Agent({
    position: pos,
    angle,
  });
}).dispatchThreads(NUM_AGENTS);

const params = root.createUniform(Params, defaultParams);
const deltaTime = root.createUniform(d.f32, 0.016);

const textures = [0, 1].map((i) =>
  root['~unstable']
    .createTexture({
      size: [resolution.x, resolution.y],
      format: 'rgba8unorm',
      mipLevelCount: 1,
    })
    .$usage('sampled', 'storage')
);

const computeLayout = tgpu.bindGroupLayout({
  oldState: { storageTexture: d.textureStorage2d('rgba8unorm', 'read-only') },
  newState: { storageTexture: d.textureStorage2d('rgba8unorm', 'write-only') },
});
const renderLayout = tgpu.bindGroupLayout({
  state: { texture: d.texture2d() },
});

const sense = (pos: d.v2f, angle: number, sensorAngleOffset: number) => {
  'use gpu';
  const sensorAngle = angle + sensorAngleOffset;
  const sensorDir = d.vec2f(std.cos(sensorAngle), std.sin(sensorAngle));
  const sensorPos = pos.add(sensorDir.mul(params.$.sensorDistance));
  const dims = std.textureDimensions(computeLayout.$.oldState);
  const dimsf = d.vec2f(dims);

  const sensorPosInt = d.vec2u(
    std.clamp(sensorPos, d.vec2f(0), dimsf.sub(d.vec2f(1))),
  );
  const color = std.textureLoad(computeLayout.$.oldState, sensorPosInt).xyz;

  return color.x + color.y + color.z;
};

const updateAgents = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [64],
})(({ gid }) => {
  if (gid.x >= NUM_AGENTS) return;

  randf.seed(gid.x / NUM_AGENTS + 0.1);

  const dims = std.textureDimensions(computeLayout.$.oldState);

  const agent = agentsData.$[gid.x];
  const random = randf.sample();

  const weightForward = sense(agent.position, agent.angle, d.f32(0));
  const weightLeft = sense(agent.position, agent.angle, params.$.sensorAngle);
  const weightRight = sense(
    agent.position,
    agent.angle,
    -params.$.sensorAngle,
  );

  let angle = agent.angle;

  if (weightForward > weightLeft && weightForward > weightRight) {
    // Go straight
  } else if (weightForward < weightLeft && weightForward < weightRight) {
    // Turn randomly
    angle = angle + (random * 2 - 1) * params.$.turnSpeed * deltaTime.$;
  } else if (weightRight > weightLeft) {
    // Turn right
    angle = angle - params.$.turnSpeed * deltaTime.$;
  } else if (weightLeft > weightRight) {
    // Turn left
    angle = angle + params.$.turnSpeed * deltaTime.$;
  }

  const dir = d.vec2f(std.cos(angle), std.sin(angle));
  let newPos = agent.position.add(
    dir.mul(params.$.moveSpeed * deltaTime.$),
  );

  const dimsf = d.vec2f(dims);
  if (
    newPos.x < 0 || newPos.x > dimsf.x || newPos.y < 0 || newPos.y > dimsf.y
  ) {
    newPos = std.clamp(newPos, d.vec2f(0), dimsf.sub(d.vec2f(1)));

    if (newPos.x <= 0 || newPos.x >= dimsf.x - 1) {
      angle = Math.PI - angle;
    }
    if (newPos.y <= 0 || newPos.y >= dimsf.y - 1) {
      angle = -angle;
    }

    angle += (random - 0.5) * 0.1;
  }

  agentsData.$[gid.x] = Agent({
    position: newPos,
    angle,
  });

  const oldState =
    std.textureLoad(computeLayout.$.oldState, d.vec2u(newPos)).xyz;
  const newState = oldState.add(d.vec3f(1));
  std.textureStore(
    computeLayout.$.newState,
    d.vec2u(newPos),
    d.vec4f(newState, 1),
  );
});

const blur = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [16, 16],
})(({ gid }) => {
  const dims = std.textureDimensions(computeLayout.$.oldState);
  if (gid.x >= dims.x || gid.y >= dims.y) return;

  let sum = d.vec3f();
  let count = d.f32();

  // 3x3 blur kernel
  for (let offsetY = -1; offsetY <= 1; offsetY++) {
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const samplePos = d.vec2i(gid.xy).add(d.vec2i(offsetX, offsetY));
      const dimsi = d.vec2i(dims);

      if (
        samplePos.x >= 0 && samplePos.x < dimsi.x && samplePos.y >= 0 &&
        samplePos.y < dimsi.y
      ) {
        const color =
          std.textureLoad(computeLayout.$.oldState, d.vec2u(samplePos)).xyz;
        sum = sum.add(color);
        count = count + 1;
      }
    }
  }

  const blurred = sum.div(count);
  const newColor = std.clamp(
    blurred.sub(params.$.evaporationRate),
    d.vec3f(0),
    d.vec3f(1),
  );
  std.textureStore(
    computeLayout.$.newState,
    gid.xy,
    d.vec4f(newColor, 1),
  );
});

const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
  const uv = [d.vec2f(0, 1), d.vec2f(2, 1), d.vec2f(0, -1)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0, 1),
    uv: uv[input.vertexIndex],
  };
});

const filteringSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const fragmentShader = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  return std.textureSample(renderLayout.$.state, filteringSampler.$, uv);
});

const renderPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentShader, { format: presentationFormat })
  .createPipeline();

const computePipeline = root['~unstable']
  .withCompute(updateAgents)
  .createPipeline();

const blurPipeline = root['~unstable']
  .withCompute(blur)
  .createPipeline();

const bindGroups = [0, 1].map((i) =>
  root.createBindGroup(computeLayout, {
    oldState: textures[i],
    newState: textures[1 - i],
  })
);

const renderBindGroups = [0, 1].map((i) =>
  root.createBindGroup(renderLayout, {
    state: textures[i],
  })
);

let lastTime = performance.now();
let currentTexture = 0;

function frame(now: number) {
  const deltaTimeValue = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  deltaTime.write(deltaTimeValue);

  blurPipeline.with(computeLayout, bindGroups[currentTexture])
    .dispatchWorkgroups(
      Math.ceil(resolution.x / 16),
      Math.ceil(resolution.y / 16),
    );

  computePipeline.with(computeLayout, bindGroups[currentTexture])
    .dispatchWorkgroups(
      Math.ceil(NUM_AGENTS / 64),
    );

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(
      renderLayout,
      renderBindGroups[1 - currentTexture],
    ).draw(3);

  root['~unstable'].flush();

  currentTexture = 1 - currentTexture;

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// #region Example controls and cleanup

export const controls = {
  'Move Speed': {
    initial: defaultParams.moveSpeed,
    min: 0,
    max: 100,
    step: 1,
    onSliderChange: (newValue: number) => {
      params.writePartial({ moveSpeed: newValue });
    },
  },
  'Sensor Angle': {
    initial: defaultParams.sensorAngle,
    min: 0,
    max: 3.14,
    step: 0.01,
    onSliderChange: (newValue: number) => {
      params.writePartial({ sensorAngle: newValue });
    },
  },
  'Sensor Distance': {
    initial: defaultParams.sensorDistance,
    min: 1,
    max: 50,
    step: 0.5,
    onSliderChange: (newValue: number) => {
      params.writePartial({ sensorDistance: newValue });
    },
  },
  'Turn Speed': {
    initial: defaultParams.turnSpeed,
    min: 0,
    max: 10,
    step: 0.1,
    onSliderChange: (newValue: number) => {
      params.writePartial({ turnSpeed: newValue });
    },
  },
  'Evaporation Rate': {
    initial: defaultParams.evaporationRate,
    min: 0,
    max: 0.5,
    step: 0.01,
    onSliderChange: (newValue: number) => {
      params.writePartial({ evaporationRate: newValue });
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
