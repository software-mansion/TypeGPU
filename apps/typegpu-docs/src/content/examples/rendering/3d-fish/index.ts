import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as p from './params.ts';

// setup
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// example

const ModelData = d
  .struct({
    vec: d.vec3f,
    num: d.u32,
  });

const fishDataBuffers = Array.from({ length: 2 }, () =>
  root
    .createBuffer(d.arrayOf(ModelData, 2))
    .$usage('storage', 'vertex'));

const computeBindGroupLayout = tgpu
  .bindGroupLayout({
    currentFishData: { storage: (n: number) => d.arrayOf(ModelData, n) },
    nextFishData: {
      storage: (n: number) => d.arrayOf(ModelData, n),
      access: 'mutable',
    },
  });

const computeBindGroup = root.createBindGroup(computeBindGroupLayout, {
  currentFishData: fishDataBuffers[0],
  nextFishData: fishDataBuffers[1],
});

const computeShader = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [p.workGroupSize],
  })((input) => {
    const fishIndex = input.gid.x;
    const fishData = computeBindGroupLayout.$.currentFishData[fishIndex];
    computeBindGroupLayout.$.nextFishData[fishIndex] = fishData;
  });

console.log('COMPUTE SHADER', tgpu.resolve({ externals: { computeShader } }));

const computePipeline = root['~unstable']
  .withCompute(computeShader)
  .createPipeline();

// repro

console.log('BEFORE RANDOMIZE');
console.log('first fish 0:', (await fishDataBuffers[0].read())[0]);
console.log('first fish 1:', (await fishDataBuffers[1].read())[0]);

const positions: d.Infer<typeof ModelData>[] = Array.from(
  { length: 2 },
  () => ({
    vec: d.vec3f(8777777, 0, 0),
    num: 1,
  }),
);
fishDataBuffers[0].write(positions);

console.log('AFTER RANDOMIZE');
console.log('first fish 0:', (await fishDataBuffers[0].read())[0]);
console.log('first fish 1:', (await fishDataBuffers[1].read())[0]);

// fishDataBuffers[0].copyFrom(fishDataBuffers[1]);
computePipeline
  .with(computeBindGroupLayout, computeBindGroup)
  .dispatchWorkgroups(2 / p.workGroupSize);
await root['~unstable'].flush();

console.log('AFTER COMPUTE');
console.log('first fish 0:', (await fishDataBuffers[0].read())[0]);
console.log('first fish 1:', (await fishDataBuffers[1].read())[0]);

// #endregion
