import { buffer } from './wgslBuffer';
import { code } from './wgslCode';
import { constant } from './wgslConstant';
import { declare } from './wgslDeclare';
import { fn } from './wgslFunction';
import { fn as fun } from './wgslFunctionExperimental';
import { plum, plumFromEvent } from './wgslPlum';
import { slot } from './wgslSlot';
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
  declare,
  var: variable,
});
