const list = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// Selectors for the common consent platforms. We prefer "reject"/"necessary
// only" so the scan sees the page a privacy-conscious visitor sees.
const CONSENT_BUTTONS = [
  '#onetrust-reject-all-handler',
  '#CybotCookiebotDialogBodyButtonDecline',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',
  '[data-cky-tag="reject-button"]',
  '#didomi-notice-disagree-button',
  '.cc-deny',
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
];

/**
 * Visit a page, wait for it to settle and dismiss any consent banner, so scans
 * see the page content. The demo site has no banner; this keeps the suite
 * reusable on real sites that do.
 */
Cypress.Commands.add('visitAndSettle', (path, { allowStatus } = {}) => {
  cy.visit(path, { failOnStatusCode: !allowStatus });
  cy.document().its('readyState').should('eq', 'complete');
  cy.dismissConsent();
  // Give client-side scripts a moment to finish rendering.
  cy.wait(1500);
});

Cypress.Commands.add('dismissConsent', () => {
  cy.get('body').then(($body) => {
    const hit = CONSENT_BUTTONS.find((sel) => $body.find(sel).filter(':visible').length);
    if (hit) {
      cy.get(hit).filter(':visible').first().click({ force: true });
      return;
    }
    // Fall back to an accessible-name match for unknown banners.
    const btn = $body
      .find('button:visible')
      .filter((_, el) => /^(reject( all)?|necessary only|decline|accept( all)?)( cookies)?$/i.test(el.innerText.trim()));
    if (btn.length) cy.wrap(btn.first()).click({ force: true });
  });
});

/**
 * Run axe on the current page (or a scoped context), log every violation,
 * record it for the JSON/Markdown report, and fail only on configured impacts.
 *
 * @param {string} label   Human-readable name for the report
 * @param {string|object} [context]  axe context; defaults to whole document minus A11Y_EXCLUDE
 */
Cypress.Commands.add('scanA11y', (label, context) => {
  const env = Cypress.env();
  const failOn = list(env.A11Y_FAIL_ON);
  const reportOn = list(env.A11Y_REPORT_ON);
  const skip = list(env.A11Y_SKIP_RULES);
  const exclude = list(env.A11Y_EXCLUDE).map((s) => [s]);

  const ctx = context ?? (exclude.length ? { exclude } : undefined);
  const options = {
    runOnly: { type: 'tag', values: list(env.A11Y_TAGS) },
    rules: Object.fromEntries(skip.map((id) => [id, { enabled: false }])),
    includedImpacts: reportOn,
  };

  let found = [];
  cy.injectAxe();

  // One axe pass: record everything at A11Y_REPORT_ON, never fail inside axe.
  cy.checkA11y(
    ctx,
    options,
    (violations) => {
      found = violations;
      logViolations(label, violations);
    },
    true,
  );

  // Then fail on blocking impacts with a message that names each rule and
  // selector. SignalDeck's report shows only the error text, so the default
  // "N violations detected" message isn't enough to act on.
  cy.then(() => {
    const blocking = found.filter((v) => failOn.includes(v.impact));
    if (!blocking.length) return;
    const detail = blocking
      .map((v) => {
        const targets = v.nodes.slice(0, 5).map((n) => `      - ${n.target.join(' ')}`);
        if (v.nodes.length > 5) targets.push(`      - …and ${v.nodes.length - 5} more`);
        return `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length > 1 ? 's' : ''})\n    ${v.helpUrl}\n${targets.join('\n')}`;
      })
      .join('\n');
    throw new Error(`${blocking.length} blocking a11y rule(s) on "${label}":\n${detail}`);
  });
});

function logViolations(label, violations) {
  if (!violations.length) return;
  cy.url().then((url) => {
    cy.task(
      'log',
      `\n${violations.length} a11y rule(s) violated on "${label}" (${url})`,
    );
    cy.task(
      'table',
      violations.map((v) => ({
        rule: v.id,
        impact: v.impact,
        nodes: v.nodes.length,
        help: v.help,
      })),
    );
    cy.task('recordViolations', {
      label,
      url,
      viewport: `${Cypress.config('viewportWidth')}x${Cypress.config('viewportHeight')}`,
      violations: violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: n.failureSummary })),
      })),
    });
  });
}

/** Tab once with a real keypress and return the newly focused element. */
Cypress.Commands.add('tabForward', () => {
  cy.realPress('Tab');
  return cy.focused();
});

// ---------------------------------------------------------------------------
// Helpers for the visual-adaptation and component specs
// ---------------------------------------------------------------------------

export const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"], summary';

export const describeEl = (el) => {
  const id = el.id ? `#${el.id}` : '';
  const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
  const text = (el.getAttribute('aria-label') || el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return `<${el.tagName.toLowerCase()}${id}${cls}>${text ? ` "${text}"` : ''}`;
};

export const isVisible = (el) => {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
};

/**
 * Emulate CSS media features through the Chrome DevTools Protocol, e.g.
 *   cy.emulateMedia({ 'forced-colors': 'active', 'prefers-reduced-motion': 'reduce' })
 * Chromium browsers only. Call cy.emulateMedia({}) to reset.
 */
Cypress.Commands.add('emulateMedia', (features) =>
  Cypress.automation('remote:debugger:protocol', {
    command: 'Emulation.setEmulatedMedia',
    params: { media: '', features: Object.entries(features).map(([name, value]) => ({ name, value })) },
  }),
);

/** Fail with a readable list when offenders were found. */
Cypress.Commands.add('expectNoOffenders', { prevSubject: false }, (offenders, what) => {
  const list = [...new Set(offenders)];
  if (list.length) {
    throw new Error(`${list.length} ${what}:\n${list.slice(0, 15).map((o) => `  - ${o}`).join('\n')}${list.length > 15 ? `\n  …and ${list.length - 15} more` : ''}`);
  }
});

/** Scroll top to bottom in steps so lazy-loaded content and images render. */
Cypress.Commands.add('scrollThroughPage', () => {
  cy.window().then((win) => {
    const steps = Math.min(30, Math.ceil(win.document.documentElement.scrollHeight / win.innerHeight));
    for (let i = 1; i <= steps; i++) {
      cy.scrollTo(0, i * win.innerHeight, { ensureScrollable: false });
      cy.wait(150);
    }
    cy.scrollTo('top', { ensureScrollable: false });
  });
});
