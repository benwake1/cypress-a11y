// Scan UI states that only exist after interaction: menus, popovers, inline
// editors and form results. Most real-world a11y bugs live here.

const LIVE = '[aria-live="polite"], [aria-live="assertive"], [role="status"], [role="alert"], [role="log"]';

describe('Interactive states', () => {
  it('"Commands" dropdown open [desktop]', () => {
    cy.visitAndSettle('/');
    cy.contains('a, button', /^\s*Commands\s*$/).click();
    cy.get('.dropdown-menu, [role="menu"]').filter(':visible').should('have.length.at.least', 1);
    cy.scanA11y('Commands dropdown open', 'nav');
  });

  it('navigation expanded [mobile]', () => {
    cy.viewport(390, 844);
    cy.visitAndSettle('/');
    cy.get('.navbar-toggle, button[aria-controls]').filter(':visible').first().click();
    cy.contains('a', /^\s*Utilities\s*$/).should('be.visible');
    cy.scanA11y('Navigation expanded [mobile]');
  });

  it('popover open on the actions page', () => {
    cy.visitAndSettle('/commands/actions');
    cy.get('.action-opacity > .btn, [data-toggle="popover"]').first().as('trigger').click({ force: true });
    cy.get('.popover, [role="tooltip"]').should('be.visible');
    // The trigger must point at the popover so screen readers can reach it.
    cy.get('@trigger').should(($t) => {
      expect($t.attr('aria-describedby') || $t.attr('aria-controls') || $t.attr('aria-expanded'), 'popover trigger is not associated with the popover').to.exist;
    });
    cy.scanA11y('Popover open');
  });

  it('double-click inline editor revealed', () => {
    cy.visitAndSettle('/commands/actions');
    cy.get('.action-div').dblclick();
    cy.get('.action-input-hidden').should('be.visible').then(($input) => {
      const el = $input[0];
      const labelled = el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title');
      expect(labelled, 'the revealed inline-edit input has no accessible name').to.be.ok;
    });
    // A double-click-only interaction has no keyboard equivalent (WCAG 2.1.1).
    cy.get('.action-div').should(($d) => {
      const operable = $d.is('button, a[href], [tabindex]') || $d.find('button, [tabindex]').length;
      expect(operable, 'double-click-to-edit has no keyboard-operable equivalent').to.be.ok;
    });
    cy.scanA11y('Inline editor revealed');
  });

  it('coupon form submission result is announced', () => {
    cy.visitAndSettle('/commands/actions');
    cy.get('.action-form').within(() => {
      cy.get('[type="text"]').type('HALFOFF');
      cy.root().submit();
    });
    cy.contains(/form has been submitted/i)
      .should('be.visible')
      .then(($msg) => {
        expect($msg.closest(LIVE).length, 'submission message is not in a live region, so screen readers are not told').to.be.greaterThan(0);
      });
    cy.scanA11y('Coupon form submitted');
  });

  it('network request result is announced', () => {
    cy.visitAndSettle('/commands/network-requests');
    cy.get('.network-btn').first().click();
    cy.get('.network-comment').should('not.be.empty').then(($c) => {
      expect($c.closest(LIVE).length, 'loaded comment is not in a live region, so screen readers are not told').to.be.greaterThan(0);
    });
    cy.scanA11y('Network comment loaded');
  });
});
