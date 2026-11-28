import isUnicodeSupported from 'is-unicode-supported';

const unicode = isUnicodeSupported();
const s = (c: string, fallback: string) => (unicode ? c : fallback);

export const IN_PROGRESS = s('◐', 'o');
export const SUCCESS = s('✔', '√');
export const FAIL = s('✖', '×');
