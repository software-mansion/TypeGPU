import { code } from './wgslCode';
import { constant } from './wgslConstant';
import { fn as fun } from './wgslFunction';
import { fn } from './wgslFunctionOld';
import { identifier } from './wgslIdentifier';
import { memory } from './wgslMemory';
import { param } from './wgslParam';
import { placeholder } from './wgslPlaceholder';
import { require } from './wgslRequire';
import { variable } from './wgslVariable';

export default Object.assign(code, {
  code,
  fn,
  fun,
  identifier,
  memory,
  param,
  placeholder,
  constant,
  require,
  var: variable,
});
