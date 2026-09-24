import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { expectSnippetOf, extractSnippetFromFn } from '../utils/parseResolved.ts';
import { tgpu, d } from 'typegpu';

describe('index access origin', () => {
  describe('on vector', () => {
    describe('preserves vector origin when indexed with a constant', () => {
      it.for([
        'uniform',
        'readonly',
        'mutable',
        'private',
        'workgroup',
        'constant-immutable-def',
      ] as const)('%s', (origin, { root }) => {
        let source;
        switch (origin) {
          case 'uniform':
            source = root.createUniform(d.vec3f);
            break;
          case 'readonly':
            source = root.createReadonly(d.vec3f);
            break;
          case 'mutable':
            source = root.createMutable(d.vec3f);
            break;
          case 'private':
            source = tgpu.privateVar(d.vec3f);
            break;
          case 'workgroup':
            source = tgpu.workgroupVar(d.vec3f);
            break;
          case 'constant-immutable-def':
            source = tgpu.const(d.vec3f, d.vec3f());
            break;
        }

        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$[1];
        });

        expect(accessSnippet.origin).toBe(origin);
      });

      it('argument', () => {
        const fn = tgpu.fn(
          [d.vec3f],
          d.f32,
        )((source) => {
          'use gpu';
          return source[1];
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('argument');
      });

      it('function', () => {
        const fn = tgpu.fn(
          [d.ptrFn(d.vec3f)],
          d.f32,
        )((source) => {
          'use gpu';
          return source.$[1];
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('function');
      });

      it('local-def', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          const source = d.vec3f();
          return source[1];
        });

        expect(accessSnippet.origin).toBe('local-def');
      });

      it('runtime-immutable-def', () => {
        const source = tgpu.const(d.arrayOf(d.vec3f, 2), [d.vec3f(), d.vec3f()]);
        const fn = tgpu.fn(
          [d.i32],
          d.f32,
        )((index) => {
          'use gpu';
          return source.$[index]![1];
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it('constant', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return d.vec3f()[1];
        });

        expect(accessSnippet.origin).toBe('constant');
      });

      it('runtime', () => {
        const fn = tgpu.fn(
          [d.f32],
          d.f32,
        )((x) => {
          'use gpu';
          return d.vec3f(x)[1];
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('runtime');
      });
    });

    const index = tgpu.privateVar(d.i32);
    const getIndex = () => {
      'use gpu';
      return d.i32(index.$);
    };

    describe('preserves vector origin when indexed with a runtime index', () => {
      it.for(['uniform', 'readonly', 'mutable', 'private', 'workgroup'] as const)(
        '%s',
        (origin, { root }) => {
          let source;
          switch (origin) {
            case 'uniform':
              source = root.createUniform(d.vec3f);
              break;
            case 'readonly':
              source = root.createReadonly(d.vec3f);
              break;
            case 'mutable':
              source = root.createMutable(d.vec3f);
              break;
            case 'private':
              source = tgpu.privateVar(d.vec3f);
              break;
            case 'workgroup':
              source = tgpu.workgroupVar(d.vec3f);
              break;
          }

          const accessSnippet = extractSnippetFromFn(() => {
            'use gpu';
            return source.$[getIndex()];
          });

          expect(accessSnippet.origin).toBe(origin);
        },
      );

      it('argument', () => {
        const fn = tgpu.fn(
          [d.vec3f],
          d.f32,
        )((source) => {
          'use gpu';
          return source[getIndex()] as number;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('argument');
      });

      it('function', () => {
        const fn = tgpu.fn(
          [d.ptrFn(d.vec3f)],
          d.f32,
        )((source) => {
          'use gpu';
          return source.$[getIndex()] as number;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('function');
      });

      it('local-def', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          const source = d.vec3f();
          return source[getIndex()] as number;
        });

        expect(accessSnippet.origin).toBe('local-def');
      });

      it('runtime-immutable-def', () => {
        const source = tgpu.const(d.arrayOf(d.vec3f, 2), [d.vec3f(), d.vec3f()]);
        const fn = tgpu.fn(
          [d.i32],
          d.f32,
        )((index) => {
          'use gpu';
          return source.$[index]![getIndex()] as number;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it('runtime', () => {
        const fn = tgpu.fn(
          [d.f32],
          d.f32,
        )((x) => {
          'use gpu';
          return d.vec3f(x)[getIndex()] as number;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('runtime');
      });
    });

    describe('changes origin when indexed with a runtime index', () => {
      it.fails('from constant-immutable-def to runtime-immutable-def', () => {
        const source = tgpu.const(d.vec3f, d.vec3f());
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$[getIndex()] as number;
        });

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it.fails('from constant to runtime', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return d.vec3f()[getIndex()] as number;
        });

        expect(accessSnippet.origin).toBe('runtime');
      });
    });
  });

  describe('on matrix', () => {
    describe('preserves matrix origin when indexed with a constant', () => {
      it.for([
        'uniform',
        'readonly',
        'mutable',
        'private',
        'workgroup',
        'constant-immutable-def',
      ] as const)('%s', (origin, { root }) => {
        let source;
        switch (origin) {
          case 'uniform':
            source = root.createUniform(d.mat2x2f);
            break;
          case 'readonly':
            source = root.createReadonly(d.mat2x2f);
            break;
          case 'mutable':
            source = root.createMutable(d.mat2x2f);
            break;
          case 'private':
            source = tgpu.privateVar(d.mat2x2f);
            break;
          case 'workgroup':
            source = tgpu.workgroupVar(d.mat2x2f);
            break;
          case 'constant-immutable-def':
            source = tgpu.const(d.mat2x2f, d.mat2x2f());
            break;
        }

        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$.columns[1];
        });

        expect(accessSnippet.origin).toBe(origin);
      });

      it('argument', () => {
        const fn = tgpu.fn(
          [d.mat2x2f],
          d.vec2f,
        )((source) => {
          'use gpu';
          return source.columns[1];
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('argument');
      });

      it('function', () => {
        const fn = tgpu.fn(
          [d.ptrFn(d.mat2x2f)],
          d.vec2f,
        )((source) => {
          'use gpu';
          return source.$.columns[1];
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('function');
      });

      it('local-def', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          const source = d.mat2x2f();
          return source.columns[1];
        });

        expect(accessSnippet.origin).toBe('local-def');
      });

      it('runtime-immutable-def', () => {
        const source = tgpu.const(d.arrayOf(d.mat2x2f, 2), [d.mat2x2f(), d.mat2x2f()]);
        const fn = tgpu.fn(
          [d.i32],
          d.vec2f,
        )((index) => {
          'use gpu';
          return source.$[index]!.columns[1];
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it('constant', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return d.mat2x2f().columns[1];
        });

        expect(accessSnippet.origin).toBe('constant');
      });

      it('runtime', () => {
        const fn = tgpu.fn(
          [d.f32],
          d.vec2f,
        )((x) => {
          'use gpu';
          return d.mat2x2f(x, 0, 0, x).columns[1];
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('runtime');
      });
    });

    const index = tgpu.privateVar(d.i32);
    const getIndex = () => {
      'use gpu';
      return d.i32(index.$);
    };

    describe('preserves vector origin when indexed with a runtime index', () => {
      it.for(['uniform', 'readonly', 'mutable', 'private', 'workgroup'] as const)(
        '%s',
        (origin, { root }) => {
          let source;
          switch (origin) {
            case 'uniform':
              source = root.createUniform(d.mat2x2f);
              break;
            case 'readonly':
              source = root.createReadonly(d.mat2x2f);
              break;
            case 'mutable':
              source = root.createMutable(d.mat2x2f);
              break;
            case 'private':
              source = tgpu.privateVar(d.mat2x2f);
              break;
            case 'workgroup':
              source = tgpu.workgroupVar(d.mat2x2f);
              break;
          }

          const accessSnippet = extractSnippetFromFn(() => {
            'use gpu';
            return source.$.columns[getIndex()];
          });

          expect(accessSnippet.origin).toBe(origin);
        },
      );

      it('argument', () => {
        const fn = tgpu.fn(
          [d.mat2x2f],
          d.vec2f,
        )((source) => {
          'use gpu';
          return source.columns[getIndex()] as d.v2f;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('argument');
      });

      it('function', () => {
        const fn = tgpu.fn(
          [d.ptrFn(d.mat2x2f)],
          d.vec2f,
        )((source) => {
          'use gpu';
          return source.$.columns[getIndex()] as d.v2f;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('function');
      });

      it('local-def', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          const source = d.mat2x2f();
          return source.columns[getIndex()] as d.v2f;
        });

        expect(accessSnippet.origin).toBe('local-def');
      });

      it('runtime-immutable-def', () => {
        const source = tgpu.const(d.arrayOf(d.mat2x2f, 2), [d.mat2x2f(), d.mat2x2f()]);
        const fn = tgpu.fn(
          [d.i32],
          d.vec2f,
        )((index) => {
          'use gpu';
          return source.$[index]!.columns[getIndex()] as d.v2f;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it('runtime', () => {
        const fn = tgpu.fn(
          [d.f32],
          d.vec2f,
        )((x) => {
          'use gpu';
          return d.mat2x2f(x, 0, 0, x).columns[getIndex()] as d.v2f;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('runtime');
      });
    });

    describe('changes origin when indexed with a runtime index', () => {
      it.fails('from constant-immutable-def to runtime-immutable-def', () => {
        const source = tgpu.const(d.mat2x2f, d.mat2x2f());
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$.columns[getIndex()] as d.v2f;
        });

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it.fails('from constant to runtime', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return d.mat2x2f().columns[getIndex()] as d.v2f;
        });

        expect(accessSnippet.origin).toBe('runtime');
      });
    });
  });
});
