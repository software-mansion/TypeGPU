import { parse } from 'tgpu-wgsl-parser';
import { describe, expect, it } from 'vitest';
import { fn } from '../src/core/function/tgpuFn';
import { fragmentFn } from '../src/core/function/tgpuFragmentFn';
import { vertexFn } from '../src/core/function/tgpuVertexFn';
import { resolve } from '../src/core/resolve/tgpuResolve';
import * as d from '../src/data';
import { bindGroupLayout } from '../src/tgpuBindGroupLayout';
import { parseResolved } from './utils/parseResolved';

describe('tgpu.fn with raw string WGSL implementation', () => {
  it('is namable', () => {
    const getX = fn([], d.f32)
      .does(`() {
        return 3.0f;
      }`)
      .$name('get_x');

    expect(getX.label).toEqual('get_x');
  });

  it('resolves rawFn to WGSL', () => {
    const getY = fn([], d.f32)
      .does(`() {
        return 3.0f;
      }`)
      .$name('get_y');

    const actual = parseResolved({ getY });

    const expected = parse(`
      fn get_y() {
        return 3.0f;
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('resolves externals and replaces their usages in code', () => {
    const getColor = fn([], d.vec3f)
      .does(`() {
        let color = vec3f();
        return color;
      }`)
      .$name('get_color');

    const getX = fn([], d.f32)
      .does(`() {
        let color = get_color();
        return 3.0f;
      }`)
      .$name('get_x')
      .$uses({ get_color: getColor });

    const getY = fn([], d.f32)
      .does(`() {
        let c = color();
        return getX();
      }`)
      .$name('get_y')
      .$uses({ getX, color: getColor });

    const actual = parseResolved({ getY });

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
    `);

    expect(actual).toEqual(expected);
  });

  it('replaces external usage just for exact identifier matches', () => {
    const getx = fn([], d.f32)
      .does(`() {
        return 3.0f;
      }`)
      .$name('external');

    const getY = fn([], d.f32)
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

    const actual = parseResolved({ getY });

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
    `);

    expect(actual).toEqual(expected);
  });

  it("doesn't replace property access identifiers when replacing externals", () => {
    const HighlightedCircle = d
      .struct({
        index: d.u32,
        color: d.vec4f,
      })
      .$name('HighlightedCircle');

    const uniformBindGroupLayout = bindGroupLayout({
      highlightedCircle: { uniform: HighlightedCircle },
    });

    const shaderCode = resolve({
      template: `
        fn vs() {
          out.highlighted = highlighted.index;
          
          let h = highlighted;
          let x = a.b.c.highlighted.d;
        }
      `,
      externals: {
        highlighted: uniformBindGroupLayout.bound.highlightedCircle,
      },
      names: 'strict',
    });

    expect(parse(shaderCode)).toEqual(
      parse(`
        struct HighlightedCircle {
          index: u32,
          color: vec4f,
        }

        @group(0) @binding(0) var<uniform> highlightedCircle: HighlightedCircle;

        fn vs() {
          out.highlighted = highlightedCircle.index;

          let h = highlightedCircle;
          let x = a.b.c.highlighted.d;
        }
      `),
    );
  });

  it('adds output struct definition when resolving vertex functions', () => {
    const vertexFunction = vertexFn(
      { vertexIndex: d.builtin.vertexIndex },
      { outPos: d.builtin.position },
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

    const resolved = resolve({
      externals: { vertexFunction },
      names: 'strict',
    });

    expect(resolved).toContain(`\
struct vertex_fn_Output {
  @builtin(position) outPos: vec4f,
}`);
    expect(resolved).toContain('-> vertex_fn_Output {');
    expect(resolved).not.toContain('VertexOutput');
  });

  it('adds output struct definition when resolving fragment functions', () => {
    const fragmentFunction = fragmentFn(
      { position: d.builtin.position },
      { a: d.vec4f, b: d.vec4f },
    )
      .does(/* wgsl */ `(@builtin(position) position: vec4f) -> Output {
    var out: Output;
    out.a = vec4f(1.0);
    out.b = vec4f(0.5);
    return out;
  }`)
      .$name('fragment');

    const resolved = resolve({
      externals: { fragmentFunction },
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
    const fragmentFunction = fragmentFn(
      { position: d.builtin.position },
      d.vec4f,
    )
      .does(/* wgsl */ `(@builtin(position) position: vec4f) -> @location(0) vec4f {
        return vec4f(1.0f);
      }`)
      .$name('fragment');

    expect(resolve({ externals: { fragmentFunction } })).not.toContain(
      'struct',
    );
  });

  it('automatically adds struct definitions of argument types when resolving wgsl-defined functions', () => {
    const Point = d.struct({
      a: d.u32,
      b: d.u32,
    });

    const func = fn([d.vec4f, Point], undefined)
      .does(/* wgsl */ `(a: vec4f, b: Point) {
    var newPoint: Point;
    newPoint = b;
  }`)
      .$name('newPointF');

    expect(parseResolved({ func })).toEqual(
      parse(`
    struct Point {
      a: u32,
      b: u32,
    }

    fn newPointF(a: vec4f, b: Point) {
      var newPoint: Point;
      newPoint = b;
    }`),
    );
  });

  it('replaces references when adding struct definitions of argument types when resolving wgsl-defined functions', () => {
    const Point = d
      .struct({
        a: d.u32,
        b: d.u32,
      })
      .$name('P');

    const func = fn([d.vec4f, Point], d.vec2f)
      .does(/* wgsl */ `(
        a: vec4f, 
        b : PointStruct ,
    ) -> vec2f {
    var newPoint: PointStruct;
    newPoint = b;
  }`)
      .$name('newPointF');

    expect(parseResolved({ func })).toEqual(
      parse(`
    struct P {
      a: u32,
      b: u32,
    }

    fn newPointF(a: vec4f, b: P) -> vec2f {
      var newPoint: P;
      newPoint = b;
    }`),
    );
  });

  it('adds return type struct definitions when resolving wgsl-defined functions', () => {
    const Point = d
      .struct({
        a: d.u32,
        b: d.u32,
      })
      .$name('P');

    const func = fn([d.vec4f], Point)
      .does(/* wgsl */ `(a: vec4f) -> PointStruct {
    var newPoint: PointStruct;
    newPoint = b;
    return newPoint;
  }`)
      .$name('newPointF');

    expect(parseResolved({ func })).toEqual(
      parse(`
    struct P {
      a: u32,
      b: u32,
    }

    fn newPointF(a: vec4f) -> P {
      var newPoint: P;
      newPoint = b;
      return newPoint;
    }`),
    );
  });
});
