import { Bench } from 'tinybench';
import type { TgpuBuffer, TgpuRoot } from 'typegpu';
import type { v3f } from 'typegpu/data';
import { stringifyLocator } from '../parameter-set.ts';
import { createSuite } from '../suites.ts';

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

        ctx.vectorlessBuffers.small = ctx.root.createBuffer(particleArrays.small);
        ctx.vectorlessBuffers.medium = ctx.root.createBuffer(particleArrays.medium);
        ctx.vectorlessBuffers.large = ctx.root.createBuffer(particleArrays.large);

        for (const buffer of Object.values(ctx.vectorlessBuffers)) {
          if ('compileWriter' in buffer) {
            buffer.compileWriter();
          }
        }

        // Create the data ahead of time to measure only the write time
        for (const size of ['small', 'medium', 'large'] as const) {
          const amountOfBoids = sizes[size];
          const BoidArray = d.arrayOf(Boid, amountOfBoids);
          const data = new ArrayBuffer(d.sizeOf(BoidArray));
          const fView = new Float32Array(data);

          for (let i = 0; i < amountOfBoids; ++i) {
            fView[i * 8 + 0] = 1;
            fView[i * 8 + 1] = 2;
            fView[i * 8 + 2] = 3;

            fView[i * 8 + 4] = 4;
            fView[i * 8 + 5] = 5;
            fView[i * 8 + 6] = 6;
          }

          ctx.webgpuData[size] = data;
        }

        for (const size of ['small', 'medium', 'large'] as const) {
          const amountOfBoids = sizes[size];
          const ParticleArray = d.arrayOf(Particle, amountOfBoids);
          const data = new ArrayBuffer(d.sizeOf(ParticleArray));
          const fView = new Float32Array(data);

          for (let i = 0; i < amountOfBoids; ++i) {
            fView[i * 4 + 0] = 1;
            fView[i * 4 + 1] = 2;
            fView[i * 4 + 2] = 3;
            fView[i * 4 + 3] = 4;
          }

          ctx.webgpuVectorlessData[size] = data;
        }

        for (const size of ['small', 'medium', 'large'] as const) {
          const amountOfBoids = sizes[size];
          ctx.typegpuBoidData[size] = Array.from({ length: amountOfBoids }, () => ({
            pos: d.vec3f(1, 2, 3),
            vel: d.vec3f(4, 5, 6),
          }));
        }

        for (const size of ['small', 'medium', 'large'] as const) {
          const amountOfBoids = sizes[size];
          ctx.typegpuParticleData[size] = Array.from({ length: amountOfBoids }, () => ({
            x: 1,
            y: 2,
            z: 3,
            opacity: 4,
          }));
        }
      },
      teardown() {
        ctx.root.destroy();
      },
    });

    return ctx;
  },
  {
    'WebGPU reference (32 elements)': (getCtx) => async () => {
      const { root, buffers, webgpuData } = getCtx();
      root.device.queue.writeBuffer(root.unwrap(buffers.small), 0, webgpuData.small);
      await root.device.queue.onSubmittedWorkDone();
    },

    'WebGPU reference (32² elements)': (getCtx) => async () => {
      const { root, buffers, webgpuData } = getCtx();
      root.device.queue.writeBuffer(root.unwrap(buffers.medium), 0, webgpuData.medium);
      await root.device.queue.onSubmittedWorkDone();
    },

    'WebGPU reference (32³ elements)': (getCtx) => async () => {
      const { root, buffers, webgpuData } = getCtx();
      root.device.queue.writeBuffer(root.unwrap(buffers.large), 0, webgpuData.large);
      await root.device.queue.onSubmittedWorkDone();
    },

    'TypeGPU (32 elements)': (getCtx) => async () => {
      const { root, buffers, typegpuBoidData } = getCtx();
      buffers.small.write(typegpuBoidData.small);
      await root.device.queue.onSubmittedWorkDone();
    },

    'TypeGPU (32² elements)': (getCtx) => async () => {
      const { root, buffers, typegpuBoidData } = getCtx();
      buffers.medium.write(typegpuBoidData.medium);
      await root.device.queue.onSubmittedWorkDone();
    },

    'TypeGPU (32³ elements)': (getCtx) => async () => {
      const { root, buffers, typegpuBoidData } = getCtx();
      buffers.large.write(typegpuBoidData.large);
      await root.device.queue.onSubmittedWorkDone();
    },

    'WebGPU reference vectorless (32 elements)': (getCtx) => async () => {
      const { root, vectorlessBuffers, webgpuVectorlessData } = getCtx();
      root.device.queue.writeBuffer(
        root.unwrap(vectorlessBuffers.small),
        0,
        webgpuVectorlessData.small,
      );
      await root.device.queue.onSubmittedWorkDone();
    },

    'WebGPU reference vectorless (32² elements)': (getCtx) => async () => {
      const { root, vectorlessBuffers, webgpuVectorlessData } = getCtx();
      root.device.queue.writeBuffer(
        root.unwrap(vectorlessBuffers.medium),
        0,
        webgpuVectorlessData.medium,
      );
      await root.device.queue.onSubmittedWorkDone();
    },

    'WebGPU reference vectorless (32³ elements)': (getCtx) => async () => {
      const { root, vectorlessBuffers, webgpuVectorlessData } = getCtx();
      root.device.queue.writeBuffer(
        root.unwrap(vectorlessBuffers.large),
        0,
        webgpuVectorlessData.large,
      );
      await root.device.queue.onSubmittedWorkDone();
    },

    'TypeGPU vectorless (32 elements)': (getCtx) => async () => {
      const { root, vectorlessBuffers, typegpuParticleData } = getCtx();
      vectorlessBuffers.small.write(typegpuParticleData.small);
      await root.device.queue.onSubmittedWorkDone();
    },

    'TypeGPU vectorless (32² elements)': (getCtx) => async () => {
      const { root, vectorlessBuffers, typegpuParticleData } = getCtx();
      vectorlessBuffers.medium.write(typegpuParticleData.medium);
      await root.device.queue.onSubmittedWorkDone();
    },

    'TypeGPU vectorless (32³ elements)': (getCtx) => async () => {
      const { root, vectorlessBuffers, typegpuParticleData } = getCtx();
      vectorlessBuffers.large.write(typegpuParticleData.large);
      await root.device.queue.onSubmittedWorkDone();
    },
  },
);
