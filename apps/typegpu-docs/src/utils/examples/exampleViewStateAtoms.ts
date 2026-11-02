import { atom } from 'jotai';
import { atomWithSearchParams } from 'jotai-location';
import { atomWithStorage } from 'jotai/utils';

const storageOptions = { getOnInit: true };

export const menuShownAtom = atom(false);

export const exampleFullscreenAtom = atomWithSearchParams('full', false, {
  replace: true,
  // jotai-location's default writes back a cached pathname and hash, which go stale
  // when other code calls history.replaceState (e.g. currentExampleAtom). That wipes
  // the example hash. This version reads the live URL and only changes the 'full' param.
  // Can be removed once https://github.com/jotaijs/jotai-location/pull/57 is released.
  applyLocation: ({ searchParams }, options) => {
    const url = new URL(window.location.href);
    url.searchParams.set('full', searchParams?.get('full') ?? 'false');
    if (options?.replace) {
      window.history.replaceState(window.history.state, '', url);
    } else {
      window.history.pushState(null, '', url);
    }
  },
});

export const tsoverUsedAtom = atomWithStorage('tsover-used', true, undefined, storageOptions);
