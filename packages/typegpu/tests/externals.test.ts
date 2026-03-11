import { describe, expect, it } from 'vitest';
import { addArgTypesToExternals, type ExternalMap } from '../src/core/resolve/externals.ts';
import * as d from '../src/data/index.ts';

describe('addArgTypesToExternals', () => {
  const Particle = d.struct({
    position: d.vec3f,
    color: d.vec4f,
  });

  const Light = d.struct({
    ambient: d.vec4f,
    intensity: d.f32,
  });

  it('extracts struct argument types with their names', () => {
    const externals: ExternalMap[] = [];
    addArgTypesToExternals(
      '(a: vec4f, b: Particle, c: Light) {}',
      [d.vec4f, Particle, Light],
      (result) => externals.push(result),
    );
    expect(externals).toStrictEqual([{ Particle, Light }]);
  });

  it('gets the names from argument list in WGSL implementation', () => {
    const externals: ExternalMap[] = [];
    addArgTypesToExternals('(b: P, a: vec4f, c: L) -> L {}', [Particle, d.vec4f, Light], (result) =>
      externals.push(result),
    );
    expect(externals).toStrictEqual([{ P: Particle, L: Light }]);
  });

  it('works when builtins are present', () => {
    const externals: ExternalMap[] = [];
    addArgTypesToExternals(
      '(@builtin(workgroup_id) WorkGroupID : vec3u, a: vec4f, b: Particle, c: Light) {}',
      [d.vec3u, d.vec4f, Particle, Light],
      (result) => externals.push(result),
    );
    expect(externals).toStrictEqual([{ Particle, Light }]);
  });

  it('works with unusual whitespace', () => {
    const externals: ExternalMap[] = [];
    addArgTypesToExternals(
      ` WorkGroupID : vec3u
      , 
        a   : A   , 
        (@builtin(workgroup_id) b
        
  : B, 
         
        c: C
      ) -> vec4f {}`,
      [d.vec3u, Particle, Particle, Particle],
      (result) => externals.push(result),
    );
    expect(externals).toStrictEqual([{ A: Particle, B: Particle, C: Particle }]);
  });
});
