import * as d from 'typegpu/data';

export const presetsEnum = ['Atom', 'Solar System'] as const;
export type Preset = (typeof presetsEnum)[number];

export const presets = {
  atom: {
    skyBox: 'default',
    celestialBodies: [
      {
        texture: 'red_atom',
        elements: [
          {
            position: d.vec3f(1, 0, 0),
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
      {
        texture: 'blue_atom',
        elements: [],
      },
    ],
  },
};
