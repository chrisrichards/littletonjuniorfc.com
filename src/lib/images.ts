import type { ImageMetadata } from 'astro';

/**
 * astro:assets only optimises images imported as modules from src/. Our content
 * (pages, JSON collections, component props) stores plain string paths like
 * `/images/heros/teams.jpg`, so we eagerly import everything under
 * src/assets and resolve those strings to the imported ImageMetadata.
 *
 * The src/assets tree mirrors the old public/images tree, so a path of
 * `/images/<rest>` maps to the glob key `/src/assets/<rest>`.
 */
const modules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/**/*.{jpg,jpeg,png,webp,avif}',
  { eager: true }
);

const byPath = new Map<string, ImageMetadata>();
for (const [key, mod] of Object.entries(modules)) {
  // key: '/src/assets/heros/teams.jpg' -> public-style '/images/heros/teams.jpg'
  byPath.set(key.replace('/src/assets/', '/images/'), mod.default);
}

/** Resolve a stored `/images/...` path to an importable ImageMetadata.
 *  Throws on a miss so a typo fails the build instead of shipping a blank. */
export function asset(path: string): ImageMetadata {
  const img = byPath.get(path);
  if (!img) throw new Error(`asset(): no image under src/assets for "${path}"`);
  return img;
}
