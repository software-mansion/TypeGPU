import { d, type TgpuRoot } from 'typegpu';

export const U32_MAX = 0xffffffff;
export const I32_MIN = -0x80000000;

/** Applies `f` to every element of `values` on the GPU, one thread per element. */
export async function mapOnGpu<In extends d.AnyWgslData, Out extends d.AnyWgslData>(
  root: TgpuRoot,
  inSchema: In,
  outSchema: Out,
  values: d.InferInput<In>[],
  f: (x: d.Infer<In>) => d.Infer<Out>,
): Promise<d.Infer<Out>[]> {
  const input = root.createReadonly(d.arrayOf(inSchema, values.length), values);
  const output = root.createMutable(d.arrayOf(outSchema, values.length));

  root
    .createGuardedComputePipeline((i) => {
      'use gpu';
      output.$[i] = f(input.$[i] as d.Infer<In>) as d.InferGPU<Out>;
    })
    .dispatchThreads(values.length);

  return (await output.read()) as d.Infer<Out>[];
}

/** The sign of a zero result is not something these tests assert on. */
export const noNegativeZero = (values: number[]) => values.map((v) => (v === 0 ? 0 : v));
