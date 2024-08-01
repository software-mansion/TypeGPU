export class ExecutionCancelledError extends Error {
  constructor() {
    super('Sandbox cancelled execution.');

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ExecutionCancelledError.prototype);
  }
}
