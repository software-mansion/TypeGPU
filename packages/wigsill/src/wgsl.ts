import { buffer } from './wgslBuffer';
import { builtin } from './wgslBuiltin';
import { code } from './wgslCode';
import { constant } from './wgslConstant';
import { fn } from './wgslFunction';
import { fn as fun } from './wgslFunctionExperimental';
import { plum, plumFromEvent } from './wgslPlum';
import { sampler } from './wgslSampler';
import { slot } from './wgslSlot';
import { texture, textureExternal } from './wgslTexture';
import { variable } from './wgslVariable';

export default Object.assign(code, {
  code,
  fn,
  fun,
  buffer,
  plum,
  plumFromEvent,
  slot,
  constant,
  var: variable,
  sampler,
  texture,
  textureExternal,
  builtin,
});
