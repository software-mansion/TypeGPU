import { buffer } from './wgslBuffer';
import { code } from './wgslCode';
import { constant } from './wgslConstant';
import { fn as fun } from './wgslFunction';
import { fn } from './wgslFunctionOld';
import { slot } from './wgslSlot';
import { variable } from './wgslVariable';

export default Object.assign(code, {
  code,
  fn,
  fun,
  buffer,
  slot,
  constant,
  var: variable,
});
