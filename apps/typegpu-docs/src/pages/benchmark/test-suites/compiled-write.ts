import { Bench } from 'tinybench';
import type { TgpuBuffer, TgpuRoot } from 'typegpu';
import type { v3f } from 'typegpu/data';
import { stringifyLocator } from '../parameter-set';
import { createSuite } from '../suites';

export const compiledWriteSuite = createSuite(
  ({ params, tgpuModule, d }) => {
    const { tgpu } = tgpuModule;

    const sizes = {
      small: 32,
      medium: 32 * 32,
      large: 32 * 32 * 32,
    };

    const Boid = d.struct({
      pos: d.vec3f,
      vel: d.vec3f,
    });

    const Particle = d.struct({
      x: d.f32,
      y: d.f32,
      z: d.f32,
      opacity: d.f32,
    });

    const boidArrays = {
      small: d.arrayOf(Boid, sizes.small),
      medium: d.arrayOf(Boid, sizes.medium),
      large: d.arrayOf(Boid, sizes.large),
    };

    const particleArrays = {
      small: d.arrayOf(Particle, sizes.small),
      medium: d.arrayOf(Particle, sizes.medium),
      large: d.arrayOf(Particle, sizes.large),
    };

    const ctx = {
      bench: null as unknown as Bench,
      sizes,
      d,
      root: null as unknown as TgpuRoot,
      buffers: {
        small: null as unknown as TgpuBuffer<typeof boidArrays.small>,
        medium: null as unknown as TgpuBuffer<typeof boidArrays.medium>,
        large: null as unknown as TgpuBuffer<typeof boidArrays.large>,
      },
      vectorlessBuffers: {
        small: null as unknown as TgpuBuffer<typeof particleArrays.small>,
        medium: null as unknown as TgpuBuffer<typeof particleArrays.medium>,
        large: null as unknown as TgpuBuffer<typeof particleArrays.large>,
      },
      webgpuData: {
        small: null as unknown as ArrayBuffer,
        medium: null as unknown as ArrayBuffer,
        large: null as unknown as ArrayBuffer,
      },
      webgpuVectorlessData: {
        small: null as unknown as ArrayBuffer,
        medium: null as unknown as ArrayBuffer,
        large: null as unknown as ArrayBuffer,
      },
      typegpuBoidData: {
        small: null as unknown as Array<{ pos: v3f; vel: v3f }>,
        medium: null as unknown as Array<{ pos: v3f; vel: v3f }>,
        large: null as unknown as Array<{ pos: v3f; vel: v3f }>,
      },
      typegpuParticleData: {
        small: null as unknown as Array<{
          x: number;
          y: number;
          z: number;
          opacity: number;
        }>,
        medium: null as unknown as Array<{
          x: number;
          y: number;
          z: number;
          opacity: number;
        }>,
        large: null as unknown as Array<{
          x: number;
          y: number;
          z: number;
          opacity: number;
        }>,
      },
      dataVec: null as unknown as v3f,
      dataVectorless: null as unknown as {
        x: number;
        y: number;
        z: number;
        opacity: number;
      },
    };

    ctx.bench = new Bench({
      name: stringifyLocator('typegpu', params.typegpu),
      time: 1000,
      async setup() {
        ctx.root = await tgpu.init();

        ctx.buffers.small = ctx.root.createBuffer(boidArrays.small);
        ctx.buffers.medium = ctx.root.createBuffer(boidArrays.medium);
        ctx.buffers.large = ctx.root.createBuffer(boidArrays.large);

        for (const buffer of Object.values(ctx.buffers)) {
          if ('compileWriter' in buffer) {
            buffer.compileWriter();
          }
        }

        ctx.vectorlessBuffers.small = ctx.root.createBuffer(
          particleArrays.small,
        );
        ctx.vectorlessBuffers.medium = ctx.root.createBuffer(
          particleArrays.medium,
        );
        ctx.vectorlessBuffers.large = ctx.root.createBuffer(
          particleArrays.large,
        );

        for (const buffer of Object.values(ctx.vectorlessBuffers)) {
          if ('compileWriter' in buffer) {
            buffer.compileWriter();
          }
        }

        // Create the data ahead of time to measure only the write time
        for (const size of ['small', 'medium', 'large'] as const) {
          const amountOfBoids = sizes[size];
          const BoidArray = d.arrayOf(Boid, amountOfBoids);
          ctx.webgpuData[size] = new ArrayBuffer(d.sizeOf(BoidArray));

          const ParticleArray = d.arrayOf(Particle, amountOfBoids);
          ctx.webgpuVectorlessData[size] = new ArrayBuffer(
            d.sizeOf(ParticleArray),
          );

          ctx.typegpuBoidData[size] = Array(amountOfBoids).fill(null);
          ctx.typegpuParticleData[size] = Array(amountOfBoids).fill(null);
        }

        ctx.dataVec = d.vec3f(1, 2, 3);
        ctx.dataVectorless = { x: 1, y: 2, z: 3, opacity: 4 };
      },
      teardown() {
        ctx.root.destroy();
      },
    });

    return ctx;
  },
  {
    'WebGPU reference (32 elements)': (getCtx) => async () => {
      const { root, buffers, webgpuData, sizes } = getCtx();
      const len = sizes.small;
      const data = webgpuData.small;
      const fView = new DataView(data);

      for (let i = 0; i < len; ++i) {
        fView.setFloat32(i * 32 + 0, 1, true);
        fView.setFloat32(i * 32 + 4, 2, true);
        fView.setFloat32(i * 32 + 8, 3, true);
        fView.setFloat32(i * 32 + 16, 4, true);
        fView.setFloat32(i * 32 + 20, 5, true);
        fView.setFloat32(i * 32 + 24, 6, true);
      }

      root.device.queue.writeBuffer(root.unwrap(buffers.small), 0, data);
      await root.device.queue.onSubmittedWorkDone();
    },

    'WebGPU reference (32² elements)': (getCtx) => async () => {
      const { root, buffers, webgpuData, sizes } = getCtx();
      const len = sizes.medium;
      const data = webgpuData.medium;
      const fView = new DataView(data);

      for (let i = 0; i < len; ++i) {
        fView.setFloat32(i * 32 + 0, 1, true);
        fView.setFloat32(i * 32 + 4, 2, true);
        fView.setFloat32(i * 32 + 8, 3, true);
        fView.setFloat32(i * 32 + 16, 4, true);
        fView.setFloat32(i * 32 + 20, 5, true);
        fView.setFloat32(i * 32 + 24, 6, true);
      }
      root.device.queue.writeBuffer(root.unwrap(buffers.medium), 0, data);
      await root.device.queue.onSubmittedWorkDone();
    },

    'WebGPU reference (32³ elements)': (getCtx) => async () => {
      const { root, buffers, webgpuData, sizes } = getCtx();
      const len = sizes.large;
      const data = webgpuData.large;
      const fView = new DataView(data);

      for (let i = 0; i < len; ++i) {
        fView.setFloat32(i * 32 + 0, 1, true);
        fView.setFloat32(i * 32 + 4, 2, true);
        fView.setFloat32(i * 32 + 8, 3, true);
        fView.setFloat32(i * 32 + 16, 4, true);
        fView.setFloat32(i * 32 + 20, 5, true);
        fView.setFloat32(i * 32 + 24, 6, true);
      }
      root.device.queue.writeBuffer(root.unwrap(buffers.large), 0, data);
      await root.device.queue.onSubmittedWorkDone();
    },

    'TypeGPU (32 elements)': (getCtx) => async () => {
      const { root, buffers, typegpuBoidData, dataVec } = getCtx();
      const data = typegpuBoidData.small;
      for (let i = 0; i < data.length; ++i) {
        data[i] = { pos: dataVec, vel: dataVec };
      }
      buffers.small.write(data);
      await root.device.queue.onSubmittedWorkDone();
    },

    'TypeGPU (32² elements)': (getCtx) => async () => {
      const { root, buffers, typegpuBoidData, dataVec } = getCtx();
      const data = typegpuBoidData.medium;
      for (let i = 0; i < data.length; ++i) {
        data[i] = { pos: dataVec, vel: dataVec };
      }
      buffers.medium.write(data);
      await root.device.queue.onSubmittedWorkDone();
    },

    'TypeGPU (32³ elements)': (getCtx) => async () => {
      const { root, buffers, typegpuBoidData, dataVec } = getCtx();
      const data = typegpuBoidData.large;
      for (let i = 0; i < data.length; ++i) {
        data[i] = { pos: dataVec, vel: dataVec };
      }
      buffers.large.write(data);
      await root.device.queue.onSubmittedWorkDone();
    },

    'WebGPU reference vectorless (32 elements)': (getCtx) => async () => {
      const { root, vectorlessBuffers, webgpuVectorlessData, sizes } = getCtx();
      const amountOfBoids = sizes.small;
      const data = webgpuVectorlessData.small;
      const fView = new DataView(data);

      for (let i = 0; i < amountOfBoids; ++i) {
        fView.setFloat32(i * 16 + 0, 1, true);
        fView.setFloat32(i * 16 + 4, 2, true);
        fView.setFloat32(i * 16 + 8, 3, true);
        fView.setFloat32(i * 16 + 12, 4, true);
      }
      root.device.queue.writeBuffer(
        root.unwrap(vectorlessBuffers.small),
        0,
        data,
      );
      await root.device.queue.onSubmittedWorkDone();
    },

    'WebGPU reference vectorless (32² elements)': (getCtx) => async () => {
      const { root, vectorlessBuffers, webgpuVectorlessData, sizes } = getCtx();
      const amountOfBoids = sizes.medium;
      const data = webgpuVectorlessData.medium;
      const fView = new DataView(data);

      for (let i = 0; i < amountOfBoids; ++i) {
        fView.setFloat32(i * 16 + 0, 1, true);
        fView.setFloat32(i * 16 + 4, 2, true);
        fView.setFloat32(i * 16 + 8, 3, true);
        fView.setFloat32(i * 16 + 12, 4, true);
      }
      root.device.queue.writeBuffer(
        root.unwrap(vectorlessBuffers.medium),
        0,
        data,
      );
      await root.device.queue.onSubmittedWorkDone();
    },

    'WebGPU reference vectorless (32³ elements)': (getCtx) => async () => {
      const { root, vectorlessBuffers, webgpuVectorlessData, sizes } = getCtx();
      const amountOfBoids = sizes.large;
      const data = webgpuVectorlessData.large;
      const fView = new DataView(data);

      for (let i = 0; i < amountOfBoids; ++i) {
        fView.setFloat32(i * 16 + 0, 1, true);
        fView.setFloat32(i * 16 + 4, 2, true);
        fView.setFloat32(i * 16 + 8, 3, true);
        fView.setFloat32(i * 16 + 12, 4, true);
      }
      root.device.queue.writeBuffer(
        root.unwrap(vectorlessBuffers.large),
        0,
        data,
      );
      await root.device.queue.onSubmittedWorkDone();
    },

    'TypeGPU vectorless (32 elements)': (getCtx) => async () => {
      const { root, vectorlessBuffers, typegpuParticleData, dataVectorless } =
        getCtx();
      const data = typegpuParticleData.small;
      for (let i = 0; i < data.length; ++i) {
        data[i] = dataVectorless;
      }
      vectorlessBuffers.small.write(data);
      await root.device.queue.onSubmittedWorkDone();
    },

    'TypeGPU vectorless (32² elements)': (getCtx) => async () => {
      const { root, vectorlessBuffers, typegpuParticleData, dataVectorless } =
        getCtx();
      const data = typegpuParticleData.medium;
      for (let i = 0; i < data.length; ++i) {
        data[i] = dataVectorless;
      }
      vectorlessBuffers.medium.write(data);
      await root.device.queue.onSubmittedWorkDone();
    },

    'TypeGPU vectorless (32³ elements)': (getCtx) => async () => {
      const { root, vectorlessBuffers, typegpuParticleData, dataVectorless } =
        getCtx();
      const data = typegpuParticleData.large;
      for (let i = 0; i < data.length; ++i) {
        data[i] = dataVectorless;
      }
      vectorlessBuffers.large.write(data);
      await root.device.queue.onSubmittedWorkDone();
    },
  },
);
