import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type {
  CollisionBehavior,
  Preset,
  SkyBox,
  SphereTextureName,
} from './enums.ts';

export interface PresetData {
  skyBox: SkyBox;
  celestialBodies: {
    texture: SphereTextureName;
    elements: {
      position: d.v3f;
      velocity?: d.v3f; // default: d.vec3f()
      mass: number;
      radiusMultiplier?: number;
      collisionBehavior?: CollisionBehavior; // default: none
    }[];
  }[];
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function randInBall(minRadius: number, maxRadius: number) {
  while (true) {
    const pos = d.vec3f(
      rand(-maxRadius, maxRadius),
      rand(-maxRadius, maxRadius),
      rand(-maxRadius, maxRadius),
    );
    const dist = std.length(pos);
    if (minRadius <= dist && dist <= maxRadius) {
      return pos;
    }
  }
}

function stableOrbitVelocity(
  otherMass: number,
  currentRadius: number,
  averageRadius?: number,
) {
  return (
    (otherMass * (2 / currentRadius - 1 / (averageRadius ?? currentRadius))) **
    0.5
  );
}

export const examplePresets: Record<Preset, PresetData> = {
  Asteroids: {
    skyBox: 'milky-way',
    celestialBodies: [
      {
        texture: 'jupiter',
        elements: [
          {
            position: d.vec3f(),
            mass: 1000,
          },
        ],
      },
      {
        texture: 'haumea-fictional',
        elements: Array.from(Array(1000)).map(() => {
          const r = rand(15, 30);
          const theta = rand(0, 2 * Math.PI);
          const x = r * Math.cos(theta);
          const z = r * Math.sin(theta);
          return {
            position: d.vec3f(x, rand(-0.5, 0.5), z),
            velocity: std.mul(
              stableOrbitVelocity(1000, r),
              std.normalize(d.vec3f(-z, 0, x)),
            ),
            mass: 0.01,
          };
        }),
      },
    ],
  },
  'Colliding asteroids': {
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
        elements: Array.from(Array(5000)).map(() => {
          const r = rand(10, 30);
          const theta = rand(0, 2 * Math.PI);
          const x = r * Math.cos(theta);
          const z = r * Math.sin(theta);
          return {
            position: d.vec3f(x, rand(-0.5, 0.5), z),
            velocity: std.mul(
              stableOrbitVelocity(100, r),
              std.normalize(d.vec3f(z, 0, -x)),
            ),
            mass: 0.001,
            collisionBehavior: 'bouncy',
          };
        }),
      },
      {
        texture: 'saturn',
        elements: [
          {
            position: d.vec3f(0, 0, -80),
            velocity: d.vec3f(0, stableOrbitVelocity(100, 80, 50), 0),
            mass: 1,
            collisionBehavior: 'bouncy',
          },
        ],
      },
    ],
  },
  'Merging dust': {
    skyBox: 'milky-way',
    celestialBodies: [
      {
        texture: 'ceres-fictional',
        elements: Array.from(Array(1000)).map(() => {
          return {
            position: randInBall(0, 50),
            mass: 0.1,
            collisionBehavior: 'merge',
          };
        }),
      },
    ],
  },
  'Bouncy dust': {
    skyBox: 'milky-way',
    celestialBodies: [
      {
        texture: 'haumea-fictional',
        elements: Array.from(Array(1000)).map(() => {
          return {
            position: randInBall(0, 50),
            mass: 0.1,
            collisionBehavior: 'bouncy',
          };
        }),
      },
    ],
  },
  'Solar System': {
    skyBox: 'milky-way',
    celestialBodies: [
      {
        texture: 'sun',
        elements: [
          {
            position: d.vec3f(0.0, 0.0, 0.0), // m
            velocity: d.vec3f(0.0, 0.0, 0.0), // m/s
            mass: 1.9885e30, // kg
            radiusMultiplier: 5,
          },
        ],
      },
      {
        texture: 'mercury',
        elements: [
          {
            position: d.vec3f(-1.9511e10, -3.6766e9, -6.6946e10),
            velocity: d.vec3f(3.7002e4, -4.2071e3, -1.0465e4),
            mass: 3.3011e23,
            radiusMultiplier: 100,
          },
        ],
      },
      {
        texture: 'venus',
        elements: [
          {
            position: d.vec3f(1.0806e11, -6.1604e9, -4.9957e9),
            velocity: d.vec3f(1.5355e3, 2.7399e3, 3.5312e4),
            mass: 4.8675e24,
            radiusMultiplier: 100,
          },
        ],
      },
      {
        texture: 'earth',
        elements: [
          {
            position: d.vec3f(-2.6516e10, -5.6827e6, 1.4475e11),
            velocity: d.vec3f(-2.9778e4, 0.0, -5.2583e3),
            mass: 5.97237e24,
            radiusMultiplier: 100,
          },
        ],
      },
      {
        texture: 'mars',
        elements: [
          {
            position: d.vec3f(2.0805e11, -5.1555e9, -2.0053e9),
            velocity: d.vec3f(1.1576e3, 4.1555e2, 2.6295e4),
            mass: 6.4171e23,
            radiusMultiplier: 100,
          },
        ],
      },
      {
        texture: 'jupiter',
        elements: [
          {
            position: d.vec3f(-7.7754e11, 1.8411e10, -7.0945e9),
            velocity: d.vec3f(8.2586e2, -2.3739e2, -1.0812e4),
            mass: 1.8982e27,
            radiusMultiplier: 100,
          },
        ],
      },
      {
        texture: 'saturn',
        elements: [
          {
            position: d.vec3f(-1.3377e12, 5.525e10, 5.178e11),
            velocity: d.vec3f(-4.1998e3, 1.6286e2, -1.1454e4),
            mass: 5.6834e26,
            radiusMultiplier: 100,
          },
        ],
      },
      {
        texture: 'uranus',
        elements: [
          {
            position: d.vec3f(2.1587e12, 3.562e10, -2.0547e12),
            velocity: d.vec3f(4.6507e3, -3.2698e2, 4.2909e3),
            mass: 8.681e25,
            radiusMultiplier: 100,
          },
        ],
      },
      {
        texture: 'neptune',
        elements: [
          {
            position: d.vec3f(2.514e12, -1.3557e10, -3.7457e12),
            velocity: d.vec3f(4.7854e3, -4.5175e2, 3.1744e3),
            mass: 1.02413e26,
            radiusMultiplier: 100,
          },
        ],
      },
    ].map((elem) => {
      const G = 6.673e-11;
      const massPositionScale = 1e-10;
      const massVelocityScale = 1e-5;
      const body = elem.elements[0];
      return {
        texture: elem.texture as SphereTextureName,
        elements: [
          {
            position: std.mul(massPositionScale, body.position),
            velocity: std.mul(massVelocityScale, body.velocity),
            mass: body.mass * G * massPositionScale * massVelocityScale ** 2,
            radiusMultiplier: body.radiusMultiplier,
          },
        ],
      };
    }),
  },
};
