import { code } from './wgslCode';
import { constant } from './wgslConstant';
import { fn } from './wgslFunction';
import { identifier } from './wgslIdentifier';
import { memory } from './wgslMemory';
import { param } from './wgslParam';
import { placeholder } from './wgslPlaceholder';
import { require } from './wgslRequire';
import { variable } from './wgslVariable';

export default Object.assign(code, {
  code,
  fn,
  identifier,
  memory,
  param,
  placeholder,
  constant,
  require,
  var: variable,
});
