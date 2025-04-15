import * as d from 'typegpu/data';
import type { SkyBoxNames, SphereTextureNames } from './textures.ts';

export const presetsEnum = ['Atom', 'Solar System'] as const;
export type Preset = (typeof presetsEnum)[number];
export interface PresetData {
  skyBox: SkyBoxNames;
  celestialBodies: {
    texture: SphereTextureNames;
    elements: {
      position: d.v3f;
      velocity?: d.v3f;
      mass: number;
      radius?: number;
    }[];
  }[];
}

export const presets: Record<Preset, PresetData> = {
  Atom: {
    skyBox: 'campsite',
    celestialBodies: [
      {
        texture: 'moon',
        elements: [
          {
            position: d.vec3f(1, 0, 0),
            velocity: d.vec3f(0, 1, 0),
            mass: 1,
          },
          {
            position: d.vec3f(-1, 0, 0),
            velocity: d.vec3f(0, -1, 0),
            mass: 1,
          },
          {
            position: d.vec3f(0, 1, 0),
            velocity: d.vec3f(1, 0, 0),
            mass: 1,
          },
          {
            position: d.vec3f(0, -1, 0),
            velocity: d.vec3f(-1, 0, 0),
            mass: 1,
          },
          {
            position: d.vec3f(0, 0, 10),
            velocity: d.vec3f(0, 2, 0),
            mass: 100,
          },
          {
            position: d.vec3f(0, 0, -10),
            velocity: d.vec3f(0, -2, 0),
            mass: 100,
          },
        ],
      },
    ],
  },
  'Solar System': {
    skyBox: 'beach',
    celestialBodies: [
      {
        texture: 'earth',
        elements: [
          {
            position: d.vec3f(1, 0, 0),
            velocity: d.vec3f(0, 0, 0),
            mass: 0,
            radius: 1,
          },
          {
            position: d.vec3f(-1, 0, 0),
            velocity: d.vec3f(0, 0, 0),
            mass: 0,
            radius: 1,
          },
        ],
      },
    ],
  },
};
