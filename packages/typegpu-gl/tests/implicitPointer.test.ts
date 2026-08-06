// oxlint-disable typescript/no-unnecessary-type-assertion
import { describe, expect } from 'vitest';
import { d, tgpu } from 'typegpu';
import { glOptions } from '@typegpu/gl';
import { it } from './utils/extendedTest.ts';
import { initWithGL } from '../src/initWithGL.ts';

const Boid = d.struct({
  pos: d.vec3f,
  vel: d.vec3f,
});

describe('implicit pointers in GLSL', () => {
  it('copies references to immutable memory', ({ gl }) => {
    const root = initWithGL({ gl });
    const boid = root.createUniform(Boid);

    function foo() {
      'use gpu';
      const boidPos = boid.$.pos;
      return d.vec3f(boidPos);
    }

    expect(tgpu.resolve([foo], glOptions())).toMatchInlineSnapshot(`
      "struct Boid {
        vec3 pos;
        vec3 vel;
      };

      uniform Boid boid;

      vec3 foo() {
        vec3 boidPos = boid.pos;
        return boidPos;
      }"
    `);
  });

  it('aliases references to mutable memory', () => {
    const boids = tgpu.privateVar(d.arrayOf(Boid, 16));

    function bar() {
      'use gpu';
      const boid = boids.$[0] as d.Infer<typeof Boid>;
      boid.pos.x += 1;
      boid.vel = d.vec3f();
    }

    expect(tgpu.resolve([bar], glOptions())).toMatchInlineSnapshot(`
      "struct Boid {
        vec3 pos;
        vec3 vel;
      };

      Boid boids[16];

      void bar() {
        boids[0].pos.x += 1.0;
        boids[0].vel = vec3(0);
      }"
    `);
  });

  it('stores runtime index expressions in variables', () => {
    const boids = tgpu.privateVar(d.arrayOf(Boid, 16));

    function firstIndex() {
      'use gpu';
      return 0;
    }

    function bar(index: number) {
      'use gpu';
      const boid = boids.$[firstIndex() + index] as d.Infer<typeof Boid>;
      boid.pos.x += 1;
      boid.pos.y += 1;
    }

    function main() {
      'use gpu';
      bar(1);
    }

    expect(tgpu.resolve([main], glOptions())).toMatchInlineSnapshot(`
      "int firstIndex() {
        return 0;
      }

      struct Boid {
        vec3 pos;
        vec3 vel;
      };

      Boid boids[16];

      void bar(int index) {
        int item = (firstIndex() + index);
        boids[item].pos.x += 1.0;
        boids[item].pos.y += 1.0;
      }

      void main() {
        bar(1);
      }"
    `);
  });

  it('aliases nested member and index accesses', () => {
    const Cluster = d.struct({
      boids: d.arrayOf(Boid, 4),
    });
    const clusters = tgpu.privateVar(d.arrayOf(Cluster, 2));

    function bar(index: number) {
      'use gpu';
      const cluster = clusters.$[index];
      const pos = cluster!.boids[1]!.pos;
      pos.x = 1;
    }

    function main() {
      'use gpu';
      bar(1);
    }

    expect(tgpu.resolve([main], glOptions())).toMatchInlineSnapshot(`
      "struct Boid {
        vec3 pos;
        vec3 vel;
      };

      struct Cluster {
        Boid boids[4];
      };

      Cluster clusters[2];

      void bar(int index) {
        int item = index;
        clusters[item].boids[1].pos.x = 1.0;
      }

      void main() {
        bar(1);
      }"
    `);
  });

  it('aliases an alias', () => {
    const boids = tgpu.privateVar(d.arrayOf(Boid, 16));

    function bar(index: number) {
      'use gpu';
      const boid = boids.$[index]!;
      const pos = boid.pos;
      pos.x = 1;
    }

    function main() {
      'use gpu';
      bar(1);
    }

    expect(tgpu.resolve([main], glOptions())).toMatchInlineSnapshot(`
      "struct Boid {
        vec3 pos;
        vec3 vel;
      };

      Boid boids[16];

      void bar(int index) {
        int item = index;
        boids[item].pos.x = 1.0;
      }

      void main() {
        bar(1);
      }"
    `);
  });

  it('aliases a local variable', () => {
    function bar() {
      'use gpu';
      const boid = Boid();
      const pos = boid.pos;
      pos.x = 1;
      return boid.pos.x;
    }

    expect(tgpu.resolve([bar], glOptions())).toMatchInlineSnapshot(`
      "struct Boid {
        vec3 pos;
        vec3 vel;
      };

      float bar() {
        Boid boid = Boid();
        boid.pos.x = 1.0;
        return boid.pos.x;
      }"
    `);
  });
});
