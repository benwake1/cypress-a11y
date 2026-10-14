// Keyboard-only journeys. Uses real CDP key events (Chromium browsers only).
import { describeEl } from '../support/commands';

const CHROMIUM = { browser: ['chrome', 'chromium', 'edge', 'electron'] };

describe('Keyboard access', CHROMIUM, () => {
  beforeEach(() => cy.visitAndSettle('/commands/actions'));

  it('first Tab stop is a working skip link (WCAG 2.4.1)', () => {
    cy.get('body').realClick({ position: 'topLeft' });
    cy.tabForward().then(($el) => {
      const el = $el[0];
      const href = el.getAttribute('href') || '';
      expect(
        href.startsWith('#') && href.length > 1 && /skip|main|content/i.test(el.innerText),
        `first Tab stop is ${describeEl(el)}, not a "skip to content" link`,
      ).to.be.true;
      cy.realPress('Enter');
      cy.document().then((doc) => {
        const target = doc.getElementById(href.slice(1));
        expect(target, `skip link target ${href} does not exist`).to.exist;
      });
    });
  });

  it('shows a visible focus indicator on every interactive element (WCAG 2.4.7)', () => {
    const missing = [];
    cy.get('body').realClick({ position: 'topLeft' });
    Cypress._.times(40, () => {
      cy.tabForward().then(($el) => {
        const s = getComputedStyle($el[0]);
        const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
        const ring = s.boxShadow && s.boxShadow !== 'none';
        const underline = s.textDecorationLine.includes('underline');
        if (!(outline || ring || underline)) missing.push(describeEl($el[0]));
      });
    });
    cy.then(() => cy.expectNoOffenders(missing, 'element(s) with no visible focus style'));
  });

  it('never moves focus to hidden or zero-size elements', () => {
    const hidden = [];
    cy.get('body').realClick({ position: 'topLeft' });
    Cypress._.times(60, () => {
      cy.tabForward().then(($el) => {
        const r = $el[0].getBoundingClientRect();
        const s = getComputedStyle($el[0]);
        if (s.visibility === 'hidden' || r.width * r.height === 0) hidden.push(describeEl($el[0]));
      });
    });
    cy.then(() => cy.expectNoOffenders(hidden, 'Tab stop(s) on hidden or zero-size elements'));
  });

  it('form controls on the actions page are all reachable by Tab', () => {
    const reached = new Set();
    cy.get('body').realClick({ position: 'topLeft' });
    Cypress._.times(80, () => cy.tabForward().then(($el) => reached.add($el[0])));
    cy.get('input:visible:not([disabled]), select:visible:not([disabled]), textarea:visible:not([disabled]), button:visible:not([disabled])').then(($controls) => {
      const unreachable = [...$controls].filter((c) => !reached.has(c)).map(describeEl);
      cy.expectNoOffenders(unreachable, 'visible form control(s) not reachable with Tab in the first 80 stops');
    });
  });
});

describe('"Commands" dropdown menu', CHROMIUM, () => {
  beforeEach(() => cy.visitAndSettle('/'));

  it('opens with Enter, exposes its state and is operable with arrow keys', () => {
    cy.contains('a, button', /^\s*Commands\s*$/).as('toggle');
    cy.get('@toggle').should(($t) => {
      expect($t.attr('aria-haspopup') || $t.attr('aria-expanded'), 'dropdown toggle exposes neither aria-haspopup nor aria-expanded').to.exist;
    });
    cy.get('@toggle').focus();
    cy.realPress('Enter');
    cy.get('@toggle').should('have.attr', 'aria-expanded', 'true');
    cy.get('@toggle').parent().find('.dropdown-menu, [role="menu"]').should('be.visible');

    cy.realPress('ArrowDown');
    cy.focused().then(($f) => {
      cy.get('@toggle').parent().find('.dropdown-menu, [role="menu"]').should(($m) => {
        expect($m[0].contains($f[0]), 'ArrowDown did not move focus into the menu').to.be.true;
      });
    });
  });

  it('Escape closes the menu and returns focus to the toggle', () => {
    cy.contains('a, button', /^\s*Commands\s*$/).as('toggle').focus();
    cy.realPress('Enter');
    cy.get('@toggle').parent().find('.dropdown-menu, [role="menu"]').should('be.visible');
    cy.realPress('Escape');
    cy.get('@toggle').parent().find('.dropdown-menu, [role="menu"]').should('not.be.visible');
    cy.get('@toggle').then(($t) => cy.focused().should(($f) => expect($f[0], 'focus was not returned to the toggle').to.eq($t[0])));
  });
});

describe('Mobile navigation toggle', CHROMIUM, () => {
  beforeEach(() => {
    cy.viewport(390, 844);
    cy.visitAndSettle('/');
  });

  it('is a named button that exposes and toggles its expanded state', () => {
    cy.get('.navbar-toggle, button[aria-controls], button[data-toggle="collapse"], button[data-bs-toggle="collapse"]')
      .filter(':visible')
      .first()
      .as('toggle');
    cy.get('@toggle').should(($b) => {
      const name = ($b.attr('aria-label') || $b.text()).trim();
      expect(name, 'menu toggle has no accessible name').to.not.be.empty;
      expect($b.attr('aria-expanded'), 'menu toggle has no aria-expanded').to.exist;
    });
    cy.get('@toggle').focus();
    cy.realPress('Enter');
    cy.get('@toggle').should('have.attr', 'aria-expanded', 'true');
    cy.contains('a', /^\s*Utilities\s*$/).should('be.visible');
    cy.wait(400); // collapse animation
    cy.get('@toggle').focus();
    cy.realPress('Enter');
    cy.get('@toggle').should('have.attr', 'aria-expanded', 'false');
  });
});
