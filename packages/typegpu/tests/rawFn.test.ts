import { parse } from '@typegpu/wgsl-parser';
import { describe, expect, it } from 'vitest';
import { builtin, f32, vec3f, vec4f } from '../src/data';
import tgpu, { wgsl } from '../src/experimental';
import { parseWGSL } from './utils/parseWGSL';

describe('tgpu.fn with raw string WGSL implementation', () => {
  it('is namable', () => {
    const getX = tgpu
      .fn([], f32)
      .does(`() {
        return 3.0f;
      }`)
      .$name('get_x');

    expect(getX.label).toEqual('get_x');
  });

  it('resolves rawFn to WGSL', () => {
    const getY = tgpu
      .fn([], f32)
      .does(`() {
        return 3.0f;
      }`)
      .$name('get_y');

    const actual = parseWGSL(wgsl`
      fn main() {
        let x = ${getY}();
      }
    `);

    const expected = parse(`
      fn get_y() {
        return 3.0f;
      }

      fn main() {
        let x = get_y();
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('resolves externals and replaces their usages in code', () => {
    const getColor = tgpu
      .fn([], vec3f)
      .does(`() {
        let color = vec3f();
        return color;
      }`)
      .$name('get_color');

    const getX = tgpu
      .fn([], f32)
      .does(`() {
        let color = get_color();
        return 3.0f;
      }`)
      .$name('get_x')
      .$uses({ get_color: getColor });

    const getY = tgpu
      .fn([], f32)
      .does(`() {
        let c = color();
        return getX();
      }`)
      .$name('get_y')
      .$uses({ getX, color: getColor });

    const actual = parseWGSL(wgsl`
      fn main() {
        let x = ${getY}();
      }
    `);

    const expected = parse(`
      fn get_color() {
        let color = vec3f();
        return color;
      }

      fn get_x() {
        let color = get_color();
        return 3.0f;
      }

      fn get_y() {
        let c = get_color();
        return get_x();
      }

      fn main() {
        let x = get_y();
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('replaces external usage just for exact identifier matches', () => {
    const getx = tgpu
      .fn([], f32)
      .does(`() {
        return 3.0f;
      }`)
      .$name('external');

    const getY = tgpu
      .fn([], f32)
      .does(`() {
        let x = getx();
        let y = getx() + getx();
        let z = hellogetx();
        getx();
        xgetx();
        getxx();
        return getx();
      }`)
      .$name('get_y')
      .$uses({ getx });

    const actual = parseWGSL(wgsl`
      fn main() {
        let x = ${getY}();
      }
    `);

    const expected = parse(`
      fn external() {
        return 3.0f;
      }

      fn get_y() {
        let x = external();
        let y = external() + external();
        let z = hellogetx();
        external();
        xgetx();
        getxx();
        return external();
      }

      fn main() {
        let x = get_y();
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('adds output struct definition when resolving vertex functions', () => {
    const vertexFunction = tgpu
      .vertexFn(
        { vertexIndex: builtin.vertexIndex },
        { outPos: builtin.position },
      )
      .does(/* wgsl */ `(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var pos = array<vec2f, 6>(
      vec2<f32>( 1,  1),
      vec2<f32>( 1, -1),
      vec2<f32>(-1, -1),
      vec2<f32>( 1,  1),
      vec2<f32>(-1, -1),
      vec2<f32>(-1,  1)
    );
  
    var output: VertexOutput;
    output.outPos = vec4f(pos[vertexIndex], 0, 1);
    return output;
  }`)
      .$name('vertex_fn');

    const resolved = tgpu.resolve({ input: [vertexFunction], names: 'strict' });

    expect(resolved).toContain(`\
struct vertex_fn_Output {
  @builtin(position) outPos: vec4f,
}`);
    expect(resolved).toContain('-> vertex_fn_Output {');
    expect(resolved).not.toContain('VertexOutput');
  });

  it('adds output struct definition when resolving fragment functions', () => {
    const fragmentFunction = tgpu
      .fragmentFn({ position: builtin.position }, { a: vec4f, b: vec4f })
      .does(/* wgsl */ `(@builtin(position) position: vec4f) -> Output {
    var out: Output;
    out.a = vec4f(1.0);
    out.b = vec4f(0.5);
    return out;
  }`)
      .$name('fragment');

    const resolved = tgpu.resolve({
      input: [fragmentFunction],
      names: 'strict',
    });

    expect(resolved).toContain(`\
struct fragment_Output {
  @location(0) a: vec4f,
  @location(1) b: vec4f,
}`);
    expect(resolved).toContain('-> fragment_Output {');
    expect(resolved).not.toContain(' Output');
  });

  it("does not add redundant struct definition when there's no struct output", () => {
    const fragmentFunction = tgpu
      .fragmentFn({ position: builtin.position }, vec4f)
      .does(/* wgsl */ `(@builtin(position) position: vec4f) -> @location(0) vec4f {
        return vec4f(1.0f);
      }`)
      .$name('fragment');

    expect(
      tgpu.resolve({ input: [fragmentFunction], names: 'strict' }),
    ).not.toContain('struct');
  });
});
