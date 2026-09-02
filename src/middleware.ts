import { defineMiddleware } from 'astro:middleware';

/*
 * Local sign-in shim.
 *
 * Cloudflare Access sits in front of the deployed Worker, but nothing sits in
 * front of `astro dev`, so there is no identity locally. Visiting any page with
 * `?as=someone@example.com` stores that address in a cookie which
 * src/lib/access.ts reads, making the booking form clickable in a browser
 * without a header-editing extension. `?as=` on its own signs out.
 *
 * `import.meta.env.DEV` is statically replaced at build time, so the whole body
 * of this middleware is removed from a production bundle — it cannot be reached
 * on the deployed Worker.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (!import.meta.env.DEV) return next();

  const as = context.url.searchParams.get('as');
  if (as === null) return next();

  if (as === '') {
    context.cookies.delete('dev_user', { path: '/' });
  } else {
    context.cookies.set('dev_user', as, { path: '/', httpOnly: true, sameSite: 'lax' });
  }

  // Redirect to the same URL without `as`, so the cookie is what carries the
  // identity from here on and the address bar stays clean.
  const clean = new URL(context.url);
  clean.searchParams.delete('as');
  return context.redirect(clean.pathname + clean.search, 303);
});
