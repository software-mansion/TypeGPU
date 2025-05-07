import { atomWithStorage } from 'jotai/utils'

export const menuShownAtom = atomWithStorage('menu-shown', true);
export const menuShownMobileAtom = atomWithStorage('menu-shown-mobile', false);
