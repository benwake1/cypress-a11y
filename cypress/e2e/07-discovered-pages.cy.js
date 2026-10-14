// Scan pages the suite finds by itself, so new pages get covered without
// editing pages.json. URLs come from the sitemap or, when the site has none
// (like the Cypress demo site), from crawling links two levels from the home
// page. Resolved in cypress.config.js before the run starts.
import pages from '../fixtures/pages.json';

const known = new Set(pages.map((p) => p.path.replace(/\/$/, '') || '/'));
const discovered = (Cypress.env('DISCOVERED_URLS') || []).filter((u) => {
  const path = new URL(u).pathname.replace(/\/$/, '') || '/';
  const base = new URL(Cypress.config('baseUrl')).pathname.replace(/\/$/, '');
  return !known.has(path.slice(base.length) || '/');
});

describe('Discovered pages', () => {
  if (!discovered.length) {
    it('found no pages beyond pages.json', () => {
      cy.task('log', 'No extra pages discovered (every page is already in pages.json, or discovery was disabled/failed).');
    });
    return;
  }

  discovered.forEach((url) => {
    const path = new URL(url).pathname;
    it(`${path} has no blocking WCAG 2.2 AA violations`, () => {
      cy.visitAndSettle(url);
      cy.scanA11y(`Discovered: ${path}`);
    });
  });
});
