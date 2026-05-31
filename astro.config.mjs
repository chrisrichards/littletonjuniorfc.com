// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // imageService: 'compile' makes the adapter run sharp at BUILD time for
  // prerendered pages, emitting static avif/webp into _astro/ — instead of
  // the default on-demand /_image Worker endpoint (wrong for a static site).
  adapter: cloudflare({ imageService: 'compile' })
});