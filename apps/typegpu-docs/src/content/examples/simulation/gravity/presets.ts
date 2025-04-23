import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type {
  CollisionBehavior,
  Preset,
  SkyBox,
  SphereTextureName,
} from './enums.ts';
import { radiusOf } from './textures.ts';

export interface PresetData {
  skyBox: SkyBox;
  celestialBodies: {
    texture: SphereTextureName;
    elements: {
      position: d.v3f;
      velocity?: d.v3f; // default: d.vec3f()
      mass: number;
      collisionBehavior?: CollisionBehavior; // default: none
    }[];
  }[];
}

export const examplePresets: Record<Preset, PresetData> = {
  'Asteroid belt': {
    skyBox: 'milky-way',
    celestialBodies: [
      {
        texture: 'saturn',
        elements: [
          {
            position: d.vec3f(),
            mass: 1000,
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
          };
        }),
      },
    ],
  },
  'Asteroid belt with collisions': {
    skyBox: 'milky-way',
    celestialBodies: [
      {
        texture: 'saturn',
        elements: [
          {
            position: d.vec3f(),
            mass: 100,
            collisionBehavior: 'merge',
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
              Math.sqrt(100 / r),
              std.normalize(d.vec3f(-z, 0, x)),
            ),
            mass: 0.001,
            collisionBehavior: 'bouncy',
          };
        }),
      },
    ],
  },
  'Dust cloud': {
    skyBox: 'milky-way',
    celestialBodies: [
      {
        texture: 'ceres-fictional',
        elements: Array.from(Array(1000)).map(() => {
          return {
            position: d.vec3f(
              (Math.random() - 0.5) * 100,
              (Math.random() - 0.5) * 100,
              (Math.random() - 0.5) * 100,
            ),
            mass: 0.1,
            collisionBehavior: 'bouncy',
          };
        }),
      },
    ],
  },
  'Energy preservation': {
    skyBox: 'beach',
    celestialBodies: [
      {
        texture: 'earth',
        elements: [
          {
            position: d.vec3f(0, -radiusOf(1000), 0),
            mass: 1000,
            collisionBehavior: 'bouncy',
          },
        ],
      },
      {
        texture: 'moon',
        elements: [
          {
            position: d.vec3f(0, 5, 0),
            mass: 0.08,
            collisionBehavior: 'bouncy',
          },
          {
            position: d.vec3f(0, 10, 0),
            mass: 0.04,
            collisionBehavior: 'bouncy',
          },
          {
            position: d.vec3f(0, 15, 0),
            mass: 0.02,
            collisionBehavior: 'bouncy',
          },
          {
            position: d.vec3f(0, 20, 0),
            mass: 0.01,
            collisionBehavior: 'bouncy',
          },
        ],
      },
    ],
  },
};
