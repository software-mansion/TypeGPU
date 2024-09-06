import { buffer } from './tgpuBuffer';
import { code } from './tgpuCode';
import { constant } from './tgpuConstant';
import { declare } from './tgpuDeclare';
import { fn } from './tgpuFunction';
import { fn as fun } from './tgpuFunctionExperimental';
import { plum, plumFromEvent } from './tgpuPlum';
import { sampler } from './tgpuSampler';
import { slot } from './tgpuSlot';
import { texture, textureExternal } from './tgpuTexture';
import { variable } from './tgpuVariable';

export default Object.assign(code, {
  code,
  fn,
  fun,
  buffer,
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
