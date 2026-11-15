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
| Name, introduction, email, LinkedIn, languages, awards, athletics, and the homepage “What I’m looking for” panel (`lookingFor`) | `src/content/profile.yaml` |
| Dated views from the reports, and how they turned out | `src/content/views.yaml` (the rules are at the top of the file) |
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
   type: report                # report, commentary or company-note; use publicationStatus for in-progress work
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
   `viewChangers` lists up to four conditions the report itself says would change its view, each with `direction: weaken`, `strengthen` or `either`; take them from the published text only (see `oil-above-100-supply-shock.md`). `cardFigure` draws a figure on the homepage card in place of a chart: `kind: cash-returns` needs a `unit` and an `amount` for each of its two numbers (see `totalenergies-cash-returns.md`); `kind: clean-power` needs a `percentage` for each (see `uk-energy-security-critique.md`).
   `headerVisual` supplies a report-specific header exhibit: `bars` for comparable quantities (including signed changes), `ranges` for explicitly conditional scenarios, or `sequence` for a dated mechanism or timeline. Include the period and qualifications in `note`, and identify the report figures in `source`; the caption links to `originalUrl`. Use `domain: { min: 0, max: 100 }` for percentage bars. Reports without an existing chart or route/refinery schematic need this field; there is no generic decorative fallback. See `cuba-energy-collapse.md`, `us-crude-inventories.md` and `uae-leaves-opec.md`.
5. Run `npm run verify`. If a field is missing or a link is malformed, the message names the file and the field.

Rules the build enforces: published work needs a `date` and either an `originalUrl` or a `pdf`; links must start with `https://`; a `pdf`, `figures` image or `cover` must exist in `public/`; table rows must match their columns; values in `charts` cannot be negative. Signed comparisons use `headerVisual`, with a scale that includes zero.

**Dates and order.** The list is newest first. A date without a day (`2026-05`) counts as the end of that month, so it is listed above a piece dated the 1st. Give the full date whenever you can verify it.

**Work in progress.** Set `publicationStatus: in-progress`. The piece is listed in the "In progress" panel on the research page and gets no page of its own, so no date or findings are needed. When it is published, change the status, add the `date` and `originalUrl`, and it moves into the main list.

**A PDF of a report.** Put the approved file in `public/research/`, with no spaces in its name, and add `pdf: /research/the-file.pdf`. An "Open the PDF" button appears.

**A chart or figure from a report.** Put the image in `public/research/` and add it under `figures` with `src`, `alt`, `width`, `height`, `caption` and `credit`. For simple comparisons, `charts` draws a bar chart from numbers you type in; use only figures stated in the report. For futures prices, add `kind: futures-curve` to the chart and a `period` (the contract month, as `2027-03`) to each item: the prices are then drawn as a curve, spaced by the real gap between contracts, as in `oil-above-100-supply-shock.md`. The first chart also appears on the report's card.

### Choose the featured research on the homepage

In each report's front matter, `featured: true` puts it on the homepage and `order` sets the position. The homepage shows the first four, two by two: 1 and 2 on the top row, 3 and 4 beneath them.

### Record how a view turned out

Dated views from the reports live in `src/content/views.yaml`, one entry per view, with the rules at the top of the file. A view shows as open until its `due` date. Once that date has passed, add:

```yaml
  outcome:
    value: 104.72
    date: 2026-10-09        # the date of the price used
    source: NYMEX Brent futures (BZ=F), front month, closing price, via Yahoo Finance
```

While a view is open, the page also shows the latest price of its instrument when the entry has a `track` that names a price in `src/data/latest-prices.json`. Those prices are not live. The deployment (`.github/workflows/deploy.yml`) refreshes them every weekday at 22:30 UTC, after US markets close, and on every push: it fetches the newest close for each price that has a free source (Brent and JKM futures from Yahoo Finance, New York Harbor diesel from FRED) and builds the site with them. Nothing is committed, so the copy in the repository can be older than the one on the site; `npm run prices` updates it locally. If a source cannot be reached, the last committed price is used and the site still deploys. GitHub pauses scheduled runs in a repository with no commits for 60 days; a manual run from the Actions tab, or any push, starts them again. A price with no free source, such as the Baltic freight rates, can be added to that file by hand without a `fetch` entry, and the script will leave it alone.

Use the price of the instrument the view names. The page works out whether the outcome was inside the range, so never type a verdict, and keep every view, including those that miss. A new view needs its `report` (the file name of the report), `source` (`report` or `call`), `view`, `formed`, `due`, `range` (a `low`, a `high` or both, with a `unit`), `basis` (`endpoint` or `average`) and `instrument`. The build stops if `report` names a report that does not exist.

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

- Graphite and warm ivory with a flame-orange accent. Nearly square corners, hairline grids and monospaced labels. A light theme by default, with a dark theme behind the switch in the header; the choice is remembered on that device.
- Anton for display headlines, Geist for reading text and Geist Mono for labels and figures. All fonts are bundled locally through Fontsource, so font requests stay on the site.
- No analytics, cookies or tracking, so there is no cookie banner.

### The interactive pieces

All of these are additions on top of plain HTML. With JavaScript off, every page still shows all of its content and navigation.

| Piece | Where | Notes |
| --- | --- | --- |
| Flow illustration | Homepage hero, `src/components/FlowPanel.astro` | Streamlines squeezing through a chokepoint, drawn on a canvas. They part around the pointer, or around a finger on a touch screen. It is an illustration, not a chart of data. It stops when off screen. Visitors who ask for reduced motion get a still picture that does not respond to the pointer |
| Hover inversions | Research cards and rows | A whole card is one link. When hovered or focused it turns dark, an orange line loads across its top edge and its arrow turns upwards. On touch screens the card crossing the middle of the screen does the same |
| Scroll reveal | Elements with `data-reveal` | Only elements that start below the fold are animated, so nothing is ever left hidden |
| Charts | Report pages | Bars grow in when a chart scrolls into view. A chart marked `kind: futures-curve` is drawn as a line from left to right, with each marker switching on as the line reaches it (`src/components/CurveChart.astro`) |
| Research filter and search | `/research/` | Rows that stay slide to their new places, rows that go fade out, the selected block glides between topics and the count rolls. Each topic shows how many pieces it holds. The address updates (`?topic=gas-lng`), so a filtered view can be shared. Search ignores accents, so "el nino" finds "El Niño" |
| Reading progress | Report pages | The thin orange bar under the header |
| Live clock | Header, footer, About | Current time in Chicago |
| Copy address | Homepage contact block | Copies the email address |
| Light and dark | Header switch | One ruled edge crosses the page, with the new theme behind it |
| Pause animations | The pause icon in the header, beside the theme switch, on every page; and the Pause button in the hero | One setting with two buttons: it stills decorative CSS motion and the hero on every page, and the choice is remembered. The header icon is hidden for visitors who ask for reduced motion, for whom nothing moves anyway |
| Research exhibits | `src/components/ResearchCard.astro` (cards) and `src/components/ResearchVisual.astro` (report headers) | A card shows its report’s `cardFigure`, its first chart, or two key numbers above a route illustration. The title and exhibit of the piece being opened travel to its page |
| Project workflow | `src/components/ProjectFlow.astro` | Four stages from the documented research workflow |
| Page changes | Between pages | Pages change with a direction: sideways between sections, down into a report and up on the way back. The orange underline in the header slides to the new section, and the title and plate of the piece being opened travel to its page. The rules are in `src/styles/motion.css`; the direction is set by the script in the head of `src/layouts/BaseLayout.astro` |
| Publication record | `/research/`, `src/components/ResearchTape.astro` | One square per piece, stacked by month, built from the dates in the content files. Pointing at a square names the piece and marks its row; filtering empties the squares outside the topic |
| Key numbers | Report pages and the homepage project | Each figure rises into place whole, with an orange tick. Figures never count up, because a count would pass through values that were never true |
| Range bars | Tables on report pages, `src/components/DataTable.astro` | A column made only of ranges ("US$95–115") or percentages draws a thin bar under each figure, on one scale from zero. A row whose first cell says "base case" is drawn solid. Pointing at a cell tints its row and column |
| Findings rail | Report pages | A line beside the key findings fills as they are read. It needs a browser with scroll-driven animations; elsewhere the list is unchanged |
| Up next | End of each report | A dark band that lifts open on the next piece (the one published before it) |
| Views and outcomes | `/research/` and report pages, `src/components/ViewsRecord.astro` | Each dated view drawn as its range on a scale, with a dot where the market finished once it falls due, and a hollow marker at the latest price while it is open. On `/research/` the record can be filtered to the views inside their range, those that missed, or those still open |
| What would change the view | Report pages, `src/components/ViewChangers.astro` | The conditions a report set out in advance, grouped by whether they would count against its view or for it |
| Selected research on a phone | Homepage | The four cards sit in one row that is swiped sideways, with a count of the card in view |
| Sideways rows on a phone | Topic chips, and the section links on the Experience, About, project and report pages | One row that scrolls sideways instead of wrapping into a tall stack (`.side-scroll` in `global.css`) |
| Continuous decoration | Everywhere | A decoration marked `data-loop` runs while its card or panel is on screen. The pause switch in the header stops it |
