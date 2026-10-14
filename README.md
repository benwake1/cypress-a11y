# Cypress accessibility suite

A standalone, full-scope frontend accessibility suite built on Cypress, axe-core and
Lighthouse. It has no dependency on the application's codebase: give it a base URL
and it tests the live site.

The default target is the Cypress demo site, the
[Kitchen Sink](https://example.cypress.io). It was built to demonstrate Cypress
commands, not accessibility, so **expect real failures**: for example, it has no
`main` landmark and no skip link. That makes it a useful demo of what the suite
catches and how failures read in CI.

## What it covers

| Spec | What it checks |
|---|---|
| `01-page-scans` | axe-core (WCAG 2.0/2.1/2.2 A + AA, plus best practice) on all 20 demo pages, at desktop and mobile widths |
| `02-document-semantics` | `<html lang>`, page title, one `main` landmark, one `h1`, no skipped heading levels, image `alt`, link names |
| `03-keyboard` | Skip link as first Tab stop, visible focus (2.4.7), no focus on hidden elements, every form control reachable, "Commands" dropdown (Enter, arrow keys, Escape + focus return), mobile nav toggle state |
| `04-interactive-states` | Scans after interaction: dropdown open, mobile nav expanded, popover open, inline editor revealed, form submitted, network result loaded; checks results are announced via live regions |
| `05-visual-adaptation` | Reflow at 320px (1.4.10), text spacing (1.4.12), focus not obscured (2.4.11), forced colours / Windows high contrast, reduced motion |
| `06-components` | Placeholder-only labels (3.3.2), grouped checkboxes/radios, fake-disabled controls, range slider and canvas alternatives, keyboard-scrollable areas and code blocks, mouse-only click handlers |
| `07-discovered-pages` | Scans pages not in `pages.json`, found via the sitemap or a link crawl, sampled differently each day |
| `08-lighthouse` | Lighthouse accessibility, best-practices, SEO and performance scores against thresholds, desktop and mobile |
| `09-links-and-images` | Broken internal links, in-page anchors with no target, images that fail to load |

Automated checks find roughly a third to half of WCAG issues. Keep periodic manual
screen-reader and keyboard testing alongside this suite.

## Running locally

```bash
npm ci
npx cypress open                                        # interactive runner
npx cypress run --browser chrome                        # everything, headless
npx cypress run --spec cypress/e2e/01-page-scans.cy.js  # one spec
CYPRESS_BASE_URL=https://staging.example.com npx cypress run   # another target
```

The `npm run cy:run:*` scripts in `package.json` are shortcuts for the same commands.
Results land in `mochawesome-report/`, the same output SignalDeck reads.

**Browser:** run in Chrome. The keyboard, visual-adaptation and Lighthouse specs need a
Chromium browser (real key events, media emulation, remote debugging). Under another
browser those tests are skipped, not failed.

## SignalDeck CI setup

SignalDeck clones the repo, runs `npm install`, then runs
`npx cypress run --spec "<suite spec pattern>"` with its own mochawesome reporter flags,
merges `mochawesome-report/*.json`, and attaches screenshots from `cypress/screenshots`.
The repo is already laid out for that: no extra build step or config is needed.

**1. Project** (Management → Projects → New Project)

- Repository: this repo, default branch `main`
- Runner type: **Cypress**
- Project environment variables: `CYPRESS_BASE_URL=https://example.cypress.io`

**2. Test suites** (project → Test Suites tab). One suite per spec gives each its own
report and pass-rate trend:

| Suite name | Spec pattern |
|---|---|
| A11y – page scans | `cypress/e2e/01-page-scans.cy.js` |
| A11y – semantics | `cypress/e2e/02-document-semantics.cy.js` |
| A11y – keyboard | `cypress/e2e/03-keyboard.cy.js` |
| A11y – interactive states | `cypress/e2e/04-interactive-states.cy.js` |
| A11y – visual adaptation | `cypress/e2e/05-visual-adaptation.cy.js` |
| A11y – components | `cypress/e2e/06-components.cy.js` |
| A11y – discovered pages | `cypress/e2e/07-discovered-pages.cy.js` |
| Lighthouse | `cypress/e2e/08-lighthouse.cy.js` |
| Links and images | `cypress/e2e/09-links-and-images.cy.js` |

Or one suite with `cypress/e2e/**/*.cy.js`. Splitting keeps each run well inside the
default 60-minute timeout.

Set a suite's `pass_rate_threshold` for SLA alerts when accessibility regresses, and use
suite-level env vars to vary thresholds per suite.

**How failures appear in SignalDeck:** every failure message names what failed and
where. axe failures list the rule, impact, help link and up to five CSS selectors; the
custom checks list the offending elements. The SignalDeck report is enough to start a
fix without rerunning locally.

## Configuration

Set as environment variables at project or suite level (SignalDeck webhook triggers
can also override them per run through the payload's `env` field).

| Variable | Default | Purpose |
|---|---|---|
| `CYPRESS_BASE_URL` | `https://example.cypress.io` | Site under test |
| `CYPRESS_A11Y_FAIL_ON` | `serious,critical` | axe impacts that fail a test |
| `CYPRESS_A11Y_REPORT_ON` | `minor,moderate,serious,critical` | axe impacts recorded in the local report |
| `CYPRESS_A11Y_TAGS` | WCAG 2.2 AA + best-practice | axe tag set |
| `CYPRESS_A11Y_SKIP_RULES` | – | axe rule ids to disable (known/accepted issues) |
| `CYPRESS_A11Y_EXCLUDE` | – | Selectors to leave out of axe scans, e.g. third-party widgets |
| `CYPRESS_A11Y_LANG` | `^en(-[A-Z]{2})?$` | Expected `<html lang>` (regex) |
| `CYPRESS_A11Y_DISCOVER_SAMPLE` | `20` | Pages for `07-discovered-pages`; `0` disables discovery |
| `CYPRESS_A11Y_DISCOVER_SEED` | today's date | Fix the sample, e.g. to reproduce a run |
| `CYPRESS_LH_ACCESSIBILITY` | `90` | Minimum Lighthouse score |
| `CYPRESS_LH_BEST_PRACTICES` | `80` | Minimum Lighthouse score |
| `CYPRESS_LH_SEO` | `80` | Minimum Lighthouse score |
| `CYPRESS_LH_PERFORMANCE` | `50` | Minimum Lighthouse score |
| `CYPRESS_LINKS_MAX_PER_PAGE` | `60` | Cap on internal links checked per page |

Pages scanned by specs 01, 02 and 09 are listed in `cypress/fixtures/pages.json`.
To point the suite at another site, change `CYPRESS_BASE_URL` and that file. The
keyboard, interactive-states and components specs target demo-site widgets (the
"Commands" dropdown, the actions-page forms), so those need adapting per site.

**Local report:** every run also writes `reports/a11y-report.json` (all violations,
including minor ones that don't fail tests, plus Lighthouse scores) and
`reports/a11y-summary.md`. SignalDeck doesn't collect these; they're for local triage.

## Rolling it out on a real site

1. Start with `CYPRESS_A11Y_FAIL_ON=critical` so runs go green while the report shows the full backlog.
2. Fix or explicitly accept issues (`A11Y_SKIP_RULES` / `A11Y_EXCLUDE`, with a ticket reference in the env var's description).
3. Tighten to `serious,critical`, then consider `moderate`.

## Notes

- **Not yet run against the live site.** It was written from the demo site's markup and source; expect to adjust a selector or two on the first run.
- **Discovery on the demo site:** it has no sitemap, so `07` crawls links instead. All demo pages are already in `pages.json`, so on this site `07` passes with "no extra pages". It's there for sites that grow.
- **Forced colours:** the spec also saves a screenshot of each page in forced-colours mode to `cypress/screenshots` for a quick visual review.
- **Lighthouse** uses `@cypress-audit/lighthouse` with its own pinned Lighthouse version, and runs only in Chrome.
- Third-party JS errors are ignored (`uncaught:exception`); they're not accessibility failures.
- Each test retries once in run mode to absorb network flakiness on a live site.
