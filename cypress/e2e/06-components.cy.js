// Component-level checks for the demo site's widgets, mostly on the
// form-heavy actions page. These go beyond axe's rules: placeholder-only
// labels, grouped controls, mouse-only handlers and scrollable areas.
import { describeEl, isVisible } from '../support/commands';

const accessibleName = (el) =>
  (
    el.getAttribute('aria-label') ||
    (el.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.innerText || '')
      .join(' ') ||
    [...(el.labels || [])].map((l) => l.innerText).join(' ') ||
    el.getAttribute('title') ||
    ''
  ).trim();

describe('Form controls (actions page)', () => {
  beforeEach(() => cy.visitAndSettle('/commands/actions'));

  it('every control has a real label, not just a placeholder (WCAG 3.3.2)', () => {
    cy.document().then((doc) => {
      const offenders = [...doc.querySelectorAll('input:not([type="hidden"]), select, textarea')]
        .filter(isVisible)
        .filter((el) => !accessibleName(el))
        .map((el) => `${describeEl(el)}${el.placeholder ? ` (placeholder "${el.placeholder}" only)` : ''}`);
      cy.expectNoOffenders(offenders, 'form control(s) without a label');
    });
  });

  it('checkbox and radio groups have a group label (WCAG 1.3.1)', () => {
    cy.document().then((doc) => {
      const groups = new Map();
      doc.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((el) => {
        if (!isVisible(el)) return;
        const key = el.type === 'radio' ? `radio:${el.name}` : `checkbox:${el.closest('form, div[class*="action"]')?.className || el.name}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(el);
      });
      const offenders = [...groups.entries()]
        .filter(([, els]) => els.length > 1)
        .filter(([, els]) => {
          const g = els[0].closest('fieldset, [role="group"], [role="radiogroup"]');
          const named = g && (g.querySelector('legend')?.innerText.trim() || g.getAttribute('aria-label') || g.getAttribute('aria-labelledby'));
          return !named;
        })
        .map(([key, els]) => `${key} (${els.length} options) not in a labelled fieldset/group`);
      cy.expectNoOffenders(offenders, 'option group(s) without a group label');
    });
  });

  it('disabled controls are disabled programmatically, not just styled', () => {
    cy.document().then((doc) => {
      const offenders = [...doc.querySelectorAll('.disabled, [class*="disabled"]')]
        .filter(isVisible)
        .filter((el) => el.matches('a, button, input, select, textarea, [role="button"]'))
        .filter((el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true')
        .map(describeEl);
      cy.expectNoOffenders(offenders, 'control(s) styled as disabled but still operable/announced as enabled');
    });
  });

  it('range slider has a label and an understandable value', () => {
    cy.get('input[type="range"]').first().then(($r) => {
      const el = $r[0];
      expect(accessibleName(el), 'range input has no label').to.not.be.empty;
    });
  });

  it('canvas has a text alternative (WCAG 1.1.1)', () => {
    cy.get('canvas').each(($c) => {
      const el = $c[0];
      const alt = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.innerText.trim();
      const decorative = el.getAttribute('aria-hidden') === 'true' || el.getAttribute('role') === 'presentation';
      expect(alt || decorative, `${describeEl(el)} has no text alternative`).to.be.ok;
    });
  });

  it('scrollable areas can be scrolled with the keyboard (WCAG 2.1.1)', () => {
    cy.document().then((doc) => {
      const offenders = [...doc.querySelectorAll('body *')]
        .filter(isVisible)
        .filter((el) => {
          const s = getComputedStyle(el);
          const scrolls =
            (['auto', 'scroll'].includes(s.overflowX) && el.scrollWidth > el.clientWidth + 1) ||
            (['auto', 'scroll'].includes(s.overflowY) && el.scrollHeight > el.clientHeight + 1);
          if (!scrolls) return false;
          const focusable = el.tabIndex >= 0 || el.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
          return !focusable;
        })
        .map(describeEl);
      cy.expectNoOffenders(offenders, 'scrollable area(s) that keyboard users cannot focus to scroll');
    });
  });

  it('no mouse-only click handlers on non-interactive elements (WCAG 2.1.1)', () => {
    cy.window().then((win) => {
      const $ = win.jQuery;
      if (!$ || !$._data) return cy.task('log', 'jQuery not present; skipping handler inspection');
      const offenders = [...win.document.querySelectorAll('body *')]
        .filter(isVisible)
        .filter((el) => {
          const events = $._data(el, 'events') || {};
          const mouseOnly = ['click', 'dblclick', 'contextmenu'].some((e) => events[e]);
          const interactive = el.matches('a[href], button, input, select, textarea, summary, [tabindex], [role="button"], [role="link"]');
          return mouseOnly && !interactive;
        })
        .map((el) => `${describeEl(el)} (${Object.keys($._data(el, 'events')).join(', ')})`);
      cy.expectNoOffenders(offenders, 'element(s) only operable with a mouse');
    });
  });
});

describe('Code examples', () => {
  ['/commands/querying', '/commands/network-requests', '/utilities'].forEach((path) => {
    it(`code blocks on ${path} are keyboard-scrollable when they overflow`, () => {
      cy.visitAndSettle(path);
      cy.document().then((doc) => {
        const offenders = [...doc.querySelectorAll('pre')]
          .filter(isVisible)
          .filter((pre) => pre.scrollWidth > pre.clientWidth + 1 && pre.tabIndex < 0)
          .map(describeEl);
        cy.expectNoOffenders(offenders, 'overflowing code block(s) not focusable for keyboard scrolling');
      });
    });
  });
});

describe('Embedded content', () => {
  it('iframes on any page have titles', () => {
    cy.visitAndSettle('/');
    cy.scrollThroughPage();
    cy.document().then((doc) => {
      const untitled = [...doc.querySelectorAll('iframe')]
        .filter((f) => isVisible(f) && !f.getAttribute('title')?.trim() && f.getAttribute('aria-hidden') !== 'true')
        .map((f) => `iframe src=${(f.src || '').slice(0, 80)}`);
      cy.expectNoOffenders(untitled, 'iframe(s) without a title');
    });
  });
});
