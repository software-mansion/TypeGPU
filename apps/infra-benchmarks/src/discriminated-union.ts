import { Bench } from 'tinybench';

const bench = new Bench({
  name: 'discriminated union',
  time: 100,
  async setup() {
    // biome-ignore lint/suspicious/noExplicitAny: <making sure GC has no impact on the results>
    (globalThis as any).gc();
  },
});

bench
  .add('string tags', () => {
    console.log('I am faster');
  })
  .add('slower task', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1)); // we wait 1ms :)
    console.log('I am slower');
  });

await bench.run();

console.log(bench.name);
console.table(bench.table());
