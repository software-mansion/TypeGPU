import * as d from 'typegpu/data';
import type { SkyBoxNames, SphereTextureNames } from './textures.ts';

export const presetsEnum = [
  '1k chaotic particles',
  'Solar System',
  'Test 1',
  'Test 2',
  'Test 3',
  'Test 4',
  'Test 5',
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
  '1k chaotic particles': {
    skyBox: 'campsite',
    celestialBodies: [
      {
        texture: 'moon',
        elements: [
          {
            position: d.vec3f(),
            mass: 1000,
            radius: 3,
          },
        ],
      },
      {
        texture: 'earth',
        elements: Array.from(Array(1000)).map(() => {
          const r = 10 * Math.sqrt(Math.random() + 1);
          const theta = Math.random() * 2 * Math.PI;
          return {
            position: d.vec3f(r * Math.cos(theta), 0, r * Math.sin(theta)),
            mass: Math.random() * 0.01 + 0.01,
            radius: 0.1,
          };
        }),
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
  'Test 3': {
    skyBox: 'beach',
    celestialBodies: [
      {
        texture: 'earth',
        elements: [
          {
            position: d.vec3f(0, 0, 0),
            mass: 10,
          },
        ],
      },
      {
        texture: 'moon',
        elements: [
          {
            position: d.vec3f(-10, 0, 0),
            velocity: d.vec3f(0, -1, 0),
            mass: 0.001,
            radius: 0.4,
          },
          {
            position: d.vec3f(10.0001, 0, 0),
            mass: 0,
            radius: 0.4,
          },
          {
            position: d.vec3f(-10.0001, 0, 0),
            mass: 0,
            radius: 0.4,
          },
        ],
      },
    ],
  },
  'Test 4': {
    skyBox: 'beach',
    celestialBodies: [
      {
        texture: 'earth',
        elements: [
          {
            position: d.vec3f(0, 0, 0),
            mass: 100,
            radius: 1,
          },
        ],
      },
      {
        texture: 'moon',
        elements: [
          {
            position: d.vec3f(3, 0, 0),
            velocity: d.vec3f(0, 1, 0),
            mass: 0.001,
            radius: 0.4,
          },
        ],
      },
    ],
  },
  'Test 5': {
    skyBox: 'beach',
    celestialBodies: [
      {
        texture: 'earth',
        elements: [
          {
            position: d.vec3f(0, -1010, 0),
            mass: 1000000,
            radius: 1000,
          },
        ],
      },
      {
        texture: 'moon',
        elements: [
          {
            position: d.vec3f(0, 0, 0),
            mass: 0.0005,
            radius: 1,
          },
          {
            position: d.vec3f(0, 5, 0),
            mass: 0.00025,
            radius: 1,
          },
          {
            position: d.vec3f(0, 10, 0),
            mass: 0.00012,
            radius: 1,
          },
          {
            position: d.vec3f(0, 15, 0),
            mass: 0.00006,
            radius: 1,
          },
          {
            position: d.vec3f(0, 20, 0),
            mass: 0.00003,
            radius: 1,
          },
        ],
      },
    ],
  },
};
