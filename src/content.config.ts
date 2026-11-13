// Content model. Every file in src/content/ is checked against these schemas
// when the site builds, so a missing field or a broken link stops the build
// with a message naming the file.

import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { RESEARCH_TYPE_IDS, TOPIC_IDS } from './site.config';

// --- Shared field types ------------------------------------------------------

const isRealDate = (value: string) => {
  const [y, m = 1, d = 1] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

// Dates may be a year, a month or a day: 2026, 2026-05 or 2026-05-13.
// YAML turns an unquoted full date into a Date object and a bare year into a
// number, so both are converted back to text before checking.
const partialDate = z.preprocess(
  (value) => {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') return String(value);
    return value;
  },
  z
    .string()
    .regex(/^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/, 'Use YYYY, YYYY-MM or YYYY-MM-DD')
    .refine(isRealDate, 'This is not a real calendar date'),
);

const httpsUrl = z.url().refine((url) => url.startsWith('https://'), 'Links must start with https://');

// A file served from public/, written as it appears in the address bar: /James-Sahota-CV.pdf
const publicFile = z
  .string()
  .regex(/^\/[A-Za-z0-9._\-/]+$/, 'Use a path that starts with / and has no spaces')
  .refine((path) => existsSync(join(process.cwd(), 'public', path)), 'File not found in the public/ folder');

// An internal page (/research/) or an https link.
const link = z.union([
  z
    .string()
    .regex(
      /^\/[a-z0-9\-/]*(\?[a-z0-9=&-]+)?(#[a-z0-9-]+)?$/,
      'Internal links look like /research/, /research/?topic=gas-lng or /experience/#education',
    ),
  httpsUrl,
]);

const keyNumber = z.object({ value: z.string(), label: z.string() });

// An image shown with a caption and credit. Width and height are the image's size in pixels.
const figure = z.object({
  src: publicFile,
  alt: z.string().min(10),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  caption: z.string(),
  credit: z.string(),
});

// --- Research ----------------------------------------------------------------

const research = defineCollection({
  loader: glob({ base: './src/content/research', pattern: '**/*.md' }),
  schema: z
    .object({
      title: z.string().min(3),
      subtitle: z.string().optional(),
      // One or two sentences for the index and homepage. Lead with the question.
      summary: z.string().min(40).max(340),
      // The opening paragraph on the report's own page.
      standfirst: z.string().optional(),
      authors: z.array(z.string()).min(1),
      authorshipNote: z.string().optional(),
      // What James did on a co-authored piece. Leave out if not yet written.
      contribution: z.string().optional(),
      date: partialDate.optional(),
      updated: partialDate.optional(),
      dataAsOf: z.string().optional(),
      topics: z.array(z.enum(TOPIC_IDS)).min(1).max(3),
      type: z.enum(RESEARCH_TYPE_IDS),
      venue: z.object({ name: z.string(), url: httpsUrl.optional() }),
      // Where the work stands. Separate from whether it may be shown.
      publicationStatus: z.enum(['published', 'working-paper', 'in-progress']),
      // private entries are left out of every page, list and sitemap.
      visibility: z.enum(['public', 'private']),
      pdf: publicFile.optional(),
      originalUrl: httpsUrl.optional(),
      fullReportMinutes: z.number().int().positive().optional(),
      cover: z.object({ src: publicFile, alt: z.string(), credit: z.string().optional() }).optional(),
      featured: z.boolean().default(false),
      order: z.number().optional(),
      keyNumbers: z.array(keyNumber).min(1).max(4).optional(),
      keyNumbersNote: z.string().optional(),
      keyFindings: z.array(z.string()).max(6).default([]),
      charts: z
        .array(
          z.object({
            title: z.string(),
            unit: z.string(),
            // Bars start at zero, so values cannot be negative and one must be above zero.
            items: z
              .array(z.object({ label: z.string(), value: z.number().nonnegative() }))
              .min(2)
              .refine((items) => items.some((item) => item.value > 0), 'A chart needs at least one value above zero'),
            caption: z.string().optional(),
            source: z.string(),
          }),
        )
        .min(1)
        .optional(),
      tables: z
        .array(
          z.object({
            title: z.string(),
            columns: z.array(z.string()).min(2),
            rows: z.array(z.array(z.string())).min(1),
            note: z.string().optional(),
            source: z.string().optional(),
          }),
        )
        .min(1)
        .optional(),
      figures: z.array(figure).min(1).optional(),
      approach: z.string().optional(),
      sources: z.array(z.object({ label: z.string(), url: httpsUrl.optional() })).min(1).optional(),
      // File names (without .md) of related pieces. Chosen automatically if left out.
      related: z.array(z.string()).max(3).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.publicationStatus === 'published' && !data.date) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'Published research needs a date' });
      }
      if (data.publicationStatus === 'published' && !data.originalUrl && !data.pdf) {
        ctx.addIssue({
          code: 'custom',
          path: ['originalUrl'],
          message: 'Published research needs an originalUrl or a pdf so readers can reach the full piece',
        });
      }
      for (const table of data.tables ?? []) {
        if (table.rows.some((row) => row.length !== table.columns.length)) {
          ctx.addIssue({
            code: 'custom',
            path: ['tables'],
            message: `Every row in "${table.title}" needs ${table.columns.length} cells`,
          });
        }
      }
    }),
});

// --- Projects ----------------------------------------------------------------

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    summary: z.string().min(40).max(340),
    kind: z.string(),
    start: partialDate,
    end: partialDate.optional(),
    visibility: z.enum(['public', 'private']),
    featured: z.boolean().default(false),
    facts: z.array(keyNumber).min(1).max(4).optional(),
    factsNote: z.string().optional(),
    // Screenshots or sample outputs, shown above the case study text.
    figures: z.array(figure).min(1).optional(),
  }),
});

// --- Profile, experience, education, capabilities ------------------------------

const profile = defineCollection({
  loader: glob({ base: './src/content', pattern: 'profile.yaml' }),
  schema: z.object({
    name: z.string(),
    positioning: z.string(),
    intro: z.string(),
    location: z.string(),
    email: z.email(),
    linkedin: httpsUrl,
    atAGlance: z.array(z.object({ label: z.string(), value: z.string(), href: link.optional() })),
    contactInvite: z.string(),
    homeAbout: z.string(),
    languages: z.array(z.object({ name: z.string(), level: z.string() })),
    athletics: z.array(z.string()),
    awards: z.array(z.string()),
    cv: z.object({ pdf: publicFile.optional(), updated: z.string() }),
  }),
});

const about = defineCollection({
  loader: glob({ base: './src/content', pattern: 'about.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    lede: z.string(),
    approach: z.array(
      z.object({
        title: z.string(),
        text: z.string(),
        example: z.object({ label: z.string(), href: link }).optional(),
      }),
    ),
    beyondWork: z.array(z.string()),
  }),
});

const experience = defineCollection({
  loader: file('src/content/experience.yaml'),
  schema: z.object({
    id: z.string(),
    // Position on the page: 1 comes first.
    order: z.number(),
    organisation: z.string(),
    url: httpsUrl.optional(),
    role: z.string(),
    kind: z.string(),
    location: z.string().optional(),
    start: partialDate,
    end: partialDate.optional(),
    highlights: z.array(z.string()).min(1).max(4),
    note: z.string().optional(),
    homeSummary: z.string().optional(),
    showOnHome: z.boolean().default(false),
    related: z.object({ label: z.string(), href: link }).optional(),
  }),
});

const education = defineCollection({
  loader: file('src/content/education.yaml'),
  schema: z.object({
    id: z.string(),
    order: z.number(),
    institution: z.string(),
    location: z.string(),
    qualification: z.string(),
    period: z.string(),
    coursework: z.array(z.string()).optional(),
    activities: z.array(z.string()).optional(),
  }),
});

const capabilities = defineCollection({
  loader: file('src/content/capabilities.yaml'),
  schema: z.object({
    id: z.string(),
    order: z.number(),
    title: z.string(),
    description: z.string(),
    evidence: z.array(z.object({ label: z.string(), href: link })).optional(),
  }),
});

export const collections = { research, projects, profile, about, experience, education, capabilities };
