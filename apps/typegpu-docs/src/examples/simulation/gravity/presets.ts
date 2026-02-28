import { d, std } from 'typegpu';
import type { CollisionBehavior, Preset, SphereTextureName } from './enums.ts';

export interface PresetData {
  initialCameraPos: d.v3f;
  lightSource?: d.v3f; // default: d.vec3f()
  celestialBodies: {
    texture: SphereTextureName;
    elements: {
      position: d.v3f;
      velocity?: d.v3f; // default: d.vec3f()
      mass: number;
      radiusMultiplier?: number; // default: 1
      collisionBehavior?: CollisionBehavior; // default: none
      ambientLightFactor?: number; // default: 0.6
    }[];
  }[];
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function randInBall(maxRadius: number) {
  while (true) {
    const pos = d.vec3f(
      rand(-maxRadius, maxRadius),
      rand(-maxRadius, maxRadius),
      rand(-maxRadius, maxRadius),
    );
    const dist = std.length(pos);
    if (dist <= maxRadius) {
      return pos;
    }
  }
}

// this function is only applicable when the currentMass is negligible when compared to otherMass
function stableOrbitVelocity(otherMass: number, currentRadius: number, averageRadius?: number) {
  return (otherMass * (2 / currentRadius - 1 / (averageRadius ?? currentRadius))) ** 0.5;
}

export const examplePresets: Record<Preset, PresetData> = {
  'Solar System': {
    initialCameraPos: d.vec3f(20, 10, 20),
    // data from the internet, mapped to fit the simulation better
    celestialBodies: [
      {
        texture: 'sun',
        elements: [
          {
            position: d.vec3f(0.0, 0.0, 0.0), // m
            velocity: d.vec3f(0.0, 0.0, 0.0), // m/s
            mass: 1.9885e30, // kg
            radiusMultiplier: 5,
            ambientLightFactor: 1,
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
            radiusMultiplier: 50,
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
            radiusMultiplier: 40,
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
            radiusMultiplier: 40,
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
      body.position = std.mul(massPositionScale, body.position);
      body.velocity = std.mul(massVelocityScale, body.velocity);
      body.mass = body.mass * G * massPositionScale * massVelocityScale ** 2;

      return {
        texture: elem.texture as SphereTextureName,
        elements: [body],
      };
    }),
  },
  Asteroids: {
    initialCameraPos: d.vec3f(30, 8, 30),
    lightSource: d.vec3f(1000, 1000, -1000),
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
            velocity: std.mul(stableOrbitVelocity(1000, r), std.normalize(d.vec3f(-z, 0, x))),
            mass: rand(0.008, 0.012),
          };
        }),
      },
    ],
  },
  'Colliding asteroids': {
    initialCameraPos: d.vec3f(20, 7, 40),
    lightSource: d.vec3f(1000, 1000, 0),
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
            velocity: std.mul(stableOrbitVelocity(100, r), std.normalize(d.vec3f(z, 0, -x))),
            mass: rand(0.0008, 0.0012),
            collisionBehavior: 'bounce',
          };
        }),
      },
      {
        texture: 'moon',
        elements: [
          {
            position: d.vec3f(0, 0, -80),
            velocity: d.vec3f(0, stableOrbitVelocity(100, 80, 50), 0),
            mass: 1,
            collisionBehavior: 'bounce',
          },
        ],
      },
    ],
  },
  'Bouncy dust': {
    initialCameraPos: d.vec3f(40, 10, 50),
    lightSource: d.vec3f(1000, 1000, 1000),
    celestialBodies: [
      {
        texture: 'haumea-fictional',
        elements: Array.from(Array(1000)).map(() => ({
          position: randInBall(50),
          mass: 0.1,
          collisionBehavior: 'bounce',
        })),
      },
    ],
  },
  'Merging dust': {
    initialCameraPos: d.vec3f(40, 10, 50),
    lightSource: d.vec3f(1000, 1000, 1000),
    celestialBodies: [
      {
        texture: 'ceres-fictional',
        elements: Array.from(Array(5000)).map(() => ({
          position: randInBall(50),
          mass: rand(0.01, 0.05),
          collisionBehavior: 'merge',
        })),
      },
    ],
  },
};
