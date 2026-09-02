/**
 * Whether a CTA should open in a new tab.
 *
 * Decided by the href, not by the link's label or action. The old rule keyed off
 * the action ("anything that isn't a download opens a new tab"), which was true
 * while every non-download link went to another site — then /resources gained a
 * link to our own /schedule and it opened in a new tab.
 *
 * So: only links that actually leave the site open a new tab. Same-origin pages
 * ("/schedule") and same-origin downloads ("images/downloads/x.pdf") stay in the
 * current tab, and mailto: hands off to a mail client rather than a tab.
 */
export function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
}

export function ctaBlank(href: string): boolean {
  return isExternal(href) && !href.toLowerCase().startsWith('mailto:');
}
