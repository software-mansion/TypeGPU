// @ts-check

import isUnicodeSupported from 'is-unicode-supported';

const unicode = isUnicodeSupported();
const s = (/** @type {string} */ c, /** @type {string} */ fallback) => (unicode ? c : fallback);

export const IN_PROGRESS = s('◐', 'o');
export const SUCCESS = s('✔', '√');
export const FAIL = s('✖', '×');
