import type { TgpuRoot } from 'typegpu';
import { tgpu, d, std } from 'typegpu';

export type SimulationParams = {
  dt: number;
  viscosity: number;
  jacobiIter: number;
  paused: boolean;
};

export type BrushState = {
  pos: [number, number];
  delta: [number, number];
};

export const N = 2048;
export const SIM_N = N / 4;
export const [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y] = [16, 16];
export const FORCE_SCALE = 1;
export const RADIUS = SIM_N / 16;
export const INK_AMOUNT = 0.02;

export const params: SimulationParams = {
  dt: 0.3,
  viscosity: 0.000001,
  jacobiIter: 10,
  paused: false,
};

export const BrushParams = d.struct({
  pos: d.vec2i,
  delta: d.vec2f,
  radius: d.f32,
  forceScale: d.f32,
  inkAmount: d.f32,
});

export const ShaderParams = d.struct({
  dt: d.f32,
  viscosity: d.f32,
});

export const renderFluidSimLayout = tgpu.bindGroupLayout({
  inkTexture: { texture: d.texture2d() },
});

function getNeighbors(coords: d.v2i, bounds: d.v2i): d.v2i[] {
  'use gpu';
  const adjacentOffsets = [d.vec2i(-1, 0), d.vec2i(0, -1), d.vec2i(1, 0), d.vec2i(0, 1)];
  for (const i of tgpu.unroll(std.range(4))) {
    adjacentOffsets[i] = std.clamp(coords + adjacentOffsets[i], d.vec2i(), bounds - d.vec2i(1));
  }
  return adjacentOffsets;
}

export const brushLayout = tgpu.bindGroupLayout({
  brushParams: { uniform: BrushParams },
  forceDst: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
  inkDst: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

export const brushFn = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  'use gpu';
  const pixelPos = input.gid.xy;
  const brushSettings = brushLayout.$.brushParams;

  let forceVec = d.vec2f(0.0);
  let inkAmount = d.f32(0.0);

  const deltaX = d.f32(pixelPos.x) - d.f32(brushSettings.pos.x);
  const deltaY = d.f32(pixelPos.y) - d.f32(brushSettings.pos.y);
  const distSquared = deltaX * deltaX + deltaY * deltaY;
  const radiusSquared = brushSettings.radius * brushSettings.radius;

  if (distSquared < radiusSquared) {
    const brushWeight = std.exp(-distSquared / radiusSquared);
    forceVec = brushSettings.forceScale * brushWeight * brushSettings.delta;
    inkAmount = brushSettings.inkAmount * brushWeight;
  }

  std.textureStore(brushLayout.$.forceDst, pixelPos, d.vec4f(forceVec, 0.0, 1.0));
  std.textureStore(brushLayout.$.inkDst, pixelPos, d.vec4f(inkAmount, 0.0, 0.0, 1.0));
});

export const addForcesLayout = tgpu.bindGroupLayout({
  src: { texture: d.texture2d(d.f32) },
  dst: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
  force: { texture: d.texture2d(d.f32) },
  simParams: { uniform: ShaderParams },
});

export const addForcesFn = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  'use gpu';
  const pixelPos = input.gid.xy;
  const currentVel = std.textureLoad(addForcesLayout.$.src, pixelPos, 0).xy;
  const forceVec = std.textureLoad(addForcesLayout.$.force, pixelPos, 0).xy;
  const timeStep = addForcesLayout.$.simParams.dt;
  const newVel = currentVel + timeStep * forceVec;
  std.textureStore(addForcesLayout.$.dst, pixelPos, d.vec4f(newVel, 0, 1));
});

export const advectLayout = tgpu.bindGroupLayout({
  src: { texture: d.texture2d(d.f32) },
  dst: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
  simParams: { uniform: ShaderParams },
  linSampler: { sampler: 'filtering' },
});

export const advectFn = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  'use gpu';
  const texSize = std.textureDimensions(advectLayout.$.src);
  const pixelPos = input.gid.xy;

  if (
    pixelPos.x >= texSize.x - 1 ||
    pixelPos.y >= texSize.y - 1 ||
    pixelPos.x <= 0 ||
    pixelPos.y <= 0
  ) {
    std.textureStore(advectLayout.$.dst, pixelPos, d.vec4f(0, 0, 0, 1));
    return;
  }

  const velocity = std.textureLoad(advectLayout.$.src, pixelPos, 0);
  const timeStep = advectLayout.$.simParams.dt;
  const prevPos = d.vec2f(pixelPos) - timeStep * velocity.xy;
  const clampedPos = std.clamp(prevPos, d.vec2f(-0.5), d.vec2f(texSize.xy) - 0.5);
  const normalizedPos = std.div(clampedPos + 0.5, d.vec2f(texSize.xy));

  const prevVelocity = std.textureSampleLevel(
    advectLayout.$.src,
    advectLayout.$.linSampler,
    normalizedPos,
    0,
  );

  // Slowing the ink down synthetically
  const slowedVelocity = prevVelocity * 0.999;
  std.textureStore(advectLayout.$.dst, pixelPos, slowedVelocity);
});

export const diffusionLayout = tgpu.bindGroupLayout({
  in: { texture: d.texture2d(d.f32) },
  out: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
  simParams: { uniform: ShaderParams },
});

export const diffusionFn = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  'use gpu';
  const pixelPos = d.vec2i(input.gid.xy);
  const texSize = d.vec2i(std.textureDimensions(diffusionLayout.$.in));
  const centerVal = std.textureLoad(diffusionLayout.$.in, pixelPos, 0);

  const neighbors = getNeighbors(pixelPos, texSize);

  const leftVal = std.textureLoad(diffusionLayout.$.in, neighbors[0], 0);
  const upVal = std.textureLoad(diffusionLayout.$.in, neighbors[1], 0);
  const rightVal = std.textureLoad(diffusionLayout.$.in, neighbors[2], 0);
  const downVal = std.textureLoad(diffusionLayout.$.in, neighbors[3], 0);

  const timeStep = diffusionLayout.$.simParams.dt;
  const viscosity = diffusionLayout.$.simParams.viscosity;

  const diffuseRate = viscosity * timeStep;
  const blendFactor = 1.0 / (4.0 + diffuseRate);
  const diffusedVal =
    d.vec4f(blendFactor) *
    (leftVal + rightVal + (upVal + downVal) + d.f32(diffuseRate) * centerVal);

  std.textureStore(diffusionLayout.$.out, pixelPos, diffusedVal);
});

export const divergenceLayout = tgpu.bindGroupLayout({
  vel: { texture: d.texture2d(d.f32) },
  div: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

export const divergenceFn = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const pixelPos = d.vec2i(input.gid.xy);
  const texSize = d.vec2i(std.textureDimensions(divergenceLayout.$.vel));

  const neighbors = getNeighbors(pixelPos, texSize);

  const leftVel = std.textureLoad(divergenceLayout.$.vel, neighbors[0], 0);
  const upVel = std.textureLoad(divergenceLayout.$.vel, neighbors[1], 0);
  const rightVel = std.textureLoad(divergenceLayout.$.vel, neighbors[2], 0);
  const downVel = std.textureLoad(divergenceLayout.$.vel, neighbors[3], 0);

  const divergence = 0.5 * (rightVel.x - leftVel.x + (downVel.y - upVel.y));
  std.textureStore(divergenceLayout.$.div, pixelPos, d.vec4f(divergence, 0, 0, 1));
});

export const pressureLayout = tgpu.bindGroupLayout({
  x: { texture: d.texture2d(d.f32) },
  b: { texture: d.texture2d(d.f32) },
  out: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

export const pressureFn = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const pixelPos = d.vec2i(input.gid.xy);
  const texSize = d.vec2i(std.textureDimensions(pressureLayout.$.x));

  const neighbors = getNeighbors(pixelPos, texSize);

  const leftPressure = std.textureLoad(pressureLayout.$.x, neighbors[0], 0);
  const upPressure = std.textureLoad(pressureLayout.$.x, neighbors[1], 0);
  const rightPressure = std.textureLoad(pressureLayout.$.x, neighbors[2], 0);
  const downPressure = std.textureLoad(pressureLayout.$.x, neighbors[3], 0);

  const divergence = std.textureLoad(pressureLayout.$.b, pixelPos, 0).x;
  const newPressure =
    d.f32(0.25) * (leftPressure.x + rightPressure.x + upPressure.x + downPressure.x - divergence);
  std.textureStore(pressureLayout.$.out, pixelPos, d.vec4f(newPressure, 0, 0, 1));
});

export const projectLayout = tgpu.bindGroupLayout({
  vel: { texture: d.texture2d(d.f32) },
  p: { texture: d.texture2d(d.f32) },
  out: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

export const projectFn = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  'use gpu';
  const pixelPos = d.vec2i(input.gid.xy);
  const texSize = d.vec2i(std.textureDimensions(projectLayout.$.vel));
  const velocity = std.textureLoad(projectLayout.$.vel, pixelPos, 0);

  const neighbors = getNeighbors(pixelPos, texSize);

  const leftPressure = std.textureLoad(projectLayout.$.p, neighbors[0], 0);
  const upPressure = std.textureLoad(projectLayout.$.p, neighbors[1], 0);
  const rightPressure = std.textureLoad(projectLayout.$.p, neighbors[2], 0);
  const downPressure = std.textureLoad(projectLayout.$.p, neighbors[3], 0);

  const pressureGrad = d.vec2f(
    0.5 * (rightPressure.x - leftPressure.x),
    0.5 * (downPressure.x - upPressure.x),
  );
  const projectedVel = velocity.xy - pressureGrad;
  std.textureStore(projectLayout.$.out, pixelPos, d.vec4f(projectedVel, 0, 1));
});

export const advectInkLayout = tgpu.bindGroupLayout({
  vel: { texture: d.texture2d(d.f32) },
  src: { texture: d.texture2d(d.f32) },
  dst: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
  simParams: { uniform: ShaderParams },
  linSampler: { sampler: 'filtering' },
});

export const advectInkFn = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  'use gpu';
  const texSize = std.textureDimensions(advectInkLayout.$.src);
  const pixelPos = input.gid.xy;

  const velocity = std.textureLoad(advectInkLayout.$.vel, pixelPos, 0).xy;
  const timeStep = advectInkLayout.$.simParams.dt;
  const prevPos = d.vec2f(pixelPos) - timeStep * velocity;
  const clampedPos = std.clamp(prevPos, d.vec2f(-0.5), d.vec2f(texSize.xy) - d.vec2f(0.5));
  const normalizedPos = (clampedPos + d.vec2f(0.5)) / d.vec2f(texSize.xy);

  const inkVal = std.textureSampleLevel(
    advectInkLayout.$.src,
    advectInkLayout.$.linSampler,
    normalizedPos,
    0,
  );
  // Removing ink after a while
  const decayedInk = inkVal * 0.99;
  std.textureStore(advectInkLayout.$.dst, pixelPos, decayedInk);
});

export const addInkLayout = tgpu.bindGroupLayout({
  src: { texture: d.texture2d(d.f32) },
  dst: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
  add: { texture: d.texture2d(d.f32) },
});

export const addInkFn = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const pixelPos = input.gid.xy;
  const addVal = std.textureLoad(addInkLayout.$.add, pixelPos, 0).x;
  const srcVal = std.textureLoad(addInkLayout.$.src, pixelPos, 0).x;
  std.textureStore(addInkLayout.$.dst, pixelPos, d.vec4f(addVal + srcVal, 0, 0, 1));
});

class DoubleBuffer<T> {
  buffers: [T, T];
  index: number;
  constructor(bufferA: T, bufferB: T, initialIndex = 0) {
    this.buffers = [bufferA, bufferB];
    this.index = initialIndex;
  }

  get current(): T {
    return this.buffers[this.index];
  }
  get currentIndex(): number {
    return this.index;
  }

  swap(): void {
    this.index ^= 1;
  }
  setCurrent(index: number): void {
    this.index = index;
  }
}

export function createFluidSim(root: TgpuRoot, canvas: HTMLCanvasElement) {
  // Helpers
  function createField(name: string) {
    return root
      .createTexture({ size: [SIM_N, SIM_N], format: 'rgba16float' })
      .$usage('storage', 'sampled')
      .$name(name);
  }

  function toGrid(x: number, y: number): [number, number] {
    const gx = Math.floor((x / canvas.width) * SIM_N);
    const gy = Math.floor(((canvas.height - y) / canvas.height) * SIM_N);
    return [gx, gy];
  }

  // Buffers and brush state
  const simParamBuffer = root
    .createBuffer(ShaderParams, {
      dt: params.dt,
      viscosity: params.viscosity,
    })
    .$usage('uniform');

  const brushParamBuffer = root
    .createBuffer(BrushParams, {
      pos: d.vec2i(0, 0),
      delta: d.vec2f(0, 0),
      radius: RADIUS,
      forceScale: FORCE_SCALE,
      inkAmount: INK_AMOUNT,
    })
    .$usage('uniform');

  const brushState: BrushState = {
    pos: [0, 0],
    delta: [0, 0],
  };

  // Create simulation textures
  const velTex = [createField('velocity0'), createField('velocity1')];
  const inkTex = [createField('density0'), createField('density1')];
  const pressureTex = [createField('pressure0'), createField('pressure1')];

  const newInkTex = createField('addedInk');
  const forceTex = createField('force');
  const divergenceTex = createField('divergence');

  const linSampler = root.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // Create compute pipelines
  const brushPipeline = root.createComputePipeline({ compute: brushFn });
  const addForcePipeline = root.createComputePipeline({ compute: addForcesFn });
  const advectPipeline = root.createComputePipeline({ compute: advectFn });
  const diffusionPipeline = root.createComputePipeline({ compute: diffusionFn });
  const divergencePipeline = root.createComputePipeline({ compute: divergenceFn });
  const pressurePipeline = root.createComputePipeline({ compute: pressureFn });
  const projectPipeline = root.createComputePipeline({ compute: projectFn });
  const advectInkPipeline = root.createComputePipeline({ compute: advectInkFn });
  const addInkPipeline = root.createComputePipeline({ compute: addInkFn });

  // Setup simulation buffers
  const velBuffer = new DoubleBuffer(velTex[0], velTex[1]);
  const inkBuffer = new DoubleBuffer(inkTex[0], inkTex[1]);
  const pressureBuffer = new DoubleBuffer(pressureTex[0], pressureTex[1]);

  const dispatchX = Math.ceil(SIM_N / WORKGROUP_SIZE_X);
  const dispatchY = Math.ceil(SIM_N / WORKGROUP_SIZE_Y);

  // Create bind groups
  const brushBindGroup = root.createBindGroup(brushLayout, {
    brushParams: brushParamBuffer,
    forceDst: forceTex.createView(d.textureStorage2d('rgba16float', 'write-only')),
    inkDst: newInkTex.createView(d.textureStorage2d('rgba16float', 'write-only')),
  });

  const addInkBindGroups = [0, 1].map((i) => {
    const srcIdx = i;
    const dstIdx = 1 - i;
    return root.createBindGroup(addInkLayout, {
      src: inkTex[srcIdx].createView(d.texture2d(d.f32)),
      add: newInkTex.createView(d.texture2d(d.f32)),
      dst: inkTex[dstIdx].createView(d.textureStorage2d('rgba16float', 'write-only')),
    });
  });

  const addForceBindGroups = [0, 1].map((i) => {
    const srcIdx = i;
    const dstIdx = 1 - i;
    return root.createBindGroup(addForcesLayout, {
      src: velTex[srcIdx].createView(d.texture2d(d.f32)),
      force: forceTex.createView(d.texture2d(d.f32)),
      dst: velTex[dstIdx].createView(d.textureStorage2d('rgba16float', 'write-only')),
      simParams: simParamBuffer,
    });
  });

  const advectBindGroups = [0, 1].map((i) => {
    const srcIdx = 1 - i;
    const dstIdx = i;
    return root.createBindGroup(advectLayout, {
      src: velTex[srcIdx].createView(d.texture2d(d.f32)),
      dst: velTex[dstIdx].createView(d.textureStorage2d('rgba16float', 'write-only')),
      simParams: simParamBuffer,
      linSampler,
    });
  });

  const diffusionBindGroups = [0, 1].map((i) => {
    const srcIdx = i;
    const dstIdx = 1 - i;
    return root.createBindGroup(diffusionLayout, {
      in: velTex[srcIdx].createView(d.texture2d(d.f32)),
      out: velTex[dstIdx].createView(d.textureStorage2d('rgba16float', 'write-only')),
      simParams: simParamBuffer,
    });
  });

  const divergenceBindGroups = [0, 1].map((i) => {
    const srcIdx = i;
    return root.createBindGroup(divergenceLayout, {
      vel: velTex[srcIdx].createView(d.texture2d(d.f32)),
      div: divergenceTex.createView(d.textureStorage2d('rgba16float', 'write-only')),
    });
  });

  const pressureBindGroups = [0, 1].map((i) => {
    const srcIdx = i;
    const dstIdx = 1 - i;
    return root.createBindGroup(pressureLayout, {
      x: pressureTex[srcIdx].createView(d.texture2d(d.f32)),
      b: divergenceTex.createView(d.texture2d(d.f32)),
      out: pressureTex[dstIdx].createView(d.textureStorage2d('rgba16float', 'write-only')),
    });
  });

  const projectBindGroups = [0, 1].map((velIdx) =>
    [0, 1].map((pIdx) => {
      const srcVelIdx = velIdx;
      const dstVelIdx = 1 - velIdx;
      const srcPIdx = pIdx;
      return root.createBindGroup(projectLayout, {
        vel: velTex[srcVelIdx].createView(d.texture2d(d.f32)),
        p: pressureTex[srcPIdx].createView(d.texture2d(d.f32)),
        out: velTex[dstVelIdx].createView(d.textureStorage2d('rgba16float', 'write-only')),
      });
    }),
  );

  const advectInkBindGroups = [0, 1].map((velIdx) =>
    [0, 1].map((inkIdx) => {
      const srcVelIdx = velIdx;
      const srcInkIdx = inkIdx;
      const dstInkIdx = 1 - inkIdx;
      return root.createBindGroup(advectInkLayout, {
        vel: velTex[srcVelIdx].createView(d.texture2d(d.f32)),
        src: inkTex[srcInkIdx].createView(d.texture2d(d.f32)),
        dst: inkTex[dstInkIdx].createView(d.textureStorage2d('rgba16float', 'write-only')),
        simParams: simParamBuffer,
        linSampler,
      });
    }),
  );

  const onMouseDown = (e: MouseEvent) => {
    const x = e.offsetX * devicePixelRatio;
    const y = e.offsetY * devicePixelRatio;

    brushState.pos = toGrid(x, y);
    brushState.delta = [0, 0];
  };
  canvas.addEventListener('mousedown', onMouseDown);

  const onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * devicePixelRatio;
    const y = (touch.clientY - rect.top) * devicePixelRatio;
    brushState.pos = toGrid(x, y);
    brushState.delta = [0, 0];
  };
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });

  const onMouseMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * devicePixelRatio;
    const y = (e.clientY - rect.top) * devicePixelRatio;
    const [newX, newY] = toGrid(x, y);
    brushState.delta = [newX - brushState.pos[0], newY - brushState.pos[1]];
    brushState.pos = [newX, newY];
  };
  window.addEventListener('mousemove', onMouseMove);

  const onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const x = (touch.clientX - rect.left) * devicePixelRatio;
    const y = (touch.clientY - rect.top) * devicePixelRatio;
    const [newX, newY] = toGrid(x, y);
    brushState.delta = [newX - brushState.pos[0], newY - brushState.pos[1]];
    brushState.pos = [newX, newY];
  };
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });

  const renderBindGroups = [0, 1].map((index) => {
    return root.createBindGroup(renderFluidSimLayout, {
      inkTexture: inkBuffer.buffers[index],
    });
  });

  return {
    update() {
      brushParamBuffer.patch({
        pos: d.vec2i(...brushState.pos),
        delta: d.vec2f(...brushState.delta),
      });

      brushPipeline.with(brushBindGroup).dispatchWorkgroups(dispatchX, dispatchY);

      addInkPipeline
        .with(addInkBindGroups[inkBuffer.currentIndex])
        .dispatchWorkgroups(dispatchX, dispatchY);
      inkBuffer.swap();

      addForcePipeline
        .with(addForceBindGroups[velBuffer.currentIndex])
        .dispatchWorkgroups(dispatchX, dispatchY);

      advectPipeline
        .with(advectBindGroups[velBuffer.currentIndex])
        .dispatchWorkgroups(dispatchX, dispatchY);

      for (let i = 0; i < params.jacobiIter; i++) {
        diffusionPipeline
          .with(diffusionBindGroups[velBuffer.currentIndex])
          .dispatchWorkgroups(dispatchX, dispatchY);
        velBuffer.swap();
      }

      divergencePipeline
        .with(divergenceBindGroups[velBuffer.currentIndex])
        .dispatchWorkgroups(dispatchX, dispatchY);

      pressureBuffer.setCurrent(0);
      for (let i = 0; i < params.jacobiIter; i++) {
        pressurePipeline
          .with(pressureBindGroups[pressureBuffer.currentIndex])
          .dispatchWorkgroups(dispatchX, dispatchY);
        pressureBuffer.swap();
      }

      projectPipeline
        .with(projectBindGroups[velBuffer.currentIndex][pressureBuffer.currentIndex])
        .dispatchWorkgroups(dispatchX, dispatchY);
      velBuffer.swap();

      advectInkPipeline
        .with(advectInkBindGroups[velBuffer.currentIndex][inkBuffer.currentIndex])
        .dispatchWorkgroups(dispatchX, dispatchY);
      inkBuffer.swap();
    },
    get renderBindGroup() {
      return renderBindGroups[inkBuffer.currentIndex];
    },
    destroy() {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mousemove', onMouseMove);

      for (const tex of [
        ...velTex,
        ...inkTex,
        ...pressureTex,
        newInkTex,
        forceTex,
        divergenceTex,
      ]) {
        tex.destroy();
      }
      simParamBuffer.destroy();
      brushParamBuffer.destroy();
    },
  };
}
