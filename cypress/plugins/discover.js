// Node-side helpers: find the site's pages (sitemap first, otherwise a small
// link crawl from the home page) and pick a sample. Runs in setupNodeEvents so
// the discovered-pages spec can generate one test per URL.

const FETCH_TIMEOUT_MS = 20000;

async function get(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'user-agent': 'a11y-suite (Cypress sitemap sampler)' },
  });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

/** Extract <loc> values from a sitemap or sitemap index. */
function parseLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
}

const isIndex = (xml) => /<sitemapindex[\s>]/i.test(xml);

/**
 * Find candidate sitemap URLs: robots.txt "Sitemap:" lines first (filtered to
 * the store path, e.g. /en-gb), then the usual Magento locations.
 */
async function discoverSitemaps(baseUrl) {
  const { origin, pathname } = new URL(baseUrl);
  const store = pathname.replace(/\/$/, '');
  const storeCode = store.replace(/^\//, '').replace('-', '_'); // en-gb -> en_gb
  const candidates = [];

  try {
    const robots = await get(`${origin}/robots.txt`);
    const listed = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
    const matching = listed.filter((u) => (store && u.includes(store)) || (storeCode && u.includes(storeCode)));
    candidates.push(...(matching.length ? matching : listed));
  } catch {
    /* no robots.txt – fall through */
  }

  candidates.push(`${origin}${store}/sitemap.xml`);
  if (storeCode) {
    // Common Magento per-store locations, e.g. /media/sitemap/en_gb/sitemap.xml
    candidates.push(`${origin}/sitemap/${storeCode}/sitemap.xml`, `${origin}/media/sitemap/${storeCode}/sitemap.xml`);
  }
  candidates.push(`${origin}/sitemap.xml`);
  return [...new Set(candidates)];
}

/** Read every page URL reachable from the first working sitemap, following one level of index. */
async function readSitemapUrls(baseUrl, log = console.log) {
  for (const candidate of await discoverSitemaps(baseUrl)) {
    try {
      const xml = await get(candidate);
      let urls = parseLocs(xml);
      if (isIndex(xml)) {
        const children = await Promise.allSettled(urls.map((u) => get(u)));
        urls = children.flatMap((c) => (c.status === 'fulfilled' ? parseLocs(c.value) : []));
      }
      if (urls.length) {
        log(`[discover] sitemap ${urls.length} URLs from ${candidate}`);
        return urls;
      }
    } catch (e) {
      log(`[discover] sitemap ${candidate}: ${e.message}`);
    }
  }
  return [];
}

/** Small deterministic PRNG so a given seed always picks the same pages. */
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick `n` URLs spread across URL "shapes" (first path segment + depth), so one
 * huge group such as products doesn't crowd out categories and content pages.
 * The seed defaults to today's date: each nightly run covers different pages,
 * but reruns on the same day are reproducible.
 */
function sampleUrls(urls, n, { baseUrl, seed } = {}) {
  const store = baseUrl ? new URL(baseUrl).pathname.replace(/\/$/, '') : '';
  const inStore = urls.filter((u) => {
    try {
      const p = new URL(u).pathname;
      return !store || p === store || p.startsWith(`${store}/`);
    } catch {
      return false;
    }
  });

  const groups = new Map();
  for (const u of new Set(inStore)) {
    const segs = new URL(u).pathname.slice(store.length).split('/').filter(Boolean);
    const key = `${segs[0] ?? '(root)'}|${segs.length}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u);
  }

  const rand = mulberry32(Number(seed ?? new Date().toISOString().slice(0, 10).replace(/-/g, '')));
  const shuffle = (a) => {
    const arr = [...a];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

  // Round-robin across groups (largest groups first) until we have n.
  const queues = shuffle([...groups.values()].map(shuffle)).sort((a, b) => b.length - a.length);
  const picked = [];
  while (picked.length < n && queues.some((q) => q.length)) {
    for (const q of queues) {
      if (q.length && picked.length < n) picked.push(q.shift());
    }
  }
  return picked;
}

const SKIP_EXT = /\.(pdf|zip|jpe?g|png|gif|svg|webp|ico|css|js|json|xml|txt|mp4|mp3|woff2?)$/i;

/** Same-origin, in-scope page links from an HTML string, without hash or query. */
function extractLinks(html, pageUrl, scopePath) {
  const out = new Set();
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"'#][^"']*)["']/gi)) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, '&'), pageUrl);
      if (!/^https?:$/.test(u.protocol) || u.origin !== new URL(pageUrl).origin) continue;
      if (!u.pathname.startsWith(scopePath) || SKIP_EXT.test(u.pathname)) continue;
      u.hash = '';
      u.search = '';
      out.add(u.toString());
    } catch {
      /* malformed href */
    }
  }
  return [...out];
}

/** Breadth-first crawl of in-scope links, used when a site has no sitemap. */
async function crawlUrls(baseUrl, { maxPages = 150, maxDepth = 2, log = console.log } = {}) {
  const scope = new URL(baseUrl).pathname.replace(/\/$/, '') || '/';
  const start = new URL(baseUrl).toString();
  const seen = new Set([start]);
  let frontier = [start];
  for (let depth = 0; depth < maxDepth && frontier.length && seen.size < maxPages; depth++) {
    const pages = await Promise.allSettled(frontier.map((u) => get(u).then((html) => ({ u, html }))));
    frontier = [];
    for (const p of pages) {
      if (p.status !== 'fulfilled') continue;
      for (const link of extractLinks(p.value.html, p.value.u, scope)) {
        if (!seen.has(link) && seen.size < maxPages) {
          seen.add(link);
          frontier.push(link);
        }
      }
    }
  }
  log(`[discover] crawled ${seen.size} URLs from ${start}`);
  return [...seen];
}

/** Sitemap if the site has one, otherwise a link crawl. */
async function discoverUrls(baseUrl, log = console.log) {
  const fromSitemap = await readSitemapUrls(baseUrl, log);
  return fromSitemap.length ? fromSitemap : crawlUrls(baseUrl, { log });
}

module.exports = { parseLocs, extractLinks, readSitemapUrls, crawlUrls, discoverUrls, sampleUrls };
