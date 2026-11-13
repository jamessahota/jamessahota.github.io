# jamessahota.github.io

Personal website of James Sahota: research, experience, CV and projects.

Built with [Astro](https://astro.build) as a fully static site. Content lives in plain Markdown and YAML files, so most updates need no code.

> **This repository is public.** Anyone can read every file in it. Never commit an unpublished draft, a private source document or contact details you would not put on the site. Marking an entry `visibility: private` keeps it off the website, but not out of this repository.

## Run it locally

You need [Node.js](https://nodejs.org) 22.23.4 or newer (the LTS installer is fine). Then, from this folder:

```bash
npm install        # once, to fetch dependencies
npm run dev        # live preview at http://localhost:4321
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run build` | Builds the finished site into `dist/` |
| `npm run preview` | Serves `dist/` at http://localhost:4321 exactly as it will be published |
| `npm run check` | Type-checks the pages and validates all content |
| `npm test` | Smoke tests against `dist/` (run `npm run build` first) |
| `npm run verify` | All of the above in order: check, build, test. This is what runs before every deployment |

## Where things live

| To change | Edit |
| --- | --- |
| Name, introduction, email, LinkedIn, languages, awards, athletics | `src/content/profile.yaml` |
| Biography, research approach and other interests | `src/content/about.md` |
| Roles | `src/content/experience.yaml` |
| Degree, coursework, activities | `src/content/education.yaml` |
| Capabilities and the evidence for each | `src/content/capabilities.yaml` |
| Research | one file per piece in `src/content/research/` |
| Project case studies | one file per project in `src/content/projects/` |
| Navigation and research topics | `src/site.config.ts` |
| Colours, fonts, spacing, corner radius | `src/styles/global.css` (the tokens at the top) |
| The public address of the site | `astro.config.mjs` (`SITE_URL`, set once) |
| The CV, and any report PDFs or images | `public/` |

Page layouts are in `src/pages/` and shared pieces in `src/components/`. Adding a report or updating a role does not require touching either.

## Common tasks

### Add a report

1. Copy an existing file in `src/content/research/`, for example `saudi-crude-rerouting-yanbu.md`, and rename it. The file name becomes the address: `my-report.md` appears at `/research/my-report/`.
2. Fill in the front matter (the block between the `---` lines). The essentials:

   ```yaml
   title: "Exact Title of the Report"
   summary: >-
     One or two sentences. Lead with the question the report answers.
   authors:
     - James Sahota
     - A Co-author
   date: 2026-11-20            # or 2026-11, or 2026, if that is all you can verify
   topics:
     - oil-markets             # see TOPICS in src/site.config.ts
   type: report                # report, brief, company-note or commentary
   venue:
     name: "6:05 Markets"
     url: https://605-markets.com/
   publicationStatus: published   # published, working-paper or in-progress
   visibility: public             # public or private
   originalUrl: https://605-markets.com/report/the-report/
   keyFindings:
     - First finding, with its qualifications intact.
     - Second finding.
   ```

3. Write the summary in the body, below the second `---`.
4. Optional extras: `subtitle`, `standfirst`, `keyNumbers`, `charts`, `tables`, `approach`, `sources`, `related` and `dataAsOf` are shown in `oil-above-100-supply-shock.md`, and `authorshipNote` in `diesel-distillate-bottleneck.md`. `contribution` is one line of text. `figures` is a list of images, each with `src`, `alt`, `width`, `height`, `caption` and `credit`.
5. Run `npm run verify`. If a field is missing or a link is malformed, the message names the file and the field.

Rules the build enforces: published work needs a `date` and either an `originalUrl` or a `pdf`; links must start with `https://`; a `pdf`, `figures` image or `cover` must exist in `public/`; table rows must match their columns; chart values cannot be negative.

**Dates and order.** The list is newest first. A date without a day (`2026-05`) counts as the end of that month, so it is listed above a piece dated the 1st. Give the full date whenever you can verify it.

**Work in progress.** Set `publicationStatus: in-progress`. The piece is listed in the "In progress" panel on the research page and gets no page of its own, so no date or findings are needed. When it is published, change the status, add the `date` and `originalUrl`, and it moves into the main list.

**A PDF of a report.** Put the approved file in `public/research/`, with no spaces in its name, and add `pdf: /research/the-file.pdf`. An "Open the PDF" button appears.

**A chart or figure from a report.** Put the image in `public/research/` and add it under `figures` with `src`, `alt`, `width`, `height`, `caption` and `credit`. For simple comparisons, `charts` draws a bar chart from numbers you type in; use only figures stated in the report. The first chart also appears as a small chart on the report's card.

### Choose the featured research on the homepage

In each report's front matter, `featured: true` puts it on the homepage and `order` sets the position (1 is the large lead card). The homepage shows the first three.

### Update the biography

Edit `src/content/about.md`. The body is the biography. `approach` and `beyondWork` in the front matter are the two sections below it. The shorter paragraph on the homepage is `homeAbout` in `src/content/profile.yaml`.

### Update a role or add one

Edit `src/content/experience.yaml`. Each role has an `order` (1 comes first), dates as `YYYY-MM`, and one to four `highlights`. Leave out `end` for a current role. `showOnHome: true` with a `homeSummary` adds it to the homepage.

### Replace the CV

The CV on the site is the PDF itself. Save the new file as `public/James-Sahota-CV.pdf`, replacing the old one, and update `cv.updated` in `src/content/profile.yaml`. Nothing else restates the CV, so there is nothing to keep in step except the Experience page.

Anything in the PDF is public once the site is live, including a phone number.

### Change the accent colour

In `src/styles/global.css`, change the `--accent` values in both the light and the dark block:

- `--accent` is used for fills, bars and marks.
- `--accent-text` is the accent as small text on the page background. It must be dark enough to read (in the light theme it is a deeper shade than `--accent`).
- `--accent-on-panel` is the accent on the dark bands.
- `--on-accent` is the text colour used on top of an accent fill.

The hero illustration takes its colours from `--flow-accent` and its neighbours in `src/components/FlowPanel.astro`. The favicon (`public/favicon.svg`) and share image (`scripts/share-image.html`) use the same orange; the command to regenerate the share image is at the top of that file.

### Add a research topic

Add it to `TOPICS` in `src/site.config.ts`, then use its key in a report's `topics`. A topic appears as a filter only once a published piece uses it.

## Publishing

The site is set up for GitHub Pages at https://jamessahota.github.io.

Before the first push: on GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**. Until that is set, GitHub publishes the repository's files as they are and the workflow cannot deploy.

After that, every push to `main` runs `.github/workflows/deploy.yml`, which installs dependencies, runs `npm run verify` and publishes the result. If a check fails, the live site is left as it was.

You can also edit content files directly on github.com; saving the change triggers the same build.

To use a custom domain later: change `SITE_URL` in `astro.config.mjs`, add a `public/CNAME` file containing the domain, and configure the domain in the repository's Pages settings. The address is also printed on the share image, so update it in `scripts/share-image.html` and regenerate `public/og-default.png`.

## How unpublished work is kept off the site

- Every page, list and the sitemap read research through `src/lib/content.ts`, which drops anything that is not `visibility: public`.
- `src/content/research/example-unpublished-entry.md` is a harmless example of a private entry. `tests/site.test.mjs` fails the build if its title or address appears anywhere in the built site.
- Only files in `public/` are served. Keep drafts out of the project folder altogether.

## Design notes

- Graphite and steel grey with a flame-orange accent. Nearly square corners, hairline grids and monospaced labels. A light theme by default, with a dark theme behind the switch in the header; the choice is remembered on that device.
- Geist for text and headings, Geist Mono for labels and figures. Both are bundled with the site through `@fontsource-variable`, so no request goes to a third party.
- No analytics, cookies or tracking, so there is no cookie banner.

### The interactive pieces

All of these are additions on top of plain HTML. With JavaScript off, every page still shows all of its content and navigation.

| Piece | Where | Notes |
| --- | --- | --- |
| Flow illustration | Homepage hero, `src/components/FlowPanel.astro` | Streamlines squeezing through a chokepoint. They part around the pointer. It is an illustration, not a chart of data. It stops when off screen and has a Pause button. Visitors who ask for reduced motion get a still picture that does not respond to the pointer |
| Hover inversions | Research cards and rows | A whole card is one link and turns dark when hovered or focused |
| Scroll reveal | Elements with `data-reveal` | Only elements that start below the fold are animated, so nothing is ever left hidden |
| Chart bars | Report pages | Bars grow in when the chart scrolls into view |
| Research filter and search | `/research/` | The address updates (`?topic=gas-lng`), so a filtered view can be shared. Search ignores accents, so "el nino" finds "El Niño" |
| Reading progress | Report pages | The thin orange bar under the header |
| Live clock | Header, footer, About | Current time in Chicago |
| Copy address | Homepage contact block | Copies the email address |
| Light and dark | Header switch | |
| Page cross-fade | Between pages | In browsers that support view transitions |
