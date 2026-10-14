// Structural checks axe either doesn't make or only flags as best practice.
import pages from '../fixtures/pages.json';

describe('Document semantics', () => {
  pages.forEach((page) => {
    // Read-only checks: load each page once and run them all against it.
    describe(page.name, { testIsolation: false }, () => {
      before(() => cy.visitAndSettle(page.path, page));

      it('declares the expected page language', () => {
        cy.get('html').invoke('attr', 'lang').should('match', new RegExp(Cypress.env('A11Y_LANG'), 'i'));
      });

      it('has a non-empty, page-specific title', () => {
        cy.title().should('have.length.greaterThan', 5);
      });

      it('has exactly one main landmark', () => {
        cy.get('main, [role="main"]').should('have.length', 1);
      });

      it('has exactly one visible h1', () => {
        cy.get('h1').filter(':visible').should('have.length', 1);
      });

      it('does not skip heading levels', () => {
        cy.get('h1, h2, h3, h4, h5, h6').then(($h) => {
          const levels = [...$h]
            .filter((el) => el.offsetParent !== null)
            .map((el) => Number(el.tagName[1]));
          const jumps = levels
            .map((lvl, i) => (i && lvl > levels[i - 1] + 1 ? `h${levels[i - 1]} → h${lvl}` : null))
            .filter(Boolean);
          expect(jumps, `heading jumps: ${jumps.join(', ')}`).to.have.length(0);
        });
      });

      it('gives every informative image a text alternative', () => {
        cy.get('img').each(($img) => {
          const el = $img[0];
          const hidden = el.closest('[aria-hidden="true"]') || el.getAttribute('role') === 'presentation';
          if (!hidden) {
            expect(el.hasAttribute('alt'), `img missing alt: ${el.currentSrc || el.src}`).to.be.true;
          }
        });
      });

      it('gives every link an accessible name', () => {
        cy.get('a[href]:visible').each(($a) => {
          const el = $a[0];
          const name =
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            el.innerText.trim() ||
            [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join(' ').trim();
          expect(name, `link without name: ${el.outerHTML.slice(0, 120)}`).to.not.be.empty;
        });
      });
    });
  });
});
