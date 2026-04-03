// The version is inlined during build-time 🎉
// It helps us identify problems when two versions of
// @typegpu/react are used at the same time.
import { version } from '../../package.json';

export const $buffer = Symbol(`@typegpu/react:${version}:$buffer`);
