import { code } from './wgslCode';
import { constant } from './wgslConstant';
import { declare } from './wgslDeclare';
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
  plum,
  plumFromEvent,
  slot,
  constant,
  declare,
  var: variable,
  sampler,
  texture,
  textureExternal,
});
