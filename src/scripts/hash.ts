// Personal links: #for-<company-slug> and #for-<company-slug>--bp-<NN> (NN = 01..10).
// The slug must match ^[a-z0-9]+(-[a-z0-9]+)*$ and be at most 40 characters; anything else is not a personal link.

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX = 40;

export interface PersonalLink {
  slug: string;
  /** "01".."10", or null when absent or invalid (an invalid blueprint is ignored, the company is kept). */
  blueprint: string | null;
}

export function parsePersonalHash(hash: string): PersonalLink | null {
  if (!/^#for-[A-Za-z0-9-]+$/.test(hash)) return null;
  const body = hash.slice(4); // keeps the dash that separates "for" from the slug
  const k = body.indexOf('--bp-');
  const slug = k >= 0 ? body.slice(1, k) : body.slice(1);
  if (slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) return null; // no/invalid company: not a personal link
  let blueprint: string | null = null;
  if (k >= 0) {
    const num = body.slice(k + 5);
    if (/^(0[1-9]|10)$/.test(num)) blueprint = num;
  }
  return { slug, blueprint };
}

/** "acme-logistics" -> "Acme Logistics". */
export const slugToName = (slug: string): string =>
  slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** Generic blueprint link: #bp-<NN> (01..10), no company. Anything else returns null. */
export function parseBlueprintHash(hash: string): string | null {
  const m = /^#bp-(0[1-9]|10)$/.exec(hash);
  return m ? m[1] : null;
}
