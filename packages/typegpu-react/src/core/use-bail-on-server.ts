/**
 * Throwing an error only on the server to opt-out of server rendering, show the nearest
 * suspense boundary and resume on the client as recommended by:
 *
 * https://react.dev/reference/react/Suspense#providing-a-fallback-for-server-errors-and-client-only-content
 *
 * It unfortunately still causes an error log to be surfaced to the developer, tracked here:
 * https://github.com/reactjs/react.dev/issues/8497
 */
export function useBailOnServer() {
  if (typeof window === 'undefined') {
    throw new Error(
      `WebGPU cannot be used on the server. Make sure that this component runs only on the client.\n` +
        `You can use the <ClientOnly /> component from '@typegpu/react' to help with this.`,
    );
  }
}
