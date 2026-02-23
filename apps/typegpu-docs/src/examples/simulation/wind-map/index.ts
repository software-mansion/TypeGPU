import {
  endCapSlot,
  joinSlot,
  lineSegmentIndicesCapLevel1,
  lineSegmentVariableWidth,
  LineSegmentVertex,
  startCapSlot,
} from '@typegpu/geometry';
import tgpu from 'typegpu';
import {
  arrayOf,
  builtin,
  f32,
  i32,
  struct,
  u16,
  u32,
  vec2f,
  vec4f,
} from 'typegpu/data';
import { lineCaps, lineJoins } from '@typegpu/geometry';
import { add, clamp, mix, mul, normalize, select } from 'typegpu/std';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init({
  adapter: {
    powerPreference: 'high-performance',
  },
});
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const Uniforms = struct({
  stepSize: f32,
  frameCount: u32,
});

const uniformsBuffer = root.createBuffer(Uniforms, {
  stepSize: 0.008,
  frameCount: 0,
}).$usage('uniform');

const PARTICLE_COUNT = 1000;
const TRAIL_LENGTH = 20;

const ParticleTrail = struct({
  positions: arrayOf(vec2f, TRAIL_LENGTH),
});

const particleTrailsBuffer = root.createBuffer(
  arrayOf(ParticleTrail, PARTICLE_COUNT),
  Array.from({ length: PARTICLE_COUNT }).map(() => {
    const x = 0.8 * (2 * Math.random() - 1);
    const y = 0.8 * (2 * Math.random() - 1);
    return {
      positions: Array.from({ length: TRAIL_LENGTH }).map(() => vec2f(x, y)),
    };
  }),
).$usage('storage');

const bindGroupLayout = tgpu.bindGroupLayout({
  uniforms: {
    uniform: Uniforms,
  },
  particles: {
    storage: (n: number) => arrayOf(ParticleTrail, n),
  },
});

const bindGroupLayoutWritable = tgpu.bindGroupLayout({
  uniforms: {
    uniform: Uniforms,
  },
  particles: {
    storage: (n: number) => arrayOf(ParticleTrail, n),
    access: 'mutable',
  },
});

const bindGroup = root.createBindGroup(bindGroupLayout, {
  uniforms: uniformsBuffer,
  particles: particleTrailsBuffer,
});

const bindGroupWritable = root.createBindGroup(bindGroupLayoutWritable, {
  uniforms: uniformsBuffer,
  particles: particleTrailsBuffer,
});

const indexBuffer = root.createBuffer(
  arrayOf(u16, lineSegmentIndicesCapLevel1.length),
  lineSegmentIndicesCapLevel1,
).$usage('index');

// const vectorField = tgpu.fn([vec2f], vec2f)((pos) => {
//   return normalize(perlin2d.sampleWithGradient(pos).yz);
// });

const vectorField = tgpu.fn([vec2f], vec2f)((pos) => {
  return normalize(vec2f(-pos.y, pos.x));
});

const WORKGROUP_SIZE = 64;
const advectCompute = tgpu.computeFn({
  in: { globalInvocationId: builtin.globalInvocationId },
  workgroupSize: [WORKGROUP_SIZE],
})(({ globalInvocationId }) => {
  const stepSize = bindGroupLayoutWritable.$.uniforms.stepSize;
  const frameCount = bindGroupLayoutWritable.$.uniforms.frameCount;
  const particleIndex = globalInvocationId.x;
  const particle = bindGroupLayoutWritable.$.particles[particleIndex];
  const currentPosIndex = frameCount % TRAIL_LENGTH;
  const prevPosIndex = (TRAIL_LENGTH + frameCount - 1) % TRAIL_LENGTH;
  const pos = particle.positions[prevPosIndex];
  const v0 = vectorField(pos);
  const v1 = vectorField(add(pos, mul(v0, 0.5 * stepSize)));
  const newPos = add(pos, mul(v1, stepSize));
  particle.positions[currentPosIndex] = newPos;
  bindGroupLayoutWritable.$.particles[particleIndex] = particle;
});

const lineWidth = tgpu.fn([f32], f32)((x) => 0.004 * (1 - x));

const mainVertex = tgpu.vertexFn({
  in: {
    instanceIndex: builtin.instanceIndex,
    vertexIndex: builtin.vertexIndex,
  },
  out: {
    outPos: builtin.position,
    position: vec2f,
    trailPosition: f32,
  },
})(({ vertexIndex, instanceIndex }) => {
  const frameCount = bindGroupLayout.$.uniforms.frameCount;
  const particleIndex = u32(instanceIndex / TRAIL_LENGTH);
  const trailIndexOriginal = instanceIndex % TRAIL_LENGTH;
  const currentPosIndex = frameCount % TRAIL_LENGTH;
  const trailIndex = i32(TRAIL_LENGTH + currentPosIndex - trailIndexOriginal) %
    TRAIL_LENGTH;

  // disconnect lines
  if (trailIndexOriginal === TRAIL_LENGTH - 1) {
    return {
      outPos: vec4f(),
      position: vec2f(),
      trailPosition: 0,
    };
  }

  const particle = bindGroupLayout.$.particles[particleIndex];
  const iA = select(
    (trailIndex + 1) % TRAIL_LENGTH,
    trailIndex,
    trailIndexOriginal === 0,
  );
  const iB = trailIndex;
  const iC = (TRAIL_LENGTH + trailIndex - 1) % TRAIL_LENGTH;
  const iD = (TRAIL_LENGTH + trailIndex - 2) % TRAIL_LENGTH;
  const A = LineSegmentVertex({
    position: particle.positions[iA],
    radius: lineWidth(f32(trailIndexOriginal) / (TRAIL_LENGTH - 1)),
  });
  const B = LineSegmentVertex({
    position: particle.positions[iB],
    radius: lineWidth(f32(trailIndexOriginal + 1) / (TRAIL_LENGTH - 1)),
  });
  const C = LineSegmentVertex({
    position: particle.positions[iC],
    radius: lineWidth(f32(trailIndexOriginal + 2) / (TRAIL_LENGTH - 1)),
  });
  const D = LineSegmentVertex({
    position: particle.positions[iD],
    radius: lineWidth(f32(trailIndexOriginal + 3) / (TRAIL_LENGTH - 1)),
  });

  const result = lineSegmentVariableWidth(vertexIndex, A, B, C, D);

  return {
    outPos: vec4f(result.vertexPosition, 0, 1),
    position: result.vertexPosition,
    trailPosition: f32(trailIndexOriginal) / (TRAIL_LENGTH - 1),
  };
});

const mainFragment = tgpu.fragmentFn({
  in: {
    position: vec2f,
    trailPosition: f32,
  },
  out: vec4f,
})(
  ({ position, trailPosition }) => {
    const opacity = clamp(f32(3) * (1 - trailPosition), 0, 1);
    return mix(
      vec4f(0.77, 0.39, 1, opacity),
      vec4f(0.11, 0.44, 0.94, opacity),
      position.x * 0.5 + 0.5,
    );
  },
);

const alphaBlend: GPUBlendState = {
  color: {
    operation: 'add',
    srcFactor: 'src-alpha',
    dstFactor: 'one-minus-src-alpha',
  },
  alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
};

function createPipelines() {
  const advect = root.createComputePipeline({ compute: advectCompute });

  const fill = root
    .with(joinSlot, lineJoins.round)
    .with(startCapSlot, lineCaps.arrow)
    .with(endCapSlot, lineCaps.butt)
    .createRenderPipeline({
      vertex: mainVertex,
      fragment: mainFragment,
      targets: { format: presentationFormat, blend: alphaBlend },
    })
    .withIndexBuffer(indexBuffer);

  return {
    fill,
    advect,
  };
}

const pipelines = createPipelines();

const draw = () => {
  uniformsBuffer.writePartial({ frameCount });

  pipelines.advect
    .with(bindGroupWritable)
    .dispatchWorkgroups(
      Math.ceil(PARTICLE_COUNT / WORKGROUP_SIZE),
    );

  pipelines.fill
    .with(bindGroup)
    .withColorAttachment({
      view: context,
      clearValue: [1, 1, 1, 1],
    })
    .drawIndexed(
      lineSegmentIndicesCapLevel1.length,
      PARTICLE_COUNT * TRAIL_LENGTH,
    );
};

let frameId = -1;
let frameCount = 0;
let play = true;
const framesInFlight = new Set<number>();

const runAnimationFrame = () => {
  const frameIdLocal = frameId;
  if (play && framesInFlight.size < 3) {
    draw();
    frameCount++;
    framesInFlight.add(frameIdLocal);
    void device.queue.onSubmittedWorkDone().then(() => {
      framesInFlight.delete(frameIdLocal);
    });
  }
  frameId = requestAnimationFrame(runAnimationFrame);
};
runAnimationFrame();

export const controls = defineControls({
  'Play': {
    initial: true,
    onToggleChange: (value) => {
      play = value;
    },
  },
});

export function onCleanup() {
  root.destroy();
  root.device.destroy();
  cancelAnimationFrame(frameId);
}
