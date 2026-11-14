// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

// The public address of the site. This is the only place the build reads it from.
// (It is also written on the share image: see scripts/share-image.html.)
// If the site moves to a custom domain, change it here and add public/CNAME.
const SITE_URL = 'https://jamessahota.github.io';

const sansFiles = '@fontsource-variable/geist/files';
const monoFiles = '@fontsource-variable/geist-mono/files';

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Anton',
      cssVariable: '--font-display',
      fallbacks: ['Impact', 'Arial Narrow', 'sans-serif'],
      options: {
        variants: [{ src: ['@fontsource/anton/files/anton-latin-400-normal.woff2'], weight: '400', style: 'normal' }],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Geist',
      cssVariable: '--font-geist',
      fallbacks: ['Helvetica Neue', 'Arial', 'sans-serif'],
      options: {
        variants: [
          { src: [`${sansFiles}/geist-latin-wght-normal.woff2`], weight: '100 900', style: 'normal' },
          { src: [`${sansFiles}/geist-latin-wght-italic.woff2`], weight: '100 900', style: 'italic' },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'Geist Mono',
      cssVariable: '--font-geist-mono',
      fallbacks: ['Menlo', 'Consolas', 'monospace'],
      options: {
        variants: [{ src: [`${monoFiles}/geist-mono-latin-wght-normal.woff2`], weight: '100 900', style: 'normal' }],
      },
    },
  ],
});
