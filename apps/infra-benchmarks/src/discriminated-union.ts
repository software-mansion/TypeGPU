/*
 * This benchmark is used to find the fastest way to discriminate
 * types of objects that are hidden under a symbol. This information
 * will be used to best discriminate TypeGPU resources.
 */

import { Bench } from 'tinybench';

const bench = new Bench({
  name: 'discriminated union',
  time: 100,
  async setup() {
    // oxlint-disable-next-line typescript/no-explicit-any -- making sure GC has no impact on the results
    (globalThis as any).gc();
  },
});

const $internal = Symbol('Internal functionality');

const STRING_TAGS = ['aaa', 'bbb', 'ccc'] as const;
const NUMBER_TAGS = [0, 1, 2] as const;
const NUMBER_TAG_CATALOG = {
  aaa: 0,
  bbb: 1,
  ccc: 2,
} as const;

const aaa = Symbol('aaa symbol');
const bbb = Symbol('bbb symbol');
const ccc = Symbol('ccc symbol');
const SYMBOL_TAGS = [aaa, bbb, ccc] as const;

const NUMBER_OF_OBJS = 1000;

let stringTaggedObjs: {
  [$internal]: { type: (typeof STRING_TAGS)[number] };
}[];
let numberTaggedObjs: { [$internal]: { type: (typeof NUMBER_TAGS)[number] } }[];
let symbolTaggedObjs: { [$internal]: { type: (typeof SYMBOL_TAGS)[number] } }[];
let symbolKeyedObjs: { [K in (typeof SYMBOL_TAGS)[number]]: boolean }[];

bench
  .add(
    'string tags',
    () => {
      let _count = 0;

      for (const obj of stringTaggedObjs) {
        if (obj[$internal].type === 'aaa') {
          _count += 2;
        } else if (obj[$internal].type === 'bbb') {
          _count += 3;
        } else if (obj[$internal].type === 'ccc') {
          _count += 4;
        }
      }
    },
    {
      beforeEach() {
        stringTaggedObjs = Array.from({ length: NUMBER_OF_OBJS }, () => ({
          [$internal]: {
            // oxlint-disable-next-line typescript/no-non-null-assertion
            type: STRING_TAGS[Math.floor(Math.random() * STRING_TAGS.length)]!,
          },
        }));
      },
    },
  )
  .add(
    'number tags',
    async () => {
      let _count = 0;

      for (const obj of numberTaggedObjs) {
        if (obj[$internal].type === NUMBER_TAG_CATALOG.aaa) {
          _count += 2;
        } else if (obj[$internal].type === NUMBER_TAG_CATALOG.bbb) {
          _count += 3;
        } else if (obj[$internal].type === NUMBER_TAG_CATALOG.ccc) {
          _count += 4;
        }
      }
    },
    {
      beforeEach() {
        numberTaggedObjs = Array.from({ length: NUMBER_OF_OBJS }, () => ({
          [$internal]: {
            // oxlint-disable-next-line typescript/no-non-null-assertion
            type: NUMBER_TAGS[Math.floor(Math.random() * NUMBER_TAGS.length)]!,
          },
        }));
      },
    },
  )
  .add(
    'number tags (inlined catalog)',
    async () => {
      let _count = 0;

      for (const obj of numberTaggedObjs) {
        if (obj[$internal].type === 0) {
          _count += 2;
        } else if (obj[$internal].type === 1) {
          _count += 3;
        } else if (obj[$internal].type === 2) {
          _count += 4;
        }
      }
    },
    {
      beforeEach() {
        numberTaggedObjs = Array.from({ length: NUMBER_OF_OBJS }, () => ({
          [$internal]: {
            // oxlint-disable-next-line typescript/no-non-null-assertion
            type: NUMBER_TAGS[Math.floor(Math.random() * NUMBER_TAGS.length)]!,
          },
        }));
      },
    },
  )
  .add(
    'symbol tags',
    async () => {
      let _count = 0;

      for (const obj of symbolTaggedObjs) {
        if (obj[$internal].type === aaa) {
          _count += 2;
        } else if (obj[$internal].type === bbb) {
          _count += 3;
        } else if (obj[$internal].type === ccc) {
          _count += 4;
        }
      }
    },
    {
      beforeEach() {
        symbolTaggedObjs = Array.from({ length: NUMBER_OF_OBJS }, () => ({
          [$internal]: {
            // oxlint-disable-next-line typescript/no-non-null-assertion
            type: SYMBOL_TAGS[Math.floor(Math.random() * SYMBOL_TAGS.length)]!,
          },
        }));
      },
    },
  )
  .add(
    'symbol keys',
    async () => {
      let _count = 0;

      for (const obj of symbolKeyedObjs) {
        if (obj[aaa]) {
          _count += 2;
        } else if (obj[bbb]) {
          _count += 3;
        } else if (obj[ccc]) {
          _count += 4;
        }
      }
    },
    {
      beforeEach() {
        symbolKeyedObjs = Array.from(
          { length: NUMBER_OF_OBJS },
          () =>
            ({
              // oxlint-disable-next-line typescript/no-non-null-assertion
              [SYMBOL_TAGS[Math.floor(Math.random() * SYMBOL_TAGS.length)]!]:
                true,
            }) as { [K in (typeof SYMBOL_TAGS)[number]]: boolean },
        );
      },
    },
  );

await bench.run();

console.log(bench.name);
console.table(bench.table());
