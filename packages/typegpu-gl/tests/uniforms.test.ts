import { describe, beforeEach, expect, vi } from 'vitest';
import { tgpu, d } from 'typegpu';
import { dualGlOptions, glOptions, initWithGL } from '@typegpu/gl';
import { it } from './utils/extendedTest.ts';

describe('TgpuRootWebGL - createUniform', () => {
  // TODO(#2510): Unskip this if uniforms are backed by UBOs
  it.skip('creates a WebGL UBO-backed uniform', ({ gl }) => {
    const root = initWithGL({ gl });

    const uniform = root.createUniform(d.vec4f);
    expect(uniform).toBeDefined();
    expect(uniform.resourceType).toBe('uniform');

    expect(gl.createBuffer).toHaveBeenCalled();
  });

  // TODO(#2510): Unskip this if uniforms are backed by UBOs
  it.skip('creates a uniform with an initial value', ({ gl }) => {
    const root = initWithGL({ gl });

    const uniform = root.createUniform(d.f32, 42);
    expect(uniform).toBeDefined();
    // Should have called bufferData to set initial value
    expect(gl.bufferData).toHaveBeenCalled();
  });

  it('allows writing to the uniform', async ({ gl }) => {
    const root = initWithGL({ gl });

    const uniform = root.createUniform(d.f32);
    uniform.write(1.0);

    expect(await uniform.read()).toBe(1.0);
  });
});

describe('GlslGenerator - uniform resolution', () => {
  it('emits a uniform declaration and references the name in shader body', ({ gl }) => {
    const root = initWithGL({ gl });
    const time = root.createUniform(d.f32);

    const fn = () => {
      'use gpu';
      return d.f32(time.$);
    };

    const result = tgpu.resolve([fn], glOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform float time;

      float fn_1() {
        return time;
      }"
    `);
  });

  it('shared uniforms are defined per shader stage, and share a name', ({ gl }) => {
    const root = initWithGL({ gl });
    const time = root.createUniform(d.f32);
    const timeAlias = time;

    function vertexHelper() {
      'use gpu';
      return time.$ * 2;
    }

    function fragmentHelper() {
      'use gpu';
      // deliberately shadowing time to determine whether `time`
      // has already been reserved by the uniform.
      const time = 10.5;
      return timeAlias.$ * time;
    }

    const options = dualGlOptions();

    expect(tgpu.resolve([vertexHelper], { ...options.vertex })).toMatchInlineSnapshot(`
      "uniform float time;

      float vertexHelper() {
        return (time * 2.0);
      }"
    `);

    expect(tgpu.resolve([fragmentHelper], { ...options.fragment })).toMatchInlineSnapshot(`
      "uniform float time;

      float fragmentHelper() {
        float time_1 = 10.5;
        return (time * time_1);
      }"
    `);
  });

  it('emits a vec3f uniform as vec3', ({ gl }) => {
    const root = initWithGL({ gl });
    const color = root.createUniform(d.vec3f);

    const fn = () => {
      'use gpu';
      return d.vec3f(color.$);
    };

    const result = tgpu.resolve([fn], glOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform vec3 color;

      vec3 fn_1() {
        return color;
      }"
    `);
  });

  it('emits multiple uniforms with the same label', ({ gl }) => {
    const root = initWithGL({ gl });
    const time = root.createUniform(d.f32);
    const TIME = root.createUniform(d.f32).$name('time');

    const fn = () => {
      'use gpu';
      return time.$ * TIME.$;
    };

    const result = tgpu.resolve([fn], glOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform float time;

      uniform float time_1;

      float fn_1() {
        return (time * time_1);
      }"
    `);
  });

  it('emits a mat2x2f uniform as mat2', ({ gl }) => {
    const root = initWithGL({ gl });
    const transform = root.createUniform(d.mat2x2f);

    function fn(v: d.v2f) {
      'use gpu';
      return transform.$ * v;
    }

    function main() {
      'use gpu';
      return fn(d.vec2f(1, 2));
    }

    const result = tgpu.resolve([main], glOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform mat2 transform;

      vec2 fn_1(vec2 v) {
        return (transform * v);
      }

      vec2 main() {
        return fn_1(vec2(1, 2));
      }"
    `);
  });
});

describe('TgpuRootWebGL - uploading uniforms', () => {
  /** Creates and draws with a pipeline whose fragment shader returns `value()` */
  function drawWith(root: ReturnType<typeof initWithGL>, value: () => d.v4f) {
    const pipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1) };
      },
      fragment: () => {
        'use gpu';
        return value();
      },
    });
    pipeline.draw(3);
    return pipeline;
  }

  function uploadedValues(mock: unknown, name: string) {
    const calls = vi.mocked(mock as (...args: unknown[]) => void).mock.calls;
    const call = calls.find(([location]) => (location as { name: string }).name === name);
    return call?.at(-1) as Float32Array | Int32Array | Uint32Array | undefined;
  }

  it('uploads arrays of mat4x4f and vec4f as they are', ({ gl }) => {
    const root = initWithGL({ gl });
    const joints = root.createUniform(d.arrayOf(d.mat4x4f, 3));
    const colors = root.createUniform(d.arrayOf(d.vec4f, 2), [d.vec4f(1, 2, 3, 4), d.vec4f(5)]);

    drawWith(root, () => {
      'use gpu';
      return joints.$[2]! * colors.$[1]!;
    });

    const jointValues = uploadedValues(gl.uniformMatrix4fv, 'joints');
    expect(jointValues).toHaveLength(48);
    // No copies are made when the layouts match
    expect(jointValues?.buffer).toBe(joints.buffer.arrayBuffer);
    expect(uploadedValues(gl.uniform4fv, 'colors')).toStrictEqual(
      new Float32Array([1, 2, 3, 4, 5, 5, 5, 5]),
    );
  });

  it('packs padded elements tightly', ({ gl }) => {
    const root = initWithGL({ gl });
    const positions = root.createUniform(d.arrayOf(d.vec3f, 2), [
      d.vec3f(1, 2, 3),
      d.vec3f(4, 5, 6),
    ]);
    const rotation = root.createUniform(d.mat3x3f, d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9));
    const cells = root.createUniform(d.arrayOf(d.vec2i, 2), [d.vec2i(-1, 2), d.vec2i(3, -4)]);
    const ids = root.createUniform(d.arrayOf(d.u32, 3), [7, 8, 9]);

    drawWith(root, () => {
      'use gpu';
      const cell = d.vec2f(cells.$[1]!);
      return d.vec4f(rotation.$ * positions.$[1]!, cell.x + d.f32(ids.$[2]));
    });

    expect(uploadedValues(gl.uniform3fv, 'positions')).toStrictEqual(
      new Float32Array([1, 2, 3, 4, 5, 6]),
    );
    expect(uploadedValues(gl.uniformMatrix3fv, 'rotation')).toStrictEqual(
      new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    );
    expect(uploadedValues(gl.uniform2iv, 'cells')).toStrictEqual(new Int32Array([-1, 2, 3, -4]));
    expect(uploadedValues(gl.uniform1uiv, 'ids')).toStrictEqual(new Uint32Array([7, 8, 9]));
  });

  it('uploads structs and arrays of structs member by member', ({ gl }) => {
    const root = initWithGL({ gl });
    const Light = d.struct({ color: d.vec3f, intensity: d.f32, direction: d.vec3f });
    const sun = root.createUniform(Light, {
      color: d.vec3f(1, 0.5, 0),
      intensity: 2,
      direction: d.vec3f(0, -1, 0),
    });
    const lights = root.createUniform(d.arrayOf(Light, 2), [
      { color: d.vec3f(1), intensity: 3, direction: d.vec3f(0, 0, 1) },
      { color: d.vec3f(0, 1, 0), intensity: 4, direction: d.vec3f(1, 0, 0) },
    ]);

    drawWith(root, () => {
      'use gpu';
      const light = lights.$[1]!;
      return d.vec4f(sun.$.color * sun.$.intensity + light.color, light.direction.x);
    });

    const shaderSources = vi.mocked(gl.shaderSource).mock.calls.map((call) => call[1]);
    expect(shaderSources[1]).toContain('uniform Light sun;');
    expect(shaderSources[1]).toContain('uniform Light lights[2];');

    expect(uploadedValues(gl.uniform3fv, 'sun.color')).toStrictEqual(new Float32Array([1, 0.5, 0]));
    expect(uploadedValues(gl.uniform1fv, 'sun.intensity')).toStrictEqual(new Float32Array([2]));
    expect(uploadedValues(gl.uniform3fv, 'sun.direction')).toStrictEqual(
      new Float32Array([0, -1, 0]),
    );
    expect(uploadedValues(gl.uniform1fv, 'lights[1].intensity')).toStrictEqual(
      new Float32Array([4]),
    );
    expect(uploadedValues(gl.uniform3fv, 'lights[1].direction')).toStrictEqual(
      new Float32Array([1, 0, 0]),
    );
  });

  it('uploads values only when they change', ({ gl }) => {
    const root = initWithGL({ gl });
    const tint = root.createUniform(d.vec4f);
    const pipeline = drawWith(root, () => {
      'use gpu';
      return d.vec4f(tint.$);
    });

    pipeline.draw(3);
    expect(gl.uniform4fv).toHaveBeenCalledOnce();

    tint.write(d.vec4f(1));
    pipeline.draw(3);
    expect(gl.uniform4fv).toHaveBeenCalledTimes(2);
  });
});
