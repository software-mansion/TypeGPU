import { code } from './tgpuCode';
import { constant } from './tgpuConstant';
import { declare } from './tgpuDeclare';
import { fn } from './tgpuFunction';
import { variable } from './tgpuVariable';

export default Object.assign(code, {
  code,
  fn,
  constant,
  declare,
  var: variable,
});
