import { code } from './wgslCode';
import { constant } from './wgslConstant';
import { fn } from './wgslFunction';
import { param } from './wgslParam';
import { placeholder } from './wgslPlaceholder';

// function require(code: WGSLCode): WGSLDependency {
//   return new WGSLDependency(code);
// }

export default Object.assign(code, {
  code,
  fn,
  param,
  placeholder,
  constant,
  // require
});
