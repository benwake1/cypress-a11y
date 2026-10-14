// Lighthouse category scores via @cypress-audit/lighthouse. Runs in Chrome
// only (it needs Chrome's remote-debugging port). Scores are also written to
// reports/a11y-summary.md so trends are easy to compare between runs.

const thresholds = () => ({
  accessibility: Number(Cypress.env('LH_ACCESSIBILITY')),
  'best-practices': Number(Cypress.env('LH_BEST_PRACTICES')),
  seo: Number(Cypress.env('LH_SEO')),
  performance: Number(Cypress.env('LH_PERFORMANCE')),
});

const PAGES = ['/', '/commands/actions', '/commands/querying', '/utilities'];

describe('Lighthouse scores', { browser: ['chrome', 'chromium'] }, () => {
  PAGES.forEach((path) => {
    ['desktop', 'mobile'].forEach((formFactor) => {
      it(`${path} meets score thresholds [${formFactor}]`, () => {
        cy.visit(path);
        cy.lighthouse(
          thresholds(),
          {
            formFactor,
            screenEmulation:
              formFactor === 'desktop'
                ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
                : { mobile: true, width: 390, height: 844, deviceScaleFactor: 3, disabled: false },
            throttlingMethod: 'provided', // don't simulate a slow network; CI networks vary enough already
          },
          { extends: 'lighthouse:default' },
        );
      });
    });
  });
});
