// The single gateway to content. Pages read research and projects through these
// functions, never straight from the collection, so anything marked
// `visibility: private` cannot reach a page, a list or the sitemap.

import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { sortKey } from './dates';

export type Research = CollectionEntry<'research'>;
export type Project = CollectionEntry<'projects'>;

const byDateDesc = (a: Research, b: Research) =>
  sortKey(b.data.date).localeCompare(sortKey(a.data.date)) ||
  (a.data.order ?? 99) - (b.data.order ?? 99) ||
  a.data.title.localeCompare(b.data.title);

/** Every public research entry, newest first. */
export async function getPublicResearch(): Promise<Research[]> {
  const entries = await getCollection('research', ({ data }) => data.visibility === 'public');
  return entries.sort(byDateDesc);
}

/** Work that has a page of its own: everything public except work still in progress. */
export const hasDetailPage = (entry: Research) => entry.data.publicationStatus !== 'in-progress';

export const researchPath = (entry: Research) => `/research/${entry.id}/`;

export async function getFeaturedResearch(limit = 3): Promise<Research[]> {
  const entries = (await getPublicResearch()).filter((entry) => entry.data.featured && hasDetailPage(entry));
  return entries.sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99)).slice(0, limit);
}

/** Related pieces: those named in front matter, otherwise the newest that share a topic. */
export function getRelated(entry: Research, all: Research[], limit = 3): Research[] {
  const candidates = all.filter((other) => other.id !== entry.id && hasDetailPage(other));
  const named = (entry.data.related ?? [])
    .map((id) => candidates.find((other) => other.id === id))
    .filter((other): other is Research => Boolean(other));
  if (named.length) return named.slice(0, limit);
  return candidates
    .filter((other) => other.data.topics.some((topic) => entry.data.topics.includes(topic)))
    .slice(0, limit);
}

/** "James Sahota and Benjamin Lozovsky", "A, B and C". */
export function formatAuthors(authors: string[]): string {
  if (authors.length <= 1) return authors[0] ?? '';
  return `${authors.slice(0, -1).join(', ')} and ${authors.at(-1)}`;
}

/** Co-authors only, for compact lists: "With Benjamin Lozovsky" or "Sole author". */
export function coAuthorLine(authors: string[], self: string): string {
  const others = authors.filter((author) => author !== self);
  if (!others.length) return 'Sole author';
  if (others.length > 3) return `With ${others.length} co-authors`;
  return `With ${formatAuthors(others)}`;
}

export async function getPublicProjects(): Promise<Project[]> {
  const entries = await getCollection('projects', ({ data }) => data.visibility === 'public');
  return entries.sort((a, b) => sortKey(b.data.start).localeCompare(sortKey(a.data.start)));
}

export const projectPath = (entry: Project) => `/projects/${entry.id}/`;

export async function getProfile() {
  const entry = await getEntry('profile', 'profile');
  if (!entry) throw new Error('src/content/profile.yaml is missing');
  return entry.data;
}

const byOrder = <T extends { data: { order: number } }>(a: T, b: T) => a.data.order - b.data.order;

export const getExperience = async () => (await getCollection('experience')).sort(byOrder);
export const getEducation = async () => (await getCollection('education')).sort(byOrder);
export const getCapabilities = async () => (await getCollection('capabilities')).sort(byOrder);

export async function getAbout() {
  const entry = await getEntry('about', 'about');
  if (!entry) throw new Error('src/content/about.md is missing');
  return entry;
}
