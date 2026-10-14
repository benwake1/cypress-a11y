const { defineConfig } = require('cypress');
const fs = require('fs');
const path = require('path');

const { lighthouse, prepareAudit } = require('@cypress-audit/lighthouse');
const { discoverUrls, sampleUrls } = require('./cypress/plugins/discover');

const REPORT_DIR = path.join(__dirname, 'reports');
const violations = [];
const lighthouseScores = [];

module.exports = defineConfig({
  // Matches the flags SignalDeck CI passes on the command line, so local runs
  // produce the same mochawesome JSON it parses. SignalDeck's CLI flags win.
  reporter: 'mochawesome',
  reporterOptions: {
    reportDir: 'mochawesome-report',
    overwrite: false,
    html: false,
    json: true,
  },
  video: false,
  screenshotOnRunFailure: true,
  // Keep Cypress's default folder: SignalDeck reads cypress/screenshots.
  screenshotsFolder: 'cypress/screenshots',
  defaultCommandTimeout: 10000,
  pageLoadTimeout: 60000,
  retries: { runMode: 1, openMode: 0 },
  viewportWidth: 1366,
  viewportHeight: 900,

  env: {
    // Override any of these from CI: CYPRESS_A11Y_FAIL_ON=critical etc.
    A11Y_FAIL_ON: 'serious,critical', // impacts that fail the build
    A11Y_REPORT_ON: 'minor,moderate,serious,critical', // impacts that get logged
    A11Y_TAGS: 'wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa,best-practice',
    A11Y_SKIP_RULES: '', // comma-separated axe rule ids to disable
    A11Y_EXCLUDE: '', // comma-separated selectors to exclude (e.g. third-party widgets)

    // 02-document-semantics: expected <html lang> (a regex, matched case-insensitively).
    A11Y_LANG: '^en(-[A-Z]{2})?$',

    // 07-discovered-pages: how many extra pages to scan, found from the sitemap
    // or, when there is none, by crawling links from the home page (0 disables).
    A11Y_DISCOVER_SAMPLE: 20,
    A11Y_DISCOVER_SEED: '', // blank = today's date, so each night covers different pages

    // 08-lighthouse: minimum category scores (0-100). Performance on a live
    // site varies run to run, so it starts lower than the others.
    LH_ACCESSIBILITY: 90,
    LH_BEST_PRACTICES: 80,
    LH_SEO: 80,
    LH_PERFORMANCE: 50,

    // 11-links: cap on internal links requested per page.
    LINKS_MAX_PER_PAGE: 60,
  },

  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'https://example.cypress.io',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    async setupNodeEvents(on, config) {
      // Lighthouse needs the browser's remote-debugging port.
      on('before:browser:launch', (browser = {}, launchOptions) => {
        if (browser.family === 'chromium' && browser.name !== 'electron') prepareAudit(launchOptions);
        return launchOptions;
      });

      // Page sample for 07-discovered-pages, resolved once per run.
      const sampleSize = Number(config.env.A11Y_DISCOVER_SAMPLE) || 0;
      config.env.DISCOVERED_URLS = [];
      if (sampleSize > 0) {
        try {
          const all = await discoverUrls(config.baseUrl);
          config.env.DISCOVERED_URLS = sampleUrls(all, sampleSize, {
            baseUrl: config.baseUrl,
            seed: config.env.A11Y_DISCOVER_SEED || undefined,
          });
        } catch (e) {
          console.log(`[discover] skipped: ${e.message}`);
        }
      }

      on('task', {
        lighthouse: lighthouse((result) => {
          const scores = Object.fromEntries(
            Object.entries(result.lhr.categories).map(([k, c]) => [k, Math.round(c.score * 100)]),
          );
          lighthouseScores.push({ url: result.lhr.finalDisplayedUrl ?? result.lhr.finalUrl, scores });
          console.log(`[lighthouse] ${JSON.stringify(scores)} ${result.lhr.finalUrl}`);
        }),
        log(message) {
          console.log(message);
          return null;
        },
        table(rows) {
          console.table(rows);
          return null;
        },
        recordViolations(entry) {
          violations.push(entry);
          return null;
        },
      });

      on('after:run', (results) => {
        fs.mkdirSync(REPORT_DIR, { recursive: true });
        const failOn = config.env.A11Y_FAIL_ON.split(',').map((s) => s.trim());
        const byRule = {};
        for (const v of violations) {
          for (const r of v.violations) {
            byRule[r.id] ??= { id: r.id, impact: r.impact, help: r.help, helpUrl: r.helpUrl, pages: 0, nodes: 0 };
            byRule[r.id].pages += 1;
            byRule[r.id].nodes += r.nodes.length;
          }
        }
        const summary = {
          baseUrl: config.baseUrl,
          generatedAt: new Date().toISOString(),
          failOn,
          totals: {
            tests: results?.totalTests ?? null,
            passed: results?.totalPassed ?? null,
            failed: results?.totalFailed ?? null,
            scans: violations.length,
            blockingNodes: violations.reduce(
              (n, v) => n + v.violations.filter((r) => failOn.includes(r.impact)).reduce((m, r) => m + r.nodes.length, 0),
              0,
            ),
          },
          rules: Object.values(byRule).sort((a, b) => b.nodes - a.nodes),
          lighthouse: lighthouseScores,
          scans: violations,
        };
        fs.writeFileSync(path.join(REPORT_DIR, 'a11y-report.json'), JSON.stringify(summary, null, 2));
        fs.writeFileSync(path.join(REPORT_DIR, 'a11y-summary.md'), toMarkdown(summary));
        console.log(`\nA11y report written to ${REPORT_DIR}`);
      });

      return config;
    },
  },
});

function toMarkdown(s) {
  const lines = [
    `# Accessibility report`,
    ``,
    `Target: ${s.baseUrl}  `,
    `Generated: ${s.generatedAt}  `,
    `Fails build on: ${s.failOn.join(', ')}`,
    ``,
    `| Tests | Passed | Failed | Scans | Blocking nodes |`,
    `|---|---|---|---|---|`,
    `| ${s.totals.tests} | ${s.totals.passed} | ${s.totals.failed} | ${s.totals.scans} | ${s.totals.blockingNodes} |`,
    ``,
    `## Rules by affected nodes`,
    ``,
    `| Rule | Impact | Pages | Nodes | Help |`,
    `|---|---|---|---|---|`,
    ...s.rules.map((r) => `| \`${r.id}\` | ${r.impact} | ${r.pages} | ${r.nodes} | [${r.help}](${r.helpUrl}) |`),
  ];
  if (s.lighthouse.length) {
    const cats = [...new Set(s.lighthouse.flatMap((l) => Object.keys(l.scores)))];
    lines.push(
      ``,
      `## Lighthouse scores`,
      ``,
      `| Page | ${cats.join(' | ')} |`,
      `|---|${cats.map(() => '---').join('|')}|`,
      ...s.lighthouse.map((l) => `| ${l.url} | ${cats.map((c) => l.scores[c] ?? '–').join(' | ')} |`),
    );
  }
  return lines.join('\n') + '\n';
}
