import { tgpu, d } from 'typegpu';
import { XOROSHIRO64STARSTAR, LCG32, BPETER, randf, randomGeneratorSlot } from '@typegpu/noise';
import { defineControls } from '../../common/defineControls.ts';

const SEEDS = 17;
const SAMPLES = 111;

const generators = {
  XOROSHIRO64STARSTAR,
  LCG32,
  BPETER,
} as const;
const seedFns = ['seed', 'seed2', 'seed3', 'seed4'] as const;

const valueColorClass = (value: number): 'good' | 'bad' => (value <= 1e-6 ? 'good' : 'bad');

const root = await tgpu.init();
const seedsArrayBuffer = new Float32Array(SEEDS * 4);
const seedsBuffer = root.createMutable(d.arrayOf(d.vec4f, SEEDS));
const gpuBuffer = root.createMutable(d.arrayOf(d.f32, SEEDS * SAMPLES));

async function run() {
  const tbody = document.querySelector('#results') as HTMLTableSectionElement;

  for (let i = 0; i < SEEDS * 4; i++) {
    seedsArrayBuffer[i] = Math.random();
  }
  seedsBuffer.write(seedsArrayBuffer);

  let newInnerHTML = '';
  for (const [name, gen] of Object.entries(generators)) {
    for (const seedFn of seedFns) {
      root
        .with(randomGeneratorSlot, gen)
        .createGuardedComputePipeline(() => {
          'use gpu';
          for (let i = 0; i < SEEDS; i++) {
            if (seedFn === 'seed') {
              randf.seed(seedsBuffer.$[i].x);
            } else if (seedFn === 'seed2') {
              randf.seed2(d.vec2f(seedsBuffer.$[i].x, seedsBuffer.$[i].y));
            } else if (seedFn === 'seed3') {
              randf.seed3(
                d.vec3f(
                  d.f32(seedsBuffer.$[i].x),
                  d.f32(seedsBuffer.$[i].y),
                  d.f32(seedsBuffer.$[i].z),
                ),
              );
            } else {
              randf.seed4(seedsBuffer.$[i]);
            }

            for (let j = 0; j < SAMPLES; j++) {
              gpuBuffer.$[i * SAMPLES + j] = randf.sample();
            }
          }
        })
        .dispatchThreads();

      const gpuResult = await gpuBuffer.read();
      let maxSeed = 0;
      let maxPrng = 0;
      let cpuError: string | undefined;

      try {
        for (let i = 0; i < SEEDS; i++) {
          const idx = 4 * i;
          switch (seedFn) {
            case 'seed':
              gen.seed!(seedsArrayBuffer[idx]);
              break;
            case 'seed2':
              gen.seed2!(d.vec2f(seedsArrayBuffer[idx], seedsArrayBuffer[idx + 1]));
              break;
            case 'seed3':
              gen.seed3!(
                d.vec3f(
                  seedsArrayBuffer[idx],
                  seedsArrayBuffer[idx + 1],
                  seedsArrayBuffer[idx + 2],
                ),
              );
              break;
            case 'seed4':
              gen.seed4!(
                d.vec4f(
                  seedsArrayBuffer[idx],
                  seedsArrayBuffer[idx + 1],
                  seedsArrayBuffer[idx + 2],
                  seedsArrayBuffer[idx + 3],
                ),
              );
              break;
          }

          for (let j = 0; j < SAMPLES; j++) {
            const diff = Math.abs(gen.sample() - gpuResult[i * SAMPLES + j]);
            if (j === 0) {
              maxSeed = Math.max(maxSeed, diff);
            }
            maxPrng = Math.max(maxPrng, diff);
          }
        }
      } catch (e) {
        cpuError = e instanceof Error ? e.message : String(e);
      }

      newInnerHTML += cpuError
        ? `<tr><td>${name}</td><td>${seedFn}</td><td colspan="2" class="bad">${cpuError}</td></tr>`
        : `<tr><td>${name}</td><td>${seedFn}</td><td class="${valueColorClass(maxSeed)}">${maxSeed.toFixed(8)}</td><td class="${valueColorClass(maxPrng)}">${maxPrng.toFixed(8)}</td></tr>`;
    }
  }
  tbody.innerHTML = newInnerHTML;
}

await run();

// #region Example controls and cleanup

export const controls = defineControls({
  Run: {
    async onButtonClick() {
      await run();
    },
  },
});

export function onCleanup() {
  root.destroy();
}

// #endregion
