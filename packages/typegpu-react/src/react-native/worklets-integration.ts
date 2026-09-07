type WorkletsModule = typeof import('react-native-worklets');

declare const require: (id: string) => unknown;

let cached: WorkletsModule | null | undefined;

/** Returns `react-native-worklets` when installed and recent enough, null otherwise */
export function getWorkletsModule(): WorkletsModule | null {
  if (cached === undefined) {
    try {
      // Metro treats a require inside `try` as optional, apps without the package still bundle
      const worklets = require('react-native-worklets') as WorkletsModule;
      cached =
        typeof worklets?.registerCustomSerializable === 'function' &&
        typeof worklets.isWorkletFunction === 'function' &&
        typeof worklets.runOnUISync === 'function' &&
        typeof worklets.createShareable === 'function'
          ? worklets
          : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}
