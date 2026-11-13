// The sitemap is built from the same public lists the pages use,
// so private research and projects can never appear in it.
import type { APIRoute } from 'astro';
import { getPublicProjects, getPublicResearch, hasDetailPage, projectPath, researchPath } from '../lib/content';

export const GET: APIRoute = async ({ site }) => {
  if (!site) throw new Error('Set `site` in astro.config.mjs to build the sitemap');

  const research = (await getPublicResearch()).filter(hasDetailPage).map(researchPath);
  const projects = (await getPublicProjects()).map(projectPath);
  const paths = ['/', '/research/', '/experience/', '/about/', '/cv/', ...research, ...projects];

  const urls = paths.map((path) => `  <url><loc>${new URL(path, site).href}</loc></url>`).join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
