import * as d from 'typegpu/data';
import type { SkyBoxNames, SphereTextureNames } from './textures.ts';

export const presetsEnum = [
  'Atom',
  'Solar System',
  'Test 1',
  'Test 2',
] as const;
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
            position: d.vec3f(0, -5, 0),
            velocity: d.vec3f(-1, 0, 0),
            mass: 1,
          },
          {
            position: d.vec3f(10, 0, 0),
            velocity: d.vec3f(0, 2, 0),
            mass: 1,
          },
          {
            position: d.vec3f(-10, 0, 0),
            velocity: d.vec3f(0, -2, 0),
            mass: 1,
          },
        ],
      },
      {
        texture: 'earth',
        elements: [
          {
            position: d.vec3f(5, 0, 0),
            velocity: d.vec3f(0, 1, 0),
            mass: 10,
          },
          {
            position: d.vec3f(-1, 0, 0),
            velocity: d.vec3f(0, -1, 0),
            mass: 10,
          },
          {
            position: d.vec3f(0, 1, 0),
            velocity: d.vec3f(1, 0, 0),
            mass: 10,
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
            mass: 0,
            radius: 1,
          },
        ],
      },
      {
        texture: 'moon',
        elements: [
          {
            position: d.vec3f(-1, 0, 0),
            mass: 0,
            radius: 0.25,
          },
        ],
      },
    ],
  },
  'Test 1': {
    skyBox: 'beach',
    celestialBodies: [
      {
        texture: 'earth',
        elements: [
          {
            position: d.vec3f(1, 0, 0),
            mass: 1,
          },
        ],
      },
      {
        texture: 'moon',
        elements: [
          {
            position: d.vec3f(-1, 0, 0),
            mass: 1,
          },
        ],
      },
    ],
  },
  'Test 2': {
    skyBox: 'beach',
    celestialBodies: [
      {
        texture: 'earth',
        elements: [
          {
            position: d.vec3f(1, 0, 0),
            velocity: d.vec3f(0, 0.1, 0),
            mass: 1,
          },
        ],
      },
      {
        texture: 'moon',
        elements: [
          {
            position: d.vec3f(-1, 0, 0),
            velocity: d.vec3f(0, -0.1, 0),
            mass: 1,
          },
        ],
      },
    ],
  },
};
