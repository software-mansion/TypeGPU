import type { ResolutionCtx } from './types.ts';

/**
 * Sanitizes the primer so that it is compliant with WGSL guidelines.
 * This primer is not necessarily a valid identifier yet, as it may still collide with other idents or reserved keywords.
 */
/*#__NO_SIDE_EFFECTS__*/
export function sanitizePrimer(primer: string | undefined) {
  if (primer) {
    const base = primer
      .replaceAll(/\s/g, '_') // whitespaces
      .replaceAll(/[^\w]/g, ''); // removing illegal characters

    if (!validateIdentifier(base).success) {
      return 'item';
    }
    return base;
  }
  return 'item';
}

type ValidationResult =
  | {
      success: true;
      error?: undefined;
    }
  | {
      success: false;
      error?: string | undefined;
    };

/**
 * A function for checking whether an identifier is valid.
 * If `ident` passes the checks, it is not necessarily a valid identifier yet, as it may still collide with other idents or reserved keywords.
 * @example
 * validateIdentifier("ident"); // { success: true }
 * validateIdentifier("_"); // { success: false, error: `Identifiers cannot be equal to '' or '_'` }
 * validateIdentifier("my variable"); // { success: false, error: "Identifiers cannot contain whitespace." }
 * validateIdentifier("0"); // { success: false, error: "Identifier is not compliant with the WGSL guideline." }
 */
/*#__NO_SIDE_EFFECTS__*/
export function validateIdentifier(ident: string): ValidationResult {
  if (ident === '_' || ident === '') {
    return {
      success: false,
      error: `Identifiers cannot be equal to '' or '_'`,
    };
  }
  if (/\s/.test(ident)) {
    return {
      success: false,
      error: `Identifiers cannot contain whitespace.`,
    };
  }
  if (ident.startsWith('__')) {
    return {
      success: false,
      error: `Identifiers cannot start with double underscores.`,
    };
  }
  // see: https://www.w3.org/TR/WGSL/#syntax-ident_pattern_token
  if (!/^(([_\p{XID_Start}][\p{XID_Continue}]+)|([\p{XID_Start}]))$/u.test(ident)) {
    return {
      success: false,
      error: `Not compliant with WGSL guidelines.`,
    };
  }
  return {
    success: true,
  };
}

/**
 * Same as `validateIdentifier`, except also checks for bannedToken clashes.
 */
/*#__NO_SIDE_EFFECTS__*/
export function validateProp(ctx: ResolutionCtx, ident: string): ValidationResult {
  const identResult = validateIdentifier(ident);
  if (!identResult.success) {
    return identResult;
  }

  if (ctx.gen.isBannedToken(ident)) {
    return {
      success: false,
      error: `Identifiers cannot start with reserved keywords.`,
    };
  }
  return {
    success: true,
  };
}
