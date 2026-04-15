import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import tgpu, { d } from '../../src/index.js';

describe('reference consumption', () => {
  const Boid = d.struct({ pos: d.vec3f, vel: d.vec3f });
  const layout = tgpu.bindGroupLayout({
    boids: { storage: d.arrayOf(Boid, 10), access: 'mutable' },
  });

  describe('successful single consumption', () => {
    it('allows assigning a local variable reference to a storage buffer element', () => {
      const main = () => {
        'use gpu';
        const boid = Boid({ pos: d.vec3f(1, 2, 3), vel: d.vec3f(4, 5, 6) });
        layout.$.boids[0] = boid;
      };

      expect(tgpu.resolve([main])).toMatchInlineSnapshot();
    });

    it('allows assigning a reference read from one slot to another', () => {
      const layout = tgpu.bindGroupLayout({
        src: { storage: d.arrayOf(d.vec3f, 10) },
        dst: { storage: d.arrayOf(d.vec3f, 10), access: 'mutable' },
      });

      const main = () => {
        'use gpu';
        const pos = layout.$.src[0]!;
        layout.$.dst[0] = pos;
      };

      expect(tgpu.resolve([main])).toMatchInlineSnapshot();
    });
  });

  describe('mutation after consumption', () => {
    it('fails when mutating a consumed reference (assignment)', () => {
      const main = () => {
        'use gpu';
        const boid = Boid({ pos: d.vec3f(1, 2, 3), vel: d.vec3f(4, 5, 6) });
        layout.$.boids[0] = boid;
        boid.pos = d.vec3f(7, 8, 9);
      };

      expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot();
    });

    it('fails when mutating a consumed reference (simple modification)', () => {
      const main = () => {
        'use gpu';
        const boid = Boid({ pos: d.vec3f(1, 2, 3), vel: d.vec3f(4, 5, 6) });
        layout.$.boids[0] = boid;
        boid.pos.x += 7;
      };

      expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot();
    });
  });

  describe('double consumption', () => {
    it('fails when assigning the same reference twice', () => {
      const main = () => {
        'use gpu';
        const boid = Boid({ pos: d.vec3f(1, 2, 3), vel: d.vec3f(4, 5, 6) });
        layout.$.boids[0] = boid;
        layout.$.boids[1] = boid;
      };

      expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot();
    });

    it('fails when returning a consumed reference', () => {
      const main = () => {
        'use gpu';
        const boid = Boid({ pos: d.vec3f(1, 2, 3), vel: d.vec3f(4, 5, 6) });
        layout.$.boids[0] = boid;
        return boid;
      };

      expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot();
    });
  });

  describe('consumption in loops', () => {
    const layout = tgpu.bindGroupLayout({
      positions: { storage: d.arrayOf(d.vec3f, 10), access: 'mutable' },
    });

    it('fails when consuming a reference inside a for loop', () => {
      const main = () => {
        'use gpu';
        const pos = d.vec3f(1, 2, 3);
        for (let i = 0; i < 10; i++) {
          layout.$.positions[i] = pos;
        }
      };

      expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot();
    });

    it('fails when consuming a reference inside a while loop', () => {
      const main = () => {
        'use gpu';
        const pos = d.vec3f(1, 2, 3);
        let i = 0;
        while (i < 10) {
          layout.$.positions[i] = pos;
          i += 1;
        }
      };

      expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot();
    });
  });

  describe('consumption in branches', () => {
    it('fails when mutating a reference consumed in an if branch', () => {
      const testFn = tgpu.fn([d.bool])((cond) => {
        const boid = Boid({ pos: d.vec3f(1, 2, 3), vel: d.vec3f(4, 5, 6) });
        if (cond) {
          layout.$.boids[0] = boid;
        }
        boid.pos = d.vec3f(7, 8, 9);
      });

      expect(() => tgpu.resolve([testFn])).toThrowErrorMatchingInlineSnapshot();
    });

    it('allows mutating a reference consumed in a pruned if branch', () => {
      const testFn = tgpu.fn([d.bool])((cond) => {
        const boid = Boid({ pos: d.vec3f(1, 2, 3), vel: d.vec3f(4, 5, 6) });
        if (false) {
          layout.$.boids[0] = boid;
        }
        boid.pos = d.vec3f(7, 8, 9);
      });

      expect(tgpu.resolve([testFn])).toMatchInlineSnapshot();
    });

    it('allows consumption and mutation in disjoint branches', () => {
      const testFn = tgpu.fn([d.bool])((cond) => {
        const boid = Boid({ pos: d.vec3f(1, 2, 3), vel: d.vec3f(4, 5, 6) });
        if (cond) {
          layout.$.boids[0] = boid;
        } else {
          boid.pos = d.vec3f(7, 8, 9);
        }
      });

      expect(tgpu.resolve([testFn])).toMatchInlineSnapshot();
    });
  });

  describe('non-mutating use after consumption', () => {
    it('allows passing a consumed reference as a by-value function argument', () => {
      const readPosition = (boid: d.Infer<typeof Boid>) => {
        'use gpu';
        return boid.pos;
      };

      const main = () => {
        'use gpu';
        const boid = Boid({ pos: d.vec3f(1, 2, 3), vel: d.vec3f(4, 5, 6) });
        layout.$.boids[0] = boid;
        const pos = readPosition(boid);
      };

      expect(tgpu.resolve([main])).toMatchInlineSnapshot();
    });
  });
});
