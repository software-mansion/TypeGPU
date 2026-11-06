export const NEXT = 1;
export const RETURN = 2;
export const BREAK = 4;
export const CONTINUE = 8;

export function appendStatementControlFlow(
  sequenceBehaviors: number,
  statementBehavior: number,
): number {
  if (!(sequenceBehaviors & NEXT)) {
    return sequenceBehaviors;
  }

  return (sequenceBehaviors & ~NEXT) | statementBehavior;
}
