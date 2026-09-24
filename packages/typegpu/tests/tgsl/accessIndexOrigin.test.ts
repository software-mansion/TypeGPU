import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { extractSnippetFromFn } from '../utils/parseResolved.ts';
import { tgpu, d } from 'typegpu';

describe('index access origin', () => {
  const index = tgpu.privateVar(d.i32);
  const getRuntimeInt = () => {
    'use gpu';
    return d.i32(index.$);
  };

  describe('on arrays', () => {
    const arraySchema = d.arrayOf(d.i32, 3);

    describe('preserves array origin when indexed with a constant', () => {
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
            source = root.createUniform(arraySchema);
            break;
          case 'readonly':
            source = root.createReadonly(arraySchema);
            break;
          case 'mutable':
            source = root.createMutable(arraySchema);
            break;
          case 'private':
            source = tgpu.privateVar(arraySchema);
            break;
          case 'workgroup':
            source = tgpu.workgroupVar(arraySchema);
            break;
          case 'constant-immutable-def':
            source = tgpu.const(arraySchema, arraySchema());
            break;
        }

        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$[1]!;
        });

        expect(accessSnippet.origin).toBe(origin);
      });

      it('argument', () => {
        const fn = tgpu.fn(
          [arraySchema],
          d.i32,
        )((source) => {
          'use gpu';
          return source[1]!;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('argument');
      });

      it('function', () => {
        const fn = tgpu.fn(
          [d.ptrFn(arraySchema)],
          d.i32,
        )((source) => {
          'use gpu';
          return source.$[1]!;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('function');
      });

      it('local-def', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          const source = arraySchema();
          return source[1]!;
        });

        expect(accessSnippet.origin).toBe('local-def');
      });

      it('runtime-immutable-def', () => {
        const source = tgpu.const(d.arrayOf(arraySchema, 2), [arraySchema(), arraySchema()]);
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$[getRuntimeInt()]![1]!;
        });

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it('constant', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return arraySchema()[1]!;
        });

        expect(accessSnippet.origin).toBe('constant');
      });

      it('runtime', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return arraySchema([getRuntimeInt(), 0, 0])[1]!;
        });

        expect(accessSnippet.origin).toBe('runtime');
      });
    });

    describe('preserves array origin when indexed with a runtime index', () => {
      it.for(['uniform', 'readonly', 'mutable', 'private', 'workgroup'] as const)(
        '%s',
        (origin, { root }) => {
          let source;
          switch (origin) {
            case 'uniform':
              source = root.createUniform(arraySchema);
              break;
            case 'readonly':
              source = root.createReadonly(arraySchema);
              break;
            case 'mutable':
              source = root.createMutable(arraySchema);
              break;
            case 'private':
              source = tgpu.privateVar(arraySchema);
              break;
            case 'workgroup':
              source = tgpu.workgroupVar(arraySchema);
              break;
          }

          const accessSnippet = extractSnippetFromFn(() => {
            'use gpu';
            return source.$[getRuntimeInt()];
          });

          expect(accessSnippet.origin).toBe(origin);
        },
      );

      it('argument', () => {
        const fn = tgpu.fn(
          [arraySchema],
          d.i32,
        )((source) => {
          'use gpu';
          return source[getRuntimeInt()] as number;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('argument');
      });

      it('function', () => {
        const fn = tgpu.fn(
          [d.ptrFn(arraySchema)],
          d.i32,
        )((source) => {
          'use gpu';
          return source.$[getRuntimeInt()] as number;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('function');
      });

      it('local-def', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          const source = arraySchema();
          return source[getRuntimeInt()] as number;
        });

        expect(accessSnippet.origin).toBe('local-def');
      });

      it('runtime-immutable-def', () => {
        const source = tgpu.const(d.arrayOf(arraySchema, 2), [arraySchema(), arraySchema()]);
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$[getRuntimeInt()]![getRuntimeInt()];
        });

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it('runtime', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return arraySchema([getRuntimeInt(), 0, 0])[getRuntimeInt()] as number;
        });

        expect(accessSnippet.origin).toBe('runtime');
      });
    });

    describe('changes origin when indexed with a runtime index', () => {
      it('from constant-immutable-def to runtime-immutable-def', () => {
        const source = tgpu.const(arraySchema, arraySchema());
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$[getRuntimeInt()] as number;
        });

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it('from constant to runtime', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return arraySchema()[getRuntimeInt()] as number;
        });

        expect(accessSnippet.origin).toBe('runtime');
      });
    });
  });

  describe('on vectors', () => {
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
            source = root.createUniform(d.vec3i);
            break;
          case 'readonly':
            source = root.createReadonly(d.vec3i);
            break;
          case 'mutable':
            source = root.createMutable(d.vec3i);
            break;
          case 'private':
            source = tgpu.privateVar(d.vec3i);
            break;
          case 'workgroup':
            source = tgpu.workgroupVar(d.vec3i);
            break;
          case 'constant-immutable-def':
            source = tgpu.const(d.vec3i, d.vec3i());
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
          [d.vec3i],
          d.i32,
        )((source) => {
          'use gpu';
          return source[1];
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('argument');
      });

      it('function', () => {
        const fn = tgpu.fn(
          [d.ptrFn(d.vec3i)],
          d.i32,
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
          const source = d.vec3i();
          return source[1];
        });

        expect(accessSnippet.origin).toBe('local-def');
      });

      it('runtime-immutable-def', () => {
        const source = tgpu.const(d.arrayOf(d.vec3i, 2), [d.vec3i(), d.vec3i()]);
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$[getRuntimeInt()]![1];
        });

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it('constant', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return d.vec3i()[1];
        });

        expect(accessSnippet.origin).toBe('constant');
      });

      it('runtime', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return d.vec3i(getRuntimeInt())[1];
        });

        expect(accessSnippet.origin).toBe('runtime');
      });
    });

    describe('preserves vector origin when indexed with a runtime index', () => {
      it.for(['uniform', 'readonly', 'mutable', 'private', 'workgroup'] as const)(
        '%s',
        (origin, { root }) => {
          let source;
          switch (origin) {
            case 'uniform':
              source = root.createUniform(d.vec3i);
              break;
            case 'readonly':
              source = root.createReadonly(d.vec3i);
              break;
            case 'mutable':
              source = root.createMutable(d.vec3i);
              break;
            case 'private':
              source = tgpu.privateVar(d.vec3i);
              break;
            case 'workgroup':
              source = tgpu.workgroupVar(d.vec3i);
              break;
          }

          const accessSnippet = extractSnippetFromFn(() => {
            'use gpu';
            return source.$[getRuntimeInt()];
          });

          expect(accessSnippet.origin).toBe(origin);
        },
      );

      it('argument', () => {
        const fn = tgpu.fn(
          [d.vec3i],
          d.i32,
        )((source) => {
          'use gpu';
          return source[getRuntimeInt()] as number;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('argument');
      });

      it('function', () => {
        const fn = tgpu.fn(
          [d.ptrFn(d.vec3i)],
          d.i32,
        )((source) => {
          'use gpu';
          return source.$[getRuntimeInt()] as number;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('function');
      });

      it('local-def', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          const source = d.vec3i();
          return source[getRuntimeInt()] as number;
        });

        expect(accessSnippet.origin).toBe('local-def');
      });

      it('runtime-immutable-def', () => {
        const source = tgpu.const(d.arrayOf(d.vec3i, 2), [d.vec3i(), d.vec3i()]);
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$[getRuntimeInt()]![getRuntimeInt()] as number;
        });

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it('runtime', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return d.vec3i(getRuntimeInt())[getRuntimeInt()] as number;
        });

        expect(accessSnippet.origin).toBe('runtime');
      });
    });

    describe('changes origin when indexed with a runtime index', () => {
      it.fails('from constant-immutable-def to runtime-immutable-def', () => {
        const source = tgpu.const(d.vec3i, d.vec3i());
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$[getRuntimeInt()] as number;
        });

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it.fails('from constant to runtime', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return d.vec3i()[getRuntimeInt()] as number;
        });

        expect(accessSnippet.origin).toBe('runtime');
      });
    });
  });

  describe('on matrix columns', () => {
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
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$[getRuntimeInt()]!.columns[1];
        });

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
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return d.mat2x2f(d.f32(getRuntimeInt()), 0, 0, 0).columns[1];
        });

        expect(accessSnippet.origin).toBe('runtime');
      });
    });

    describe('preserves matrix origin when indexed with a runtime index', () => {
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
            return source.$.columns[getRuntimeInt()];
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
          return source.columns[getRuntimeInt()] as d.v2f;
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
          return source.$.columns[getRuntimeInt()] as d.v2f;
        });
        const accessSnippet = extractSnippetFromFn(fn);

        expect(accessSnippet.origin).toBe('function');
      });

      it('local-def', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          const source = d.mat2x2f();
          return source.columns[getRuntimeInt()] as d.v2f;
        });

        expect(accessSnippet.origin).toBe('local-def');
      });

      it('runtime-immutable-def', () => {
        const source = tgpu.const(d.arrayOf(d.mat2x2f, 2), [d.mat2x2f(), d.mat2x2f()]);
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$[getRuntimeInt()]!.columns[getRuntimeInt()] as d.v2f;
        });

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it('runtime', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return d.mat2x2f(d.f32(getRuntimeInt()), 0, 0, 0).columns[getRuntimeInt()] as d.v2f;
        });

        expect(accessSnippet.origin).toBe('runtime');
      });
    });

    describe('changes origin when indexed with a runtime index', () => {
      it.fails('from constant-immutable-def to runtime-immutable-def', () => {
        const source = tgpu.const(d.mat2x2f, d.mat2x2f());
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return source.$.columns[getRuntimeInt()] as d.v2f;
        });

        expect(accessSnippet.origin).toBe('runtime-immutable-def');
      });

      it.fails('from constant to runtime', () => {
        const accessSnippet = extractSnippetFromFn(() => {
          'use gpu';
          return d.mat2x2f().columns[getRuntimeInt()] as d.v2f;
        });

        expect(accessSnippet.origin).toBe('runtime');
      });
    });
  });
});
