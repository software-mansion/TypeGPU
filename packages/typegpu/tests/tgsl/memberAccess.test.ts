import { describe } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { expectSnippetOf } from '../utils/parseResolved.ts';
import tgpu, { d } from '../../src/index.js';

describe('Member Access', () => {
  const Boid = d.struct({
    pos: d.vec3f,
  });

  it('should access member properties of literals', () => {
    expectSnippetOf(() => {
      'use gpu';
      return Boid().pos;
    }).toStrictEqual(['Boid().pos', d.vec3f, 'runtime']);

    expectSnippetOf(() => {
      'use gpu';
      return Boid().pos.xyz;
    }).toStrictEqual(['Boid().pos.xyz', d.vec3f, 'runtime']);
  });

  it('should access member properties of externals', () => {
    const boid = Boid({ pos: d.vec3f(1, 2, 3) });

    expectSnippetOf(() => {
      'use gpu';
      return boid.pos;
    }).toStrictEqual([d.vec3f(1, 2, 3), d.vec3f, 'constant']);

    expectSnippetOf(() => {
      'use gpu';
      return boid.pos.zyx;
    }).toStrictEqual([d.vec3f(3, 2, 1), d.vec3f, 'constant']);
  });

  it('should access member properties of variables', () => {
    const boidVar = tgpu.privateVar(Boid);

    expectSnippetOf(() => {
      'use gpu';
      return boidVar.$.pos;
    }).toStrictEqual(['boidVar.pos', d.vec3f, 'private']);

    expectSnippetOf(() => {
      'use gpu';
      return boidVar.$.pos.xyz;
    }).toStrictEqual(['boidVar.pos.xyz', d.vec3f, 'runtime']); // < swizzles are new objects
  });

  it('derefs access to local variables with proper address space', () => {
    expectSnippetOf(() => {
      'use gpu';
      // Creating a new Boid instance
      const boid = Boid();
      // Taking a reference that is local to this function
      const boidRef = boid;
      return boidRef.pos;
    }).toStrictEqual(['(*boidRef).pos', d.vec3f, 'this-function']);
  });

  it('derefs access to storage with proper address space', ({ root }) => {
    const boidReadonly = root.createReadonly(Boid);
    const boidMutable = root.createMutable(Boid);

    expectSnippetOf(() => {
      'use gpu';
      // Taking a reference to a storage variable
      const boidRef = boidReadonly.$;
      return boidRef.pos;
    }).toStrictEqual(['(*boidRef).pos', d.vec3f, 'readonly']);

    expectSnippetOf(() => {
      'use gpu';
      // Taking a reference to a storage variable
      const boidRef = boidMutable.$;
      return boidRef.pos;
    }).toStrictEqual(['(*boidRef).pos', d.vec3f, 'mutable']);
  });
});
