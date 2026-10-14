// Full-page axe scans of every key template, at desktop and mobile widths.
import pages from '../fixtures/pages.json';

const VIEWPORTS = [
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

VIEWPORTS.forEach((vp) => {
  describe(`Page scans – ${vp.name}`, () => {
    beforeEach(() => cy.viewport(vp.width, vp.height));

    pages.forEach((page) => {
      it(`${page.name} has no blocking WCAG 2.2 AA violations`, () => {
        cy.visitAndSettle(page.path, page);
        cy.scanA11y(`${page.name} [${vp.name}]`);
      });
    });
  });
});
