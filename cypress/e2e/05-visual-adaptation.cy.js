// WCAG 2.2 AA requirements about adapting the page, which axe doesn't test:
// reflow (1.4.10), text spacing (1.4.12), focus not obscured (2.4.11),
// forced colours / high contrast, and reduced motion (2.2.2, 2.3.3).
import pages from '../fixtures/pages.json';
import { FOCUSABLE, describeEl, isVisible } from '../support/commands';

const CHROMIUM = { browser: ['chrome', 'chromium', 'edge'] };

// The demo pages share one layout, so check a representative set: the home
// page, the form-heavy actions page, and pages with code blocks and buttons.
const REPRESENTATIVE = ['/', '/commands/actions', '/commands/querying', '/commands/network-requests', '/utilities', '/cypress-api'];
const TEMPLATES = pages.filter((p) => REPRESENTATIVE.includes(p.path));

describe('Reflow at 320 CSS px (WCAG 1.4.10)', () => {
  beforeEach(() => cy.viewport(320, 640));

  TEMPLATES.forEach((page) => {
    it(`${page.name} reflows without horizontal scrolling`, () => {
      cy.visitAndSettle(page.path, page);
      cy.window().then((win) => {
        const doc = win.document.documentElement;
        const vw = doc.clientWidth;
        // Elements that stick out past the viewport, ignoring anything inside
        // a container that is meant to scroll sideways (carousels, data tables).
        const offenders = [...win.document.body.querySelectorAll('*')]
          .filter((el) => {
            if (!isVisible(el)) return false;
            const r = el.getBoundingClientRect();
            if (r.right <= vw + 1 && r.left >= -1) return false;
            for (let p = el.parentElement; p && p !== win.document.body; p = p.parentElement) {
              const ox = getComputedStyle(p).overflowX;
              if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return false;
            }
            return true;
          })
          // Report the outermost offender only, not every descendant.
          .filter((el, _, all) => !all.some((o) => o !== el && o.contains(el)))
          .map((el) => `${describeEl(el)} spans ${Math.round(el.getBoundingClientRect().left)}–${Math.round(el.getBoundingClientRect().right)}px`);

        expect(doc.scrollWidth, `page is ${doc.scrollWidth}px wide at a ${vw}px viewport`).to.be.at.most(vw + 1);
        cy.expectNoOffenders(offenders, 'element(s) overflow the 320px viewport');
      });
    });
  });
});

describe('Text spacing (WCAG 1.4.12)', () => {
  // The WCAG 1.4.12 values, applied with !important exactly as the bookmarklet does.
  const SPACING_CSS = `
    * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
    p { margin-bottom: 2em !important; }`;

  TEMPLATES.forEach((page) => {
    it(`${page.name} keeps text readable with increased spacing`, () => {
      cy.visitAndSettle(page.path, page);
      cy.document().then((doc) => {
        const style = doc.createElement('style');
        style.textContent = SPACING_CSS;
        doc.head.appendChild(style);
      });
      cy.wait(300);
      cy.document().then((doc) => {
        // Text that is now cut off: overflow hidden/clip and content bigger than the box.
        const offenders = [...doc.querySelectorAll('a, button, label, h1, h2, h3, h4, h5, h6, p, li, span, [role="button"], [role="tab"]')]
          .filter((el) => {
            if (!isVisible(el) || !el.innerText?.trim()) return false;
            const s = getComputedStyle(el);
            const clipsX = ['hidden', 'clip'].includes(s.overflowX) && el.scrollWidth > el.clientWidth + 2;
            const clipsY = ['hidden', 'clip'].includes(s.overflowY) && el.scrollHeight > el.clientHeight + 2;
            const ellipsis = s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 2;
            return clipsX || clipsY || ellipsis;
          })
          .map(describeEl);
        cy.expectNoOffenders(offenders, 'element(s) clip their text with WCAG text spacing applied');
      });
    });
  });
});

describe('Focus not obscured (WCAG 2.4.11)', CHROMIUM, () => {
  const VIEWPORTS = [
    { name: 'desktop', w: 1366, h: 900 },
    { name: 'mobile', w: 390, h: 844 },
  ];

  VIEWPORTS.forEach((vp) => {
    ['/', '/commands/actions', '/commands/querying'].forEach((path) => {
      it(`focused elements on ${path} are never fully hidden [${vp.name}]`, () => {
        cy.viewport(vp.w, vp.h);
        cy.visitAndSettle(path);
        const obscured = [];
        cy.get('body').realClick({ position: 'topLeft' });
        Cypress._.times(50, () => {
          cy.realPress('Tab');
          cy.wait(50);
          cy.focused().then(($el) => {
            const el = $el[0];
            if (!el || el === el.ownerDocument.body) return;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return;
            const doc = el.ownerDocument;
            // Sample the centre and four inset corners. "Not obscured" (AA) only
            // requires that the element isn't *entirely* hidden.
            const pts = [
              [r.left + r.width / 2, r.top + r.height / 2],
              [r.left + 2, r.top + 2],
              [r.right - 2, r.top + 2],
              [r.left + 2, r.bottom - 2],
              [r.right - 2, r.bottom - 2],
            ];
            const visible = pts.some(([x, y]) => {
              if (y < 0 || x < 0 || y > doc.defaultView.innerHeight || x > doc.defaultView.innerWidth) return false;
              const hit = doc.elementFromPoint(x, y);
              return hit && (hit === el || el.contains(hit) || hit.contains(el));
            });
            if (!visible) {
              const pt = pts[0];
              const cover = doc.elementFromPoint(Math.max(0, pt[0]), Math.min(doc.defaultView.innerHeight - 1, Math.max(0, pt[1])));
              obscured.push(`${describeEl(el)} is hidden${cover ? ` behind ${describeEl(cover)}` : ' off-screen'}`);
            }
          });
        });
        cy.then(() => cy.expectNoOffenders(obscured, 'focused element(s) fully obscured (sticky header, banner or overlay)'));
      });
    });
  });
});

describe('Forced colours / Windows high contrast', CHROMIUM, () => {
  afterEach(() => cy.emulateMedia({}));

  ['/', '/commands/actions', '/commands/querying'].forEach((path) => {
    it(`${path} keeps focus indicators and icon controls visible`, () => {
      cy.visitAndSettle(path);
      cy.emulateMedia({ 'forced-colors': 'active' });
      cy.wait(300);
      cy.screenshot(`forced-colors${path.replace(/\W+/g, '-') || '-home'}`, { capture: 'viewport' });

      // 1. Focus must not rely on box-shadow or background alone: forced
      //    colours mode removes both, so only outlines/borders survive.
      const noFocus = [];
      cy.get('body').realClick({ position: 'topLeft' });
      Cypress._.times(25, () => {
        cy.realPress('Tab');
        cy.focused().then(($el) => {
          const s = getComputedStyle($el[0]);
          const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
          if (!outline) noFocus.push(describeEl($el[0]));
        });
      });

      // 2. Icon-only controls whose icon opts out of forced colours with a
      //    hard-coded fill, or is a CSS background image, can vanish.
      cy.document().then((doc) => {
        const iconOnly = [...doc.querySelectorAll('a[href], button, [role="button"]')].filter(
          (el) => isVisible(el) && !el.innerText.trim(),
        );
        const vanishing = iconOnly
          .filter((el) => {
            const svgs = [...el.querySelectorAll('svg')];
            const optsOut = svgs.some((svg) => getComputedStyle(svg).forcedColorAdjust === 'none');
            const bgOnly = !svgs.length && !el.querySelector('img') && getComputedStyle(el).backgroundImage !== 'none';
            return optsOut || bgOnly;
          })
          .map(describeEl);
        cy.then(() => {
          cy.expectNoOffenders(noFocus, 'element(s) lose their focus indicator in forced colours mode (box-shadow/background-only focus)');
          cy.expectNoOffenders(vanishing, 'icon-only control(s) may disappear in forced colours mode');
        });
      });
    });
  });
});

describe('Reduced motion (WCAG 2.2.2 / 2.3.3)', CHROMIUM, () => {
  afterEach(() => cy.emulateMedia({}));

  it('home page stops infinite animations and auto-advancing carousels', () => {
    cy.emulateMedia({ 'prefers-reduced-motion': 'reduce' });
    cy.visitAndSettle('/');

    // Infinite CSS/Web animations still running.
    cy.document().then((doc) => {
      const looping = doc
        .getAnimations()
        .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity)
        .map((a) => describeEl(a.effect.target || doc.body));
      cy.expectNoOffenders(looping, 'infinite animation(s) still running with prefers-reduced-motion: reduce');
    });

    // Carousels that change slide by themselves.
    const snapshot = (doc) =>
      [...doc.querySelectorAll('[aria-roledescription="carousel"], .swiper, .glide, .splide, .slick-slider, [class*="carousel"], [class*="slider"]')]
        .filter(isVisible)
        .map((c) => ({ el: c, state: c.innerHTML.length + '|' + [...c.querySelectorAll('[style*="transform"], [aria-hidden], .active, [class*="active"]')].map((n) => n.getAttribute('style') + n.getAttribute('aria-hidden') + n.className).join() }));

    let before;
    cy.document().then((doc) => (before = snapshot(doc)));
    cy.wait(9000); // longer than any typical autoplay interval
    cy.document().then((doc) => {
      const after = snapshot(doc);
      const moving = before
        .filter((b) => after.find((a) => a.el === b.el && a.state !== b.state))
        .map((b) => describeEl(b.el));
      cy.expectNoOffenders(moving, 'carousel(s) still auto-advance with prefers-reduced-motion: reduce');
    });
  });
});
