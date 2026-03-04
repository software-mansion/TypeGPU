import { describe, expect, it } from 'vitest';
import tgpu, { d } from '../src/index.js';
import { getName } from '../src/shared/meta.ts';

describe('tgpu.fn with raw string WGSL implementation', () => {
  it('is namable', () => {
    const getX = tgpu.fn([], d.f32)`() { return 3.0f; }`.$name('get_x');

    expect(getName(getX)).toBe('get_x');
  });

  it('resolves to WGSL', () => {
    const getY = tgpu.fn([], d.f32)`() { return 3.0f; }`;

    expect(tgpu.resolve([getY])).toMatchInlineSnapshot(`"fn getY() -> f32{ return 3.0f; }"`);
  });

  it('resolves externals and replaces their usages in code', () => {
    const getColor = tgpu.fn([], d.vec3f)`() {
      let color = vec3f();
      return color;
    }`;

    const getX = tgpu.fn([], d.f32)`() -> f32 {
        let color = get_color();
        return 3.0f;
      }`.$uses({ get_color: getColor });

    const getY = tgpu
      .fn(
        [],
        d.f32,
      )(`() -> f32 {
        let c = color();
        return get_x();
      }`)
      .$uses({ get_x: getX, color: getColor });

    expect(tgpu.resolve([getY])).toMatchInlineSnapshot(`
      "fn getColor() -> vec3f{
            let color = vec3f();
            return color;
          }

      fn getX() -> f32{
              let color = getColor();
              return 3.0f;
            }

      fn getY() -> f32{
              let c = getColor();
              return getX();
            }"
    `);
  });

  it('replaces external usage just for exact identifier matches', () => {
    const getx = tgpu.fn([], d.f32)`() { return 3.0f; }`.$name('externalFn');

    const getY = tgpu.fn([], d.f32)`() {
        let x = getx();
        let y = getx() + getx();
        let z = hellogetx();
        getx();
        xgetx();
        getxx();
        return getx();
      }`
      .$name('get_y')
      .$uses({ getx });

    expect(tgpu.resolve([getY])).toMatchInlineSnapshot(`
      "fn externalFn() -> f32{ return 3.0f; }

      fn get_y() -> f32{
              let x = externalFn();
              let y = externalFn() + externalFn();
              let z = hellogetx();
              externalFn();
              xgetx();
              getxx();
              return externalFn();
            }"
    `);
  });

  it("doesn't replace property access identifiers when replacing externals", () => {
    const HighlightedCircle = d.struct({
      index: d.u32,
      color: d.vec4f,
    });

    const uniformBindGroupLayout = tgpu.bindGroupLayout({
      highlightedCircle: { uniform: HighlightedCircle },
    });

    const vs = tgpu.fn([])`() {
      out.highlighted = layout.$.highlightedCircle.index;

      let h = layout.$.highlightedCircle;
      let x = a.b.c.highlighted.d;
    }`.$uses({ layout: uniformBindGroupLayout });

    expect(tgpu.resolve([vs])).toMatchInlineSnapshot(`
      "struct HighlightedCircle {
        index: u32,
        color: vec4f,
      }

      @group(0) @binding(0) var<uniform> highlightedCircle: HighlightedCircle;

      fn vs() {
            out.highlighted = highlightedCircle.index;

            let h = highlightedCircle;
            let x = a.b.c.highlighted.d;
          }"
    `);
  });

  it('adds output struct definition when resolving vertex functions', () => {
    const vertexFunction = tgpu
      .vertexFn({
        in: { vertexIndex: d.builtin.vertexIndex },
        out: { outPos: d.builtin.position },
      })(/* wgsl */ `{
    var pos = array<vec2f, 6>(
      vec2<f32>( 1,  1),
      vec2<f32>( 1, -1),
      vec2<f32>(-1, -1),
      vec2<f32>( 1,  1),
      vec2<f32>(-1, -1),
      vec2<f32>(-1,  1)
    );

    var output: Out;
    output.outPos = vec4f(pos[vertexIndex], 0, 1);
    return output;
  }`)
      .$name('vertex_fn');

    const resolved = tgpu.resolve([vertexFunction]);

    expect(resolved).toContain(`\
struct vertex_fn_Output {
  @builtin(position) outPos: vec4f,
}`);
    expect(resolved).toContain('-> vertex_fn_Output {');
    expect(resolved).not.toContain('VertexOutput');
  });

  it('adds output struct definition when resolving fragment functions', () => {
    const fragmentFunction = tgpu
      .fragmentFn({
        in: { position: d.builtin.position },
        out: { a: d.vec4f, b: d.builtin.fragDepth },
      })(/* wgsl */ `{
        var out: Out;
        out.a = vec4f(1.0);
        out.b = 1;
        return out;
      }`)
      .$name('fragment');

    const resolved = tgpu.resolve([fragmentFunction]);

    expect(resolved).toContain(`\
struct fragment_Output {
  @location(0) a: vec4f,
  @builtin(frag_depth) b: f32,
}`);
    expect(resolved).toContain('-> fragment_Output {');
    expect(resolved).not.toContain(' Out');
  });

  it('properly handles fragment functions with a single output argument', () => {
    const fragmentFunction = tgpu
      .fragmentFn({
        in: { position: d.builtin.position },
        out: d.vec4f,
      })(/* wgsl */ `{
        return vec4f(1.0f);
      }`)
      .$name('fragment');

    expect(tgpu.resolve([fragmentFunction])).toMatchInlineSnapshot(`
      "struct fragment_Input {
        @builtin(position) position: vec4f,
      }

      @fragment fn fragment(in: fragment_Input) -> @location(0)  vec4f {
              return vec4f(1.0f);
            }"
    `);
  });

  it('automatically adds struct definitions of argument types when resolving wgsl-defined functions', () => {
    const Point = d.struct({
      a: d.u32,
      b: d.u32,
    });

    const func = tgpu
      .fn([d.vec4f, Point])(/* wgsl */ `(a: vec4f, b: Point) {
        var newPoint: Point;
        newPoint = b;
      }`)
      .$name('newPointF');

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "struct Point {
        a: u32,
        b: u32,
      }

      fn newPointF(a: vec4f, b: Point) {
              var newPoint: Point;
              newPoint = b;
            }"
    `);
  });

  it('replaces references when adding struct definitions of argument types when resolving wgsl-defined functions', () => {
    const Point = d
      .struct({
        a: d.u32,
        b: d.u32,
      })
      .$name('P');

    const func = tgpu
      .fn(
        [d.vec4f, Point],
        d.vec2f,
      )(/* wgsl */ `(
        a: vec4f,
        b: PointStruct
      ) -> vec2f {
        var newPoint: PointStruct;
        newPoint = b;
      }`)
      .$name('newPointF');

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "struct P {
        a: u32,
        b: u32,
      }

      fn newPointF(a: vec4f, b: P) -> vec2f{
              var newPoint: P;
              newPoint = b;
            }"
    `);
  });

  it('adds return type struct definitions when resolving wgsl-defined functions', () => {
    const Point = d
      .struct({
        a: d.u32,
        b: d.u32,
      })
      .$name('P');

    const func = tgpu
      .fn(
        [d.vec4f],
        Point,
      )(/* wgsl */ `(a: vec4f) -> PointStruct {
        var newPoint: PointStruct;
        newPoint = b;
        return newPoint;
      }`)
      .$name('newPointF');

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "struct P {
        a: u32,
        b: u32,
      }

      fn newPointF(a: vec4f) -> P{
              var newPoint: P;
              newPoint = b;
              return newPoint;
            }"
    `);
  });

  // TODO: handle nested structs
  // it('adds return type nested struct definitions when resolving wgsl-defined functions', () => {
  //   const Point = d.struct({ a: d.u32 }).$name('P');

  //   const func = tgpu
  //     .fn([d.arrayOf(Point, 4)])(/* wgsl */ `(a: array<MyPoint, 4>) {
  //       return;
  //     }`)
  //     .$name('f');

  //   expect(parseResolved({ func })).toBe(
  //     parse(`
  //   struct P {
  //     a: u32,
  //   }

  //   fn f(a: array<P, 4>) {
  //     return;
  //   }`),
  //   );
  // });

  it('resolves object externals and replaces their usages in code', () => {
    const getColor = tgpu
      .fn(
        [],
        d.vec3f,
      )(`() -> vec3f {
        let color = vec3f();
        return color;
      }`)
      .$name('get_color');

    const main = tgpu
      .fn(
        [],
        d.f32,
      )(`() -> f32 {
        let c = functions.getColor();
        return c.x;
      }`)
      .$name('main')
      .$uses({ functions: { getColor } });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn get_color() -> vec3f{
              let color = vec3f();
              return color;
            }

      fn main() -> f32{
              let c = get_color();
              return c.x;
            }"
    `);
  });

  it('resolves compound types with structs provided in externals', () => {
    const Point = d.struct({ a: d.u32 }).$name('P');

    const getColor = tgpu
      .fn(
        [d.arrayOf(Point, 4)],
        d.u32,
      )(
        `(a: array<MyPoint, 4>) {
        var b: MyPoint = a[0];
        return b.a;
      }`,
      )
      .$name('get_color')
      .$uses({ MyPoint: Point });

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "struct P {
        a: u32,
      }

      fn get_color(a: array<P,4>) -> u32{
              var b: P = a[0];
              return b.a;
            }"
    `);
  });
});

describe('tgpu.fn with raw wgsl and missing types', () => {
  it('resolves missing base types', () => {
    const getColor = tgpu
      .fn(
        [d.vec3f, d.u32, d.mat2x2f, d.bool, d.vec2b],
        d.vec4u,
      )(`(a, b: u32, c, d, e) {
        return vec4u();
      }`)
      .$name('get_color');

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "fn get_color(a: vec3f, b: u32, c: mat2x2f, d: bool, e: vec2<bool>) -> vec4u{
              return vec4u();
            }"
    `);
  });

  it('resolves void functions', () => {
    const getColor = tgpu.fn([])(`() {
      return;
    }`);

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "fn getColor() {
            return;
          }"
    `);
  });

  it('resolves compound types', () => {
    const getColor = tgpu.fn(
      [d.arrayOf(d.u32, 4)],
      d.u32,
    )(`(a) {
      return a[0];
    }`);

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "fn getColor(a: array<u32,4>) -> u32{
            return a[0];
          }"
    `);
  });

  it('resolves compound types with structs provided in externals', () => {
    const Point = d.struct({ a: d.u32 }).$name('P');

    const getColor = tgpu
      .fn(
        [d.arrayOf(Point, 4)],
        d.u32,
      )(`(a) {
        var b: MyPoint = a[0];
        return b.a;
      }`)
      .$uses({ MyPoint: Point });

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "struct P {
        a: u32,
      }

      fn getColor(a: array<P,4>) -> u32{
              var b: P = a[0];
              return b.a;
            }"
    `);
  });

  it('replaces references when one struct is named in wgsl', () => {
    const Point = d
      .struct({
        a: d.u32,
        b: d.u32,
      })
      .$name('P');

    const func = tgpu
      .fn(
        [Point, Point],
        Point,
      )(`(a, b: PointStruct) {
        return b;
      }`)
      .$name('newPointF');

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "struct P {
        a: u32,
        b: u32,
      }

      fn newPointF(a: P, b: P) -> P{
              return b;
            }"
    `);
  });

  it('throws when parameter type mismatch', () => {
    const getColor = tgpu.fn([d.vec3f])(`(a: vec4f) {
      return;
    }`);

    expect(() => tgpu.resolve([getColor])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:getColor: Type mismatch between TGPU shell and WGSL code string: parameter a, JS type "vec3f", WGSL type "vec4f".]
    `);
  });

  it('throws when compound parameter type mismatch', () => {
    const Point = d.struct({ a: d.u32 }).$name('P');

    const getColor = tgpu
      .fn([d.arrayOf(Point, 4)])(`(a: arrayOf<MyPoint, 3>) {
      return;
    }`)
      .$uses({ MyPoint: Point });

    expect(() => tgpu.resolve([getColor])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:getColor: Type mismatch between TGPU shell and WGSL code string: parameter a, JS type "array<P,4>", WGSL type "arrayOf<P,3>".]
    `);
  });

  it('throws when return type mismatch', () => {
    const getColor = tgpu.fn(
      [],
      d.vec4f,
    )(`() -> vec2f {
      return;
    }`);

    expect(() => tgpu.resolve([getColor])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:getColor: Type mismatch between TGPU shell and WGSL code string: return type, JS type "vec4f", WGSL type "vec2f".]
    `);
  });

  it('throws when wrong argument count', () => {
    const getColor = tgpu.fn([d.vec3f, d.vec4f])(`(a, b, c) {
      return;
    }`);

    expect(() => tgpu.resolve([getColor])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:getColor: WGSL implementation has 3 arguments, while the shell has 2 arguments.]
    `);
  });

  it('resolves implicitly typed struct without externals', () => {
    const Point = d.struct({ a: d.i32 });
    const getColor = tgpu.fn([Point])(`(a) {
      return;
    }`);

    expect(tgpu.resolve([getColor])).toMatchInlineSnapshot(`
      "struct Point {
        a: i32,
      }

      fn getColor(a: Point) {
            return;
          }"
    `);
  });
});

describe('tgpu.computeFn with raw string WGSL implementation', () => {
  it('does not replace supposed input arg types in code', () => {
    const foo = tgpu.computeFn({
      workgroupSize: [1],
      in: {
        gid: d.builtin.globalInvocationId,
      },
    })(`{
      var result: array<f32, 4>;
    }`);

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "struct foo_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn foo(in: foo_Input)  {
            var result: array<f32, 4>;
          }"
    `);
  });
});
