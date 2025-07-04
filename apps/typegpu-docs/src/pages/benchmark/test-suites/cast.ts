import { Bench } from 'tinybench';
import { stringifyLocator } from '../parameter-set.ts';
import { createSuite } from '../suites.ts';

export const castSuite = createSuite(
  ({ params, d }) => {
    const ctx = {
      bench: null as unknown as Bench,
      d,
    };

    ctx.bench = new Bench({
      name: stringifyLocator('typegpu', params.typegpu),
      time: 1000,
    });

    return ctx;
  },
  {
    'f16 cast': (getCtx) => async () => {
      const { d } = getCtx();

      for (let i = 0; i < 10000; i++) {
        d.f16(12333);
      }
    },

    'f32 cast': (getCtx) => async () => {
      const { d } = getCtx();

      for (let i = 0; i < 10000; i++) {
        d.f32(12333);
      }
    },
  },
);
