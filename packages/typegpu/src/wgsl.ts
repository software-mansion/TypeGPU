import { code } from './tgpuCode';
import { constant } from './tgpuConstant';
import { declare } from './tgpuDeclare';
import { fn } from './tgpuFunction';
import { plum, plumFromEvent } from './tgpuPlum';
import { sampler } from './tgpuSampler';
import { slot } from './tgpuSlot';
import { variable } from './tgpuVariable';

export default Object.assign(code, {
  code,
  fn,
  plum,
  plumFromEvent,
  slot,
  constant,
  declare,
  var: variable,
  sampler,
});
