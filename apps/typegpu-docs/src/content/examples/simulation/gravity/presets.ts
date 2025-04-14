import * as d from 'typegpu/data';

export const presetsEnum = ['Atom'] as const;
export type Preset = (typeof presetsEnum)[number];
export interface PresetData {
  skyBox: string;
  celestialBodies: {
    texture: string;
    elements: {
      position: d.v3f;
      velocity: d.v3f;
      mass: number;
    }[];
  }[];
}

export const presets: Record<Preset, PresetData> = {
  Atom: {
    skyBox: 'default',
    celestialBodies: [
      {
        texture: '/TypeGPU/assets/gravity/cube_texture.png',
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
          {
            position: d.vec3f(0, -1, 0),
            velocity: d.vec3f(-1, 0, 0),
            mass: 10,
          },
        ],
      },
    ],
  },
};
