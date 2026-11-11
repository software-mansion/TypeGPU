export const RADIX_BITS = 8;
export const RADIX_SIZE = 1 << RADIX_BITS;
export const TILE_THREADS = RADIX_SIZE;
export const KEYS_PER_THREAD = 8;
export const TILE_SIZE = TILE_THREADS * KEYS_PER_THREAD;
