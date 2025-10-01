// Standard library - texture functions
import { textureSample, textureLoad, textureStore, textureDimensions } from 'typegpu/std';

console.log('Texture functions:', {
  textureSample: typeof textureSample,
  textureLoad: typeof textureLoad,
  textureStore: typeof textureStore,
  textureDimensions: typeof textureDimensions,
});