/* oxlint-disable typescript-eslint/no-non-null-assertion -- Packed interval sizes are fixed by the transport */
import { d, std, tgpu } from 'typegpu';

export const asRgb = d.vec3f as (value: number | d.v3f) => d.v3f;

export function createTransport(rgb: boolean) {
  const Interval = d.struct({ radiance: d.vec3f, transmission: rgb ? d.vec3f : d.f32 });
  const Packed = d.arrayOf(d.u32, rgb ? 3 : 2);
  type Value = d.InferGPU<typeof Interval>;

  const empty = () => {
    'use gpu';
    return Interval({ radiance: d.vec3f(), transmission: rgb ? d.vec3f(1) : 1 });
  };

  const pack = (value: Value) => {
    'use gpu';
    const transmission = asRgb(value.transmission);
    const packed = Packed();
    packed[0] = std.pack2x16float(value.radiance.rg);
    packed[1] = std.pack2x16float(d.vec2f(value.radiance.b, transmission.r));
    if (rgb) packed[2] = std.pack2x16float(transmission.gb);
    return packed;
  };

  const unpack = (packed: d.InferGPU<typeof Packed>) => {
    'use gpu';
    const rg = std.unpack2x16float(packed[0]!);
    const bt = std.unpack2x16float(packed[1]!);
    return Interval({
      radiance: d.vec3f(rg, bt.x),
      transmission: rgb ? d.vec3f(bt.y, std.unpack2x16float(packed[2]!)) : bt.y,
    });
  };

  const over = (near: Value, far: Value) => {
    'use gpu';
    return Interval({
      radiance: near.radiance + near.transmission * far.radiance,
      transmission: near.transmission * far.transmission,
    });
  };

  const average = (a: Value, b: Value) => {
    'use gpu';
    return Interval({
      radiance: (a.radiance + b.radiance) * 0.5,
      transmission: (a.transmission + b.transmission) * 0.5,
    });
  };

  const integrate = (emission: d.v3f, extinction: number | d.v3f, distance: number) => {
    'use gpu';
    const sigma = asRgb(extinction);
    if (rgb) {
      const transmission = std.exp(sigma * -distance);
      const integral = d.vec3f(distance);
      for (const channel of tgpu.unroll([0, 1, 2])) {
        if (sigma[channel]! > 0.00001) {
          integral[channel] = (1 - transmission[channel]!) / sigma[channel]!;
        }
      }
      return Interval({ radiance: emission * integral, transmission });
    }

    const transmission = std.exp(-sigma.r * distance);
    let integral = distance;
    if (sigma.r > 0.00001) integral = (1 - transmission) / sigma.r;
    return Interval({ radiance: emission * integral, transmission });
  };

  return { Packed, empty, pack, unpack, over, average, integrate };
}
