/**
 * A CTA opens in a new tab unless it's an Email (mailto:) or a Download
 * (same-origin PDF). Centralised so official-info + resources agree.
 */
export function ctaBlank(label: string): boolean {
  return label !== 'Email' && label !== 'Download';
}
