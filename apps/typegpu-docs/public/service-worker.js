// This service worker is responsible for intercepting fetch requests to
// assets hosted on the same origin, and attaching CORS headers that
// allow SharedArrayBuffer to function (required by @rolldown/browser).

self.addEventListener('fetch', (event) => {
  if (
    event.request.cache === 'only-if-cached' &&
    event.request.mode !== 'same-origin'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

        const moddedResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });

        return moddedResponse;
      })
      .catch((e) => {
        console.error(e);
      }),
  );
});
