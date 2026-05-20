import { stitch } from '../core/resolve/stitch.ts';
import { isUnstruct, undecorate } from '../data/dataTypes.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import { isWgslStruct } from '../data/wgslTypes.ts';
import { invariant } from '../errors.ts';

/**
 * This function is separate from `accessProp` to avoid a circular dependency.
 */
export function accessStructProp(target: Snippet, propName: string) {
  invariant(
    isWgslStruct(target.dataType) || isUnstruct(target.dataType),
    'Expected snippet type to be struct/unstruct.',
  );
  let propType = target.dataType.propTypes[propName];
  if (!propType) {
    return undefined;
  }
  propType = undecorate(propType);

  return snip(stitch`${target}.${propName}`, propType, /* origin */ target.origin);
}
