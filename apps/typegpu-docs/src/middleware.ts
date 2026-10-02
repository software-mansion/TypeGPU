import { defineMiddleware } from 'astro:middleware';

const COEP_ROUTES = ['/TypeGPU/translator'];

export const onRequest = defineMiddleware(({ url, request }, next) => {
  if (!COEP_ROUTES.some((route) => url.pathname.startsWith(route))) {
    return next();
  }

  return next().then((response) => {
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    newResponse.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    return newResponse;
  });
});
