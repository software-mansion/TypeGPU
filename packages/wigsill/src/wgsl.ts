import { buffer } from './wgslBuffer';
import { code } from './wgslCode';
import { constant } from './wgslConstant';
import { fn } from './wgslFunction';
import { fn as fun } from './wgslFunctionExperimental';
import { slot } from './wgslSlot';
import { variable } from './wgslVariable';
import { sampler } from './wgslSampler';
import { texture, textureExternal } from './wgslTexture';

export default Object.assign(code, {
  code,
  fn,
  fun,
  buffer,
  slot,
  constant,
  var: variable,
  sampler,
  texture,
  textureExternal,
});
