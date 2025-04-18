import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type { SkyBoxNames, SphereTextureNames } from './textures.ts';

export const presetsEnum = [
  'Asteroid belt',
  'Test 0',
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
  'Asteroid belt': {
    skyBox: 'milky-way',
    celestialBodies: [
      {
        texture: 'saturn',
        elements: [
          {
            position: d.vec3f(),
            mass: 1000,
            radius: 3,
          },
        ],
      },
      {
        texture: 'ceres-fictional',
        elements: Array.from(Array(1000)).map(() => {
          const r = 15 * Math.sqrt(Math.random() + 1);
          const theta = Math.random() * 2 * Math.PI;
          const x = r * Math.cos(theta);
          const z = r * Math.sin(theta);
          return {
            position: d.vec3f(x, 1 * (Math.random() - 0.5), z),
            velocity: std.mul(
              Math.sqrt(1000 / r),
              std.normalize(d.vec3f(-z, 0, x)),
            ),
            mass: 0.01,
            radius: 0.1,
          };
        }),
      },
    ],
  },
  'Test 0': {
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
