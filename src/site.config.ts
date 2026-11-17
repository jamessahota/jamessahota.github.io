// Site-wide settings that are not content: navigation and the research taxonomy.
// The public site address lives in astro.config.mjs.

export const SITE = {
  name: 'James Sahota',
  title: 'James Sahota | Research across energy and markets',
  description:
    'James Sahota studies mathematics and economics at the University of Chicago and co-founded 6:05 Markets. His interests span Sales & Trading and physical commodities trading, with a focus on energy markets.',
} as const;

export const NAV = [
  { label: 'Research', href: '/research/' },
  { label: 'Projects', href: '/projects/' },
  { label: 'Experience', href: '/experience/' },
  { label: 'About', href: '/about/' },
] as const;

// Research topics. Add a topic here before using it in a report's front matter.
export const TOPICS = {
  'oil-markets': 'Oil markets',
  'refining-products': 'Refining & products',
  'gas-lng': 'Natural gas & LNG',
  'shipping-chokepoints': 'Shipping & chokepoints',
  'policy-security': 'Energy policy & security',
  companies: 'Energy companies',
} as const;

export type TopicId = keyof typeof TOPICS;
export const TOPIC_IDS = Object.keys(TOPICS) as [TopicId, ...TopicId[]];

export const RESEARCH_TYPES = {
  report: 'Report',
  commentary: 'Commentary',
  'company-note': 'Company note',
} as const;

export type ResearchTypeId = keyof typeof RESEARCH_TYPES;
export const RESEARCH_TYPE_IDS = Object.keys(RESEARCH_TYPES) as [ResearchTypeId, ...ResearchTypeId[]];

export const STATUS_LABELS = {
  published: 'Published',
  'working-paper': 'Working paper',
  'in-progress': 'In progress',
} as const;
