// Broken internal links and images. A dead link or a missing image is an
// accessibility problem as much as a functional one: the visitor can't tell
// why nothing happened. External links are skipped, to avoid rate limits and
// failures caused by other people's sites.
import pages from '../fixtures/pages.json';
import { describeEl } from '../support/commands';

// Each URL is requested once per run, however many pages link to it.
const checked = new Map();

describe('Links and images', () => {
  pages.forEach((page) => {
    describe(page.name, { testIsolation: false }, () => {
      before(() => {
        cy.visitAndSettle(page.path, page);
        cy.scrollThroughPage(); // trigger lazy-loaded images
      });

      it('internal links resolve (no 4xx/5xx)', () => {
        cy.document().then((doc) => {
          const origin = new URL(Cypress.config('baseUrl')).origin;
          const urls = [
            ...new Set(
              [...doc.querySelectorAll('a[href]')]
                .map((a) => a.href)
                .filter((h) => h.startsWith(origin))
                .map((h) => h.split('#')[0])
                .filter(Boolean),
            ),
          ].slice(0, Number(Cypress.env('LINKS_MAX_PER_PAGE')));

          urls
            .filter((url) => !checked.has(url))
            .forEach((url) => {
              cy.request({ url, failOnStatusCode: false, followRedirect: true, timeout: 30000 }).then((res) => checked.set(url, res.status));
            });
          cy.then(() => {
            const broken = urls.filter((u) => checked.get(u) >= 400).map((u) => `${checked.get(u)} ${u}`);
            cy.expectNoOffenders(broken, 'broken internal link(s)');
          });
        });
      });

      it('in-page anchor links point at existing targets', () => {
        cy.document().then((doc) => {
          const missing = [...doc.querySelectorAll('a[href^="#"]')]
            .map((a) => a.getAttribute('href'))
            .filter((h) => h.length > 1)
            .filter((h) => !doc.getElementById(decodeURIComponent(h.slice(1))) && !doc.getElementsByName(h.slice(1)).length)
            .map((h) => `${h} has no matching id`);
          cy.expectNoOffenders(missing, 'anchor link(s) to targets that do not exist');
        });
      });

      it('images load', () => {
        cy.document().then((doc) => {
          const broken = [...doc.querySelectorAll('img')]
            .filter((img) => img.loading !== 'lazy' || img.getBoundingClientRect().top < doc.documentElement.scrollHeight)
            .filter((img) => img.complete && img.currentSrc && img.naturalWidth === 0)
            .map((img) => `${describeEl(img)} ${img.currentSrc}`);
          cy.expectNoOffenders(broken, 'image(s) failed to load');
        });
      });
    });
  });
});
