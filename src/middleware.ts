import { defineMiddleware } from 'astro:middleware';
import type { APIContext } from 'astro';
import { getUser } from './lib/access';

/*
 * Local sign-in shim.
 *
 * Cloudflare Access sits in front of the deployed Worker, but nothing sits in
 * front of `astro dev`, so there is no identity locally. Visiting any page with
 * `?as=someone@example.com` stores that address in a cookie which
 * src/lib/access.ts reads, making the booking form clickable in a browser
 * without a header-editing extension. `?as=` on its own signs out.
 *
 * `import.meta.env.DEV` is statically replaced at build time, so this branch is
 * removed from a production bundle — it cannot be reached on the deployed Worker.
 */
function devSignIn(context: APIContext): Response | null {
  const as = context.url.searchParams.get('as');
  if (as === null) return null;

  if (as === '') {
    context.cookies.delete('dev_user', { path: '/' });
    context.cookies.delete(ADMIN_HINT, { path: '/' });
  } else {
    context.cookies.set('dev_user', as, { path: '/', httpOnly: true, sameSite: 'lax' });
  }

  // Redirect to the same URL without `as`, so the cookie is what carries the
  // identity from here on and the address bar stays clean.
  const clean = new URL(context.url);
  clean.searchParams.delete('as');
  return context.redirect(clean.pathname + clean.search, 303);
}

/*
 * Admin hint for the footer.
 *
 * Almost every page is prerendered, so the footer can't know who is looking at
 * it. Instead, whenever a server-rendered request comes from a verified admin,
 * we drop a script-readable `ljfc_admin` cookie and BaseLayout shows an "Admin"
 * link when it is present. It is only a UI hint, never authorisation: /admin*
 * is still behind Access and the pages still check roleFor(). A stale hint just
 * leads to the Access login.
 *
 * Cleared only when we know the caller is not an admin — requests on paths
 * outside the Access application may arrive without a token at all.
 */
const ADMIN_HINT = 'ljfc_admin';

async function setAdminHint(context: APIContext) {
  let user;
  try {
    user = await getUser(context.request);
  } catch {
    return; // Access not configured (e.g. local dev without a stand-in identity)
  }
  if (!user) return;
  if (user.role === 'admin') {
    context.cookies.set(ADMIN_HINT, '1', {
      path: '/',
      sameSite: 'lax',
      secure: !import.meta.env.DEV,
      maxAge: 60 * 60 * 24 * 30,
    });
  } else if (context.cookies.has(ADMIN_HINT)) {
    context.cookies.delete(ADMIN_HINT, { path: '/' });
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (import.meta.env.DEV) {
    const redirect = devSignIn(context);
    if (redirect) return redirect;
  }

  if (context.isPrerendered) return next();
  await setAdminHint(context);
  return next();
});
