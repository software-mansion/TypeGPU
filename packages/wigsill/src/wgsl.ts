import { code } from './wgslCode';
import { constant } from './wgslConstant';
import { fn as fun } from './wgslFunction';
import { computeFn, fn, fragmentFn, vertexFn } from './wgslFunctionOld';
import { identifier } from './wgslIdentifier';
import { memory } from './wgslMemory';
import { require } from './wgslRequire';
import { slot } from './wgslSlot';
import { variable } from './wgslVariable';

export default Object.assign(code, {
  code,
  fn,
  computeFn,
  vertexFn,
  fragmentFn,
  fun,
  identifier,
  memory,
  slot,
  constant,
  require,
  var: variable,
});
