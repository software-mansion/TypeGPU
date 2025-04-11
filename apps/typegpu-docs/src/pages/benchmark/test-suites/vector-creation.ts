import { Bench } from 'tinybench';
import type { v2u, v3f, v4i } from 'typegpu/data';
import { stringifyLocator } from '../parameter-set.ts';
import { createSuite } from '../suites.ts';

export const vectorCreationSuite = createSuite(
  ({ params, d }) => {
    const ctx = {
      bench: null as unknown as Bench,
      d,
      thousandVectors: [] as (v3f | v2u | v4i)[],
      tenThousandVectors: [] as (v3f | v2u | v4i)[],
      hundredThousandVectors: [] as (v3f | v2u | v4i)[],
    };

    ctx.bench = new Bench({
      name: stringifyLocator('typegpu', params.typegpu),
      time: 1000,
      setup: () => {
        ctx.thousandVectors = Array.from({ length: 1000 });
        ctx.tenThousandVectors = Array.from({ length: 10000 });
        ctx.hundredThousandVectors = Array.from({ length: 100000 });
      },
    });

    return ctx;
  },
  {
    '1k vectors': (getCtx) => async () => {
      const { thousandVectors: container, d } = getCtx();

      for (let i = 0; i < container.length; i++) {
        container[i] = d.vec3f(1, 2, 3);
      }

      for (let i = 0; i < container.length; i++) {
        container[i] = d.vec2u(1, 2);
      }

      for (let i = 0; i < container.length; i++) {
        container[i] = d.vec4i(1, 2, 3, 4);
      }
    },

    '10k vectors': (getCtx) => async () => {
      const { tenThousandVectors: container, d } = getCtx();

      for (let i = 0; i < container.length; i++) {
        container[i] = d.vec3f(1, 2, 3);
      }

      for (let i = 0; i < container.length; i++) {
        container[i] = d.vec2u(1, 2);
      }

      for (let i = 0; i < container.length; i++) {
        container[i] = d.vec4i(1, 2, 3, 4);
      }
    },

    '100k vectors': (getCtx) => async () => {
      const { hundredThousandVectors: container, d } = getCtx();

      for (let i = 0; i < container.length; i++) {
        container[i] = d.vec3f(1, 2, 3);
      }

      for (let i = 0; i < container.length; i++) {
        container[i] = d.vec2u(1, 2);
      }

      for (let i = 0; i < container.length; i++) {
        container[i] = d.vec4i(1, 2, 3, 4);
      }
    },
  },
);
