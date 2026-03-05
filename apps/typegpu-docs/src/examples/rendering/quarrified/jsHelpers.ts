import { d } from 'typegpu';
import { CHUNK_SIZE, CHUNK_SIZE_BITS } from './params.ts';

export function coordToIndex(coord: d.v3i): number {
  return (coord.z << (CHUNK_SIZE_BITS * 2)) | (coord.y << CHUNK_SIZE_BITS) | coord.x;
}

export function indexToCoord(index: number): d.v3i {
  return d.vec3i(
    (index >> (CHUNK_SIZE_BITS * 2)) & (CHUNK_SIZE - 1),
    (index >> CHUNK_SIZE_BITS) & (CHUNK_SIZE - 1),
    index & (CHUNK_SIZE - 1),
  );
}
