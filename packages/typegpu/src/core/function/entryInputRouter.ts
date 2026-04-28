import { type Snippet } from '../../data/snippet.ts';
import { $internal, $repr } from '../../shared/symbols.ts';
import { type BaseData, isWgslStruct } from '../../data/wgslTypes.ts';
import type { FunctionArgumentAccess } from '../../types.ts';

/**
 * Routes `(input) => { input.x }` style property access to the correct WGSL
 * expression: positional args get a direct snippet, struct fields get
 * `structArgName.fieldName`.
 */
export class EntryInputRouter implements BaseData {
  readonly [$internal]: Record<string, unknown> = {};
  readonly type = 'entry-input-router' as const;
  // Type-token only, not present at runtime:
  declare readonly [$repr]: never;

  readonly structArg: FunctionArgumentAccess | undefined;
  /** Maps schemaKey → { WGSL arg name, type } */
  readonly positionalArgsMap: Map<string, FunctionArgumentAccess>;

  constructor(
    structArg: FunctionArgumentAccess | undefined,
    positionalArgs: { schemaKey: string; arg: FunctionArgumentAccess }[],
  ) {
    this.structArg = structArg;
    this.positionalArgsMap = new Map(positionalArgs.map((a) => [a.schemaKey, a.arg]));
  }

  toString(): string {
    return 'entry-input-router';
  }

  accessProp(propName: string): Snippet | { target: Snippet; prop: string } | undefined {
    const positionalEntry = this.positionalArgsMap.get(propName);
    if (positionalEntry) {
      return positionalEntry();
    }

    const structSnippet = this.structArg?.();
    if (structSnippet && isWgslStruct(structSnippet.dataType)) {
      return { target: structSnippet, prop: propName };
    }

    return undefined;
  }
}
