import * as d from 'typegpu/data';

export const presets = {
  atom: {
    skyBox: 'default',
    celestialBodies: [
      {
        texture: 'red_atom',
        elements: [
          {
            position: d.vec3f(),
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
