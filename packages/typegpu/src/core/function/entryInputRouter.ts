import { undecorate } from '../../data/dataTypes.ts';
import { snip, type Snippet } from '../../data/snippet.ts';
import { type BaseData, isWgslStruct } from '../../data/wgslTypes.ts';

interface PositionalArgEntry {
  argName: string;
  type: BaseData;
}

/**
 * Routes `(input) => { input.x }` style property access to the correct WGSL
 * expression: positional args get a direct snippet, struct fields get
 * `structArgName.fieldName`.
 */
export class EntryInputRouter {
  readonly structArgName: string;
  readonly dataSchema: BaseData | undefined;
  /** Maps schemaKey → { WGSL arg name, type } */
  readonly positionalArgsMap: Map<string, PositionalArgEntry>;

  constructor(
    structArgName: string,
    dataSchema: BaseData | undefined,
    positionalArgs: Array<{ schemaKey: string; argName: string; type: BaseData }>,
  ) {
    this.structArgName = structArgName;
    this.dataSchema = dataSchema;
    this.positionalArgsMap = new Map(
      positionalArgs.map((a) => [a.schemaKey, { argName: a.argName, type: a.type }]),
    );
  }

  accessProp(propName: string): Snippet | undefined {
    const positionalEntry = this.positionalArgsMap.get(propName);
    if (positionalEntry) {
      return snip(positionalEntry.argName, positionalEntry.type, 'argument');
    }

    if (this.dataSchema && isWgslStruct(this.dataSchema)) {
      const propType = this.dataSchema.propTypes[propName];
      if (propType) {
        return snip(`${this.structArgName}.${propName}`, undecorate(propType), 'argument');
      }
    }

    return undefined;
  }
}
