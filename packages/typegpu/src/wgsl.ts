import { code } from './tgpuCode';
import { constant } from './tgpuConstant';
import { declare } from './tgpuDeclare';
import { fn } from './tgpuFunction';
import { slot } from './tgpuSlot';
import { variable } from './tgpuVariable';

export default Object.assign(code, {
  code,
  fn,
  slot,
  constant,
  declare,
  var: variable,
});
