import { describe } from 'vitest';
import { it } from '../utils/extendedIt.ts';
import { expectSnippetOf } from '../utils/parseResolved.ts';
import { snip } from '../../src/data/snippet.ts';
import tgpu, { d } from '../../src/index.js';

describe('Member Access', () => {
  const Boid = d.struct({
    pos: d.vec3f,
  });

  it('should access member properties of literals', () => {
    expectSnippetOf(() => {
      'use gpu';
      Boid().pos;
    }).toStrictEqual(snip('Boid().pos', d.vec3f, 'runtime'));

    expectSnippetOf(() => {
      'use gpu';
      Boid().pos.xyz;
    }).toStrictEqual(snip('Boid().pos.xyz', d.vec3f, 'runtime'));
  });

  it('should access member properties of externals', () => {
    const boid = Boid({ pos: d.vec3f(1, 2, 3) });

    expectSnippetOf(() => {
      'use gpu';
      boid.pos;
    }).toStrictEqual(snip(d.vec3f(1, 2, 3), d.vec3f, 'constant'));

    expectSnippetOf(() => {
      'use gpu';
      boid.pos.zyx;
    }).toStrictEqual(snip(d.vec3f(3, 2, 1), d.vec3f, 'constant'));
  });

  it('should access member properties of variables', () => {
    const boidVar = tgpu.privateVar(Boid);

    expectSnippetOf(() => {
      'use gpu';
      boidVar.$.pos;
    }).toStrictEqual(snip('boidVar.pos', d.vec3f, 'private'));

    expectSnippetOf(() => {
      'use gpu';
      boidVar.$.pos.xyz;
    }).toStrictEqual(snip('boidVar.pos.xyz', d.vec3f, 'runtime')); // < swizzles are new objects
  });

  it('derefs access to local variables with proper address space', () => {
    expectSnippetOf(() => {
      'use gpu';
      // Creating a new Boid instance
      const boid = Boid();
      // Taking a reference that is local to this function
      const boidRef = boid;
      boidRef.pos;
    }).toStrictEqual(snip('(*boidRef).pos', d.vec3f, 'this-function'));
  });

  it('derefs access to storage with proper address space', ({ root }) => {
    const boidReadonly = root.createReadonly(Boid);
    const boidMutable = root.createMutable(Boid);

    expectSnippetOf(() => {
      'use gpu';
      // Taking a reference to a storage variable
      const boidRef = boidReadonly.$;
      boidRef.pos;
    }).toStrictEqual(snip('(*boidRef).pos', d.vec3f, 'readonly'));

    expectSnippetOf(() => {
      'use gpu';
      // Taking a reference to a storage variable
      const boidRef = boidMutable.$;
      boidRef.pos;
    }).toStrictEqual(snip('(*boidRef).pos', d.vec3f, 'mutable'));
  });
});
