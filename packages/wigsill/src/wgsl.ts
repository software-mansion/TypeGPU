import { buffer } from './wgslBuffer';
import { code } from './wgslCode';
import { constant } from './wgslConstant';
import { fn } from './wgslFunction';
import { fn as fun } from './wgslFunctionExperimental';
import { sampler } from './wgslSampler';
import { slot } from './wgslSlot';
import { texture, textureExternal } from './wgslTexture';
import { variable } from './wgslVariable';
import { builtin } from './wgslBuiltin';

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
  builtin,
});
