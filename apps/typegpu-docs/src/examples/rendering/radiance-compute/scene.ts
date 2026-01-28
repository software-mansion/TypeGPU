import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as sdf from '@typegpu/sdf';

export interface SceneElement<T extends 'box' | 'disk'> {
  id: string;
  type: T;
  position: d.v2f;
  size: T extends 'box' ? d.v2f : number;
  emission?: d.v3f;
  dataIndex: number;
}
export type AnySceneElement = SceneElement<'box'> | SceneElement<'disk'>;

export const sceneElements: AnySceneElement[] = [
  {
    id: 'light-red',
    type: 'disk',
    position: d.vec2f(0.2, 0.3),
    emission: d.vec3f(1, 0, 0),
    size: 0.05,
    dataIndex: 0,
  },
  {
    id: 'light-green',
    type: 'disk',
    position: d.vec2f(0.5, 0.3),
    emission: d.vec3f(0, 1, 0),
    size: 0.05,
    dataIndex: 1,
  },
  {
    id: 'light-blue',
    type: 'disk',
    position: d.vec2f(0.8, 0.3),
    emission: d.vec3f(0, 0, 1),
    size: 0.05,
    dataIndex: 2,
  },
  {
    id: 'box-1',
    type: 'box',
    position: d.vec2f(0.3, 0.5),
    size: d.vec2f(0.08, 0.15),
    dataIndex: 0,
  },
  {
    id: 'box-2',
    type: 'box',
    position: d.vec2f(0.7, 0.65),
    size: d.vec2f(0.12, 0.08),
    dataIndex: 1,
  },
  {
    id: 'disk-1',
    type: 'disk',
    position: d.vec2f(0.5, 0.75),
    size: 0.1,
    dataIndex: 3,
  },
];

export const sceneData = {
  disks: sceneElements
    .filter((el) => el.type === 'disk')
    .map((el) => ({
      pos: el.position,
      radius: el.size,
      emissiveColor: el.emission ?? d.vec3f(),
    })),
  boxes: sceneElements
    .filter((el) => el.type === 'box')
    .map((el) => ({
      pos: el.position,
      size: el.size,
      emissiveColor: el.emission ?? d.vec3f(),
    })),
};

const elementById = new Map<string, AnySceneElement>(
  sceneElements.map((el) => [el.id, el]),
);

export function updateElementPosition(id: string, position: d.v2f): void {
  const element = elementById.get(id);
  if (!element) {
    console.warn(`Element with id ${id} not found in scene.`);
    return;
  }

  element.position = position;
  if (element.type === 'disk') {
    sceneData.disks[element.dataIndex].pos = position;
  } else {
    sceneData.boxes[element.dataIndex].pos = position;
  }
}

export const SceneResult = d.struct({
  dist: d.f32,
  color: d.vec3f,
});

const DiskData = d.struct({
  pos: d.vec2f,
  radius: d.f32,
  emissiveColor: d.vec3f,
});

const BoxData = d.struct({
  pos: d.vec2f,
  size: d.vec2f,
  emissiveColor: d.vec3f,
});

export const SceneData = d.struct({
  disks: d.arrayOf(DiskData, sceneData.disks.length),
  boxes: d.arrayOf(BoxData, sceneData.boxes.length),
});

export const sceneDataAccess = tgpu['~unstable'].accessor(SceneData);
export const sceneSDF = (p: d.v2f) => {
  'use gpu';
  const scene = sceneDataAccess.$;

  let minDist = d.f32(2e31);
  let color = d.vec3f();

  for (let i = 0; i < scene.disks.length; i++) {
    const disk = scene.disks[i];
    const dist = sdf.sdDisk(p.sub(disk.pos), disk.radius);

    if (dist < minDist) {
      minDist = dist;
      color = d.vec3f(disk.emissiveColor);
    }
  }

  for (let i = 0; i < scene.boxes.length; i++) {
    const box = scene.boxes[i];
    const dist = sdf.sdBox2d(p.sub(box.pos), box.size);

    if (dist < minDist) {
      minDist = dist;
      color = d.vec3f(box.emissiveColor);
    }
  }

  return SceneResult({ dist: minDist, color });
};
