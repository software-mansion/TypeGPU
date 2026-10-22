/**
 * Engines without Unicode data — V8 built without ICU (as embedded by NativeScript on iOS and Android,
 * nodejs-mobile, or `node --without-intl`) — reject every `\p{…}` escape. A regex literal containing one
 * is an early SyntaxError that fails the whole module at parse time, so property escapes are only built
 * here, through `new RegExp`, with a fallback when the engine rejects them.
 */
/*#__NO_SIDE_EFFECTS__*/
function propertyEscape(property: string, fallback: string): string {
  const escape = `\\p{${property}}`;
  try {
    const probe = new RegExp(escape, 'u');
    return probe.source === escape ? escape : fallback;
  } catch {
    return fallback;
  }
}

// Every non-ASCII code point except WGSL's non-ASCII blank spaces (U+0085, U+200E, U+200F, U+2028, U+2029).
const nonAsciiNonBlank = '\\u0080-\\u0084\\u0086-\\u200D\\u2010-\\u2027\\u202A-\\u{10FFFF}';

/**
 * ASCII-only fallback for checks where rejecting a valid identifier falls back safely
 * (name sanitizing, JSON-quoting a key).
 */
export const strictXidStart = propertyEscape('XID_Start', 'A-Za-z');
export const strictXidContinue = propertyEscape('XID_Continue', '0-9A-Za-z_');
export const strictIdStart = propertyEscape('ID_Start', 'A-Za-z');
export const strictIdContinue = propertyEscape('ID_Continue', '0-9A-Za-z_');

/**
 * Fallback treats non-ASCII non-blank code points as identifier characters, for
 * tokenizing WGSL, whose non-identifier tokens are all ASCII.
 */
export const looseXidStart = propertyEscape('XID_Start', `A-Za-z${nonAsciiNonBlank}`);
export const looseXidContinue = propertyEscape('XID_Continue', `0-9A-Za-z_${nonAsciiNonBlank}`);

/**
 * @see https://www.w3.org/TR/WGSL/#syntax-ident_pattern_token
 */
export const wgslIdentRegex = new RegExp(
  `^(([_${strictXidStart}][${strictXidContinue}]+)|([${strictXidStart}]))$`,
  'u',
);
