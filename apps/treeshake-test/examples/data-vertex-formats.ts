// Vertex format data types
import { uint8x2, float32x3, unorm8x4, snorm16x2 } from 'typegpu/data';

console.log('Vertex format types:', {
  uint8x2: typeof uint8x2,
  float32x3: typeof float32x3,
  unorm8x4: typeof unorm8x4,
  snorm16x2: typeof snorm16x2,
});