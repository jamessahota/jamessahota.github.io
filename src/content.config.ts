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

// A file served from public/, written as it appears in the address bar: /James-Sahota-Resume.pdf
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
const fullDate = partialDate.refine((value) => value.length === 10, 'Use a full date: YYYY-MM-DD');

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
      editors: z.array(z.string()).default([]),
      date: partialDate.optional(),
      updated: partialDate.optional(),
      // A dated retrospective is distinct from the original report and its forecasts.
      reviewAsOf: partialDate.optional(),
      // One public case may be promoted on the homepage.
      flagshipCase: z.object({
        title: z.string().min(3),
        summary: z.string().min(30).max(240),
        symbol: z.string().optional(),
        prices: z.array(z.object({
          date: partialDate.refine((value) => value.length === 10, 'Use a full observation date'),
          label: z.string().min(1),
          close: z.number().positive(),
        })).min(2).max(4),
      }).optional(),
      // A newly dated hypothetical proposal, separate from the published forecast record.
      tradeSetup: z.object({
        asOf: fullDate,
        title: z.string().min(3),
        thesis: z.string().min(40),
        pricing: z.string().min(30),
        instrument: z.string().min(3),
        direction: z.enum(['long', 'short']),
        contractSize: z.number().int().positive(),
        contractExpiry: fullDate,
        entry: z.number().positive(),
        target: z.number().positive(),
        riskExit: z.number().positive(),
        entryDeadline: fullDate,
        finalExit: fullDate,
        illustrativeCapital: z.number().positive(),
        snapshot: z.object({
          value: z.number().positive(),
          date: fullDate,
          time: z.string().min(3),
          source: z.string().min(2),
          url: httpsUrl,
        }),
        enterIf: z.string().min(30),
        exitIf: z.string().min(30),
        risk: z.string().min(30),
        evidence: z.object({ text: z.string().min(30), label: z.string(), url: httpsUrl }),
      }).superRefine((setup, ctx) => {
        const ordered = setup.direction === 'short'
          ? setup.target < setup.entry && setup.entry < setup.riskExit
          : setup.riskExit < setup.entry && setup.entry < setup.target;
        if (!ordered) ctx.addIssue({ code: 'custom', message: 'Target and risk exit must be on opposite sides of the entry, in the trade direction' });
        if (setup.snapshot.date > setup.asOf || setup.asOf >= setup.entryDeadline || setup.entryDeadline >= setup.finalExit || setup.finalExit >= setup.contractExpiry) {
          ctx.addIssue({ code: 'custom', message: 'Use a dated snapshot, a future entry deadline, and an exit before contract expiry' });
        }
      }).optional(),
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
      playScenario: z.object({ href: link, label: z.string().min(3) }).optional(),
      fullReportMinutes: z.number().int().positive().optional(),
      featured: z.boolean().default(false),
      order: z.number().optional(),
      // A report-specific exhibit for the detail-page header. Values and mechanisms
      // come from the published research; forecasts and targets are labelled explicitly.
      headerVisual: z
        .discriminatedUnion('kind', [
          z.object({
            kind: z.literal('bars'),
            title: z.string().min(3),
            unit: z.string().min(1),
            domain: z.object({ min: z.number(), max: z.number() }).optional(),
            items: z.array(z.object({
              label: z.string().min(1),
              value: z.number(),
              display: z.string().optional(),
              status: z.enum(['reported', 'projection', 'target']).optional(),
            })).min(2).max(5).refine((items) => items.some((item) => item.value !== 0), 'A comparison needs a nonzero value'),
            note: z.string().min(10),
            source: z.string().min(5),
          }),
          z.object({
            kind: z.literal('sequence'),
            title: z.string().min(3),
            steps: z.array(z.object({
              label: z.string().min(1),
              value: z.string().optional(),
              detail: z.string().min(3),
            })).min(2).max(4),
            note: z.string().min(10),
            source: z.string().min(5),
          }),
          z.object({
            kind: z.literal('ranges'),
            title: z.string().min(3),
            unit: z.string().min(1),
            domain: z.object({ min: z.number(), max: z.number() }),
            items: z.array(z.object({
              label: z.string().min(1),
              low: z.number(),
              high: z.number(),
              display: z.string().min(1),
              detail: z.string().optional(),
            })).min(2).max(5),
            note: z.string().min(10),
            source: z.string().min(5),
          }),
        ])
        .optional(),
      // A bespoke preview exhibit; kept separate from the report's body figures.
      cardFigure: z
        .discriminatedUnion('kind', [
          z.object({
            kind: z.literal('cash-returns'),
            title: z.string(),
            // `amount` is the figure as a plain number in `unit`, so the bars can be drawn to scale.
            unit: z.string(),
            numbers: z.array(keyNumber.extend({ amount: z.number().positive() })).length(2),
          }),
          z.object({
            kind: z.literal('clean-power'),
            title: z.string(),
            numbers: z.array(keyNumber.extend({ percentage: z.number().min(0).max(100) })).length(2),
          }),
        ])
        .optional(),
      keyNumbers: z.array(keyNumber).min(1).max(4).optional(),
      keyNumbersNote: z.string().optional(),
      keyFindings: z.array(z.string()).max(6).default([]),
      // What the report itself says would change its view. Taken from the published text,
      // never added after the fact. 'weaken' would count against the view, 'strengthen' for it.
      viewChangers: z
        .array(z.object({ condition: z.string(), direction: z.enum(['weaken', 'strengthen', 'either']) }))
        .min(1)
        .max(4)
        .optional(),
      charts: z
        .array(
          z.object({
            title: z.string(),
            unit: z.string(),
            // 'bars' compares values from zero. 'futures-curve' plots contract prices as a
            // line, spaced by each item's `period` (the contract month, YYYY-MM).
            kind: z.enum(['bars', 'futures-curve']).default('bars'),
            // Bars start at zero, so values cannot be negative and one must be above zero.
            items: z
              .array(
                z.object({
                  label: z.string(),
                  value: z.number().nonnegative(),
                  period: z
                    .string()
                    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM')
                    .optional(),
                }),
              )
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
      if (data.tradeSetup && (!data.date || data.tradeSetup.asOf < data.date)) {
        ctx.addIssue({ code: 'custom', path: ['tradeSetup', 'asOf'], message: 'A trade proposal must be dated on or after the original report' });
      }
      if (data.flagshipCase) {
        const prices = data.flagshipCase.prices;
        if (!data.reviewAsOf || prices[0]!.date !== data.date || prices.at(-1)!.date !== data.reviewAsOf) {
          ctx.addIssue({ code: 'custom', path: ['flagshipCase'], message: 'Flagship reference prices must run from publication to the dated review' });
        }
        if (prices.some((point, index) => index > 0 && point.date <= prices[index - 1]!.date)) {
          ctx.addIssue({ code: 'custom', path: ['flagshipCase', 'prices'], message: 'Reference-price observations must be in date order' });
        }
      }
      if (data.headerVisual?.kind === 'bars' && data.headerVisual.domain) {
        const { domain, items } = data.headerVisual;
        if (domain.max <= domain.min || domain.min > 0 || domain.max < 0 || items.some((item) => item.value < domain.min || item.value > domain.max)) {
          ctx.addIssue({ code: 'custom', path: ['headerVisual'], message: 'Comparison domains must include zero and all values' });
        }
      }
      if (data.headerVisual?.kind === 'ranges') {
        const { domain, items } = data.headerVisual;
        if (domain.max <= domain.min || items.some((item) => item.low > item.high || item.low < domain.min || item.high > domain.max)) {
          ctx.addIssue({ code: 'custom', path: ['headerVisual'], message: 'Scenario ranges must fit an increasing domain, with low no greater than high' });
        }
      }
      if (data.publicationStatus === 'published' && !data.date) {
        ctx.addIssue({ code: 'custom', path: ['date'], message: 'Published research needs a date' });
      }
      if (data.publicationStatus === 'published' && !data.originalUrl && !data.pdf && !data.playScenario) {
        ctx.addIssue({
          code: 'custom',
          path: ['originalUrl'],
          message: 'Published research needs an originalUrl, a pdf, or a playable scenario for an on-site case study',
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
    homeSummary: z.string().min(40).max(200).optional(),
    kind: z.string(),
    start: partialDate,
    end: partialDate.optional(),
    visibility: z.enum(['public', 'private']),
    featured: z.boolean().default(false),
    facts: z.array(keyNumber).min(1).max(4).optional(),
    factsNote: z.string().optional(),
    development: z.array(z.object({
      label: z.string().min(1),
      title: z.string().min(1),
      text: z.string().min(20),
      section: z.string().regex(/^[a-z0-9-]+$/),
    })).min(2).max(4).optional(),
    investmentCase: z.object({
      preparedFor: z.string(),
      pdf: publicFile,
      slides: publicFile,
      workbook: publicFile.optional(),
      ebitdaBridge: z.array(z.object({
        label: z.string(),
        value: z.number(),
        kind: z.enum(['total', 'change']),
      })).min(3).refine((items) => {
        const first = items[0]!;
        const last = items.at(-1)!;
        return first.kind === 'total' && last.kind === 'total' &&
          items.slice(1, -1).every((item) => item.kind === 'change') &&
          Math.abs(first.value + items.slice(1, -1).reduce((sum, item) => sum + item.value, 0) - last.value) < 0.05;
      }, 'The modelled EBITDA bridge must reconcile to its final total'),
    }).optional(),
    // Screenshots or sample outputs, shown above the case study text.
    figures: z.array(figure).min(1).optional(),
    // A game played on the project's own page. The value names its component.
    game: z.enum(['cargo-desk']).optional(),
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
    workHighlights: z.array(z.object({ label: z.string(), description: z.string(), href: link })).min(1).max(3).optional(),
    contactInvite: z.string(),
    // The panel beside the homepage About paragraph: what James is looking for next.
    lookingFor: z.object({ label: z.string(), title: z.string(), text: z.string(), markets: z.array(z.string()).min(1) }),
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
    // Courses being taken now; shown as 'In progress' on the Experience page.
    courseworkInProgress: z.array(z.string()).optional(),
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

// Dated views from the reports, and what the market did. Each view is quoted from a published
// report; an outcome is added only from a named price source, and whether it fell inside the
// range is worked out by the page, never typed in.
// YAML reads an unquoted 2026-10-09 as a date, so accept that as well as text.
const isoDay = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
);
const views = defineCollection({
  loader: file('src/content/views.yaml'),
  schema: z
    .object({
      id: z.string(),
      report: z.string(),
      // 'report': stated in the report's text. 'call': a call card published with the report.
      source: z.enum(['report', 'call']),
      view: z.string(),
      // The report's publication date and when the view is due to be judged.
      formed: isoDay,
      due: isoDay,
      // A call can be one-sided ("at or below 115"), so either end may be left out.
      range: z.object({ low: z.number().optional(), high: z.number().optional(), unit: z.string() }),
      // Endpoint: the price on the due date. Average: the average over the period.
      basis: z.enum(['endpoint', 'average']),
      instrument: z.string(),
      // While a view is open, the latest price of its instrument, from src/data/latest-prices.json.
      track: z.string().optional(),
      // Related market context: plotted with a label, never used to assess a view's outcome.
      referenceTrack: z.string().optional(),
      // Sourced publication reference; related-market references cannot assess the benchmark.
      entry: z.object({
        value: z.number().positive(), date: isoDay, source: z.string(), sourceUrl: link.optional(),
        sourceLabel: z.string().optional(), evidenceUrl: link.optional(),
        basis: z.enum(['benchmark', 'reference']).default('benchmark'),
      }).optional(),
      entryUnavailable: z.string().optional(),
      outcome: z
        .object({ value: z.number(), date: isoDay, source: z.string(), sourceUrl: link.optional() })
        .optional(),
      context: z.string().optional(),
    })
    .refine((view) => view.range.low !== undefined || view.range.high !== undefined, 'A range needs a low or a high end')
    .refine(
      (view) => view.range.low === undefined || view.range.high === undefined || view.range.low < view.range.high,
      'The low end of a range must be below the high end',
    )
    .refine((view) => !view.track || view.track !== view.referenceTrack, 'An exact track cannot also be its own reference')
    .refine((view) => view.entry?.basis !== 'reference' || Boolean(view.referenceTrack), 'A reference entry needs a referenceTrack')
    .refine((view) => !view.entry || !view.entryUnavailable, 'Use an entry reference or explain why it is unavailable, not both')
    .refine((view) => !view.entry || view.entry.date <= view.formed, 'An entry reference cannot use a date after the view was formed'),
});

export const collections = { research, projects, profile, about, experience, education, capabilities, views };
