// Serves index.html for chikutype.com/<username> with profile-specific SEO tags already in the HTML,
// so Google (and WhatsApp/Facebook previews) see the typist's name, rank-1 records and keywords.
// If anything fails, the normal index.html is served and the page still works in the browser.
const fs = require('fs'), path = require('path');
const ORIGIN = process.env.SITE_ORIGIN || 'https://chikutype.com';
const RECORD_MIN = +process.env.RECORD_MIN_TYPISTS || 3;   // a place needs at least this many ranked typists for a "No.1" record
const KEYS = ['t60', 't15', 't600'], KEYLBL = { t15: '15s', t60: '60s', t600: '10 min' };
const RESERVED = new Set(['lessons','leaderboard','blog','api','admin','profile','about','games','events','colleges','college','login','logout','register','signup','signin','settings','index','home','privacy','terms','contact','sitemap','robots','favicon','www','support','help','chikutype','chiku','cert','certificate']);
const bad = u => RESERVED.has(u) || /\.(html?|xml|txt|json|js|css|ico|png|jpe?g|svg|webp|gif|map|php|webmanifest|pdf)$/.test(u);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function template(req) {
  try { return fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8'); } catch (e) {}
  const r = await fetch('https://' + req.headers.host + '/index.html');
  return await r.text();
}
function dec(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return +v.integerValue;
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('mapValue' in v) { const o = {}, f = v.mapValue.fields || {}; for (const k in f) o[k] = dec(f[k]); return o; }
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  return null;
}
const decDoc = d => { const o = {}; for (const k in (d.fields || {})) o[k] = dec(d.fields[k]); return o; };

function fs_(cfg) {
  const base = 'https://firestore.googleapis.com/v1/projects/' + cfg.pid + '/databases/(default)/documents';
  const post = async (url, body) => {
    const r = await fetch(url + '?key=' + encodeURIComponent(cfg.key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('firestore ' + r.status);
    return r.json();
  };
  return {
    async byUsername(u) {
      const j = await post(base + ':runQuery', { structuredQuery: { from: [{ collectionId: 'scores' }], where: { fieldFilter: { field: { fieldPath: 'username' }, op: 'EQUAL', value: { stringValue: u } } }, limit: 1 } });
      const hit = j.find(x => x.document); if (!hit) return null;
      return { id: hit.document.name.split('/').pop(), d: decDoc(hit.document) };
    },
    async count(filters, key, op, val) {
      const fl = filters.map(([a, b]) => ({ fieldFilter: { field: { fieldPath: a }, op: 'EQUAL', value: { stringValue: b } } }));
      fl.push({ fieldFilter: { field: { fieldPath: 'best.' + key + '.wpm' }, op, value: { doubleValue: val } } });
      const j = await post(base + ':runAggregationQuery', { structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: 'scores' }], where: { compositeFilter: { op: 'AND', filters: fl } } }, aggregations: [{ alias: 'c', count: {} }] } });
      const x = j[0] && j[0].result && j[0].result.aggregateFields && j[0].result.aggregateFields.c;
      return x ? +(x.integerValue !== undefined ? x.integerValue : x.doubleValue || 0) : 0;
    },
    async usernames(limit) {
      const j = await post(base + ':runQuery', { structuredQuery: { from: [{ collectionId: 'scores' }], select: { fields: [{ fieldPath: 'username' }] }, where: { fieldFilter: { field: { fieldPath: 'username' }, op: 'GREATER_THAN', value: { stringValue: '' } } }, orderBy: [{ field: { fieldPath: 'username' }, direction: 'ASCENDING' }], limit } });
      return j.filter(x => x.document).map(x => decDoc(x.document).username).filter(Boolean);
    }
  };
}

async function records(F, d) {
  const best = d.best || {}, c = (d.country || '').trim(), s = (d.state || '').trim(), t = (d.district || '').trim();
  const scopes = [['global', 'World', []], ['country', c, c ? [['country', c]] : null], ['state', s, c && s ? [['country', c], ['state', s]] : null], ['district', t, c && s && t ? [['country', c], ['state', s], ['district', t]] : null]];
  const out = [], jobs = [];
  KEYS.forEach(k => { const b = best[k]; if (!b) return; scopes.forEach(([sc, place, f]) => { if (!f) return;
    jobs.push((async () => { try {
      if (await F.count(f, k, 'GREATER_THAN', b.wpm)) return;
      const total = await F.count(f, k, 'GREATER_THAN', 0);
      if (total >= RECORD_MIN) out.push({ key: k, sc, place, wpm: b.wpm, acc: b.acc });
    } catch (e) {} })()); }); });
  await Promise.all(jobs);
  const so = { global: 0, country: 1, state: 2, district: 3 }, ko = { t60: 0, t15: 1, t600: 2 };
  out.sort((a, b) => so[a.sc] - so[b.sc] || ko[a.key] - ko[b.key]);
  const m = new Map();
  out.forEach(r => { if (!m.has(r.sc)) m.set(r.sc, Object.assign({}, r, { keys: [r.key] })); else m.get(r.sc).keys.push(r.key); });
  return [...m.values()].map(r => Object.assign(r, { label: r.sc === 'global' ? 'World No.1 Typer' : 'No.1 Typer of ' + r.place, rec: (r.sc === 'global' ? 'Chiku Type Global' : r.place) + ' Typing Record' }));
}

function seo(u, d, recs) {
  const name = d.name || u, url = ORIGIN + '/' + u, b = d.best || {}, bk = b.t60 ? 't60' : b.t15 ? 't15' : b.t600 ? 't600' : '', bb = bk ? b[bk] : null;
  const loc = [d.district, d.state, d.country].filter(Boolean).join(', '), top = recs[0];
  const title = top ? `${name} - ${top.label} | ${top.rec} | Chiku Type` : `${name} (@${u}) - Typing Speed Profile | Chiku Type`;
  let desc;
  if (top) {
    const pl = recs.map(r => r.sc === 'global' ? 'the world' : r.place).join(', ').replace(/, ([^,]*)$/, ' and $1');
    desc = `${name} (@${u}) is the No.1 typer of ${pl} on Chiku Type` + (bb ? ` with ${Math.round(bb.wpm)} WPM (${KEYLBL[bk]} test)` : '') + `. See the ${top.rec}, rank and personal bests.`;
  } else desc = `${name} (@${u})${loc ? ' from ' + loc : ''}` + (bb ? ` types ${Math.round(bb.wpm)} WPM with ${Math.round(bb.acc)}% accuracy (${KEYLBL[bk]} test)` : ' on Chiku Type') + '. See typing test results, leaderboard rank and personal bests.';
  const kw = [name, u, name + ' typing speed', name + ' typing test'];
  recs.forEach(r => { const p = r.sc === 'global' ? 'world' : r.place; kw.push(p + ' ka no 1 typer', p + ' no 1 typer', p + ' typing record', p + ' top typist', p + ' typing leaderboard'); });
  const person = { '@type': 'Person', name, alternateName: '@' + u, url, knowsAbout: 'Typing' };
  if (d.country || d.state || d.district) person.address = { '@type': 'PostalAddress', addressCountry: d.country || undefined, addressRegion: d.state || undefined, addressLocality: d.district || undefined };
  if (recs.length) person.award = recs.map(r => r.label + ' (' + r.rec + ')');
  return { title, desc, url, kw: kw.join(', '), ld: { '@context': 'https://schema.org', '@type': 'ProfilePage', url, name: title, description: desc, mainEntity: person } };
}

function inject(tpl, s, noindex) {
  const home = { t: (tpl.match(/<title>([^<]*)<\/title>/) || [])[1] || '', d: (tpl.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '' };
  let h = tpl
    .replace(/<title>[^<]*<\/title>/, '<title>' + esc(s.title) + '</title>')
    .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + esc(s.desc) + '">')
    .replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + esc(s.url) + '">')
    .replace(/<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + esc(s.url) + '">')
    .replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="' + esc(s.title) + '">')
    .replace(/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="' + esc(s.desc) + '">');
  if (noindex) h = h.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="noindex,follow">');
  const extra = '<meta name="x-home-title" content="' + esc(home.t) + '"><meta name="x-home-desc" content="' + esc(home.d) + '">'
    + (s.kw ? '<meta name="keywords" content="' + esc(s.kw) + '">' : '')
    + (s.ld ? '<script type="application/ld+json" id="ldj">' + JSON.stringify(s.ld).replace(/</g, '\\u003c') + '</script>' : '');
  return h.replace('</head>', extra + '</head>');
}

module.exports = async (req, res) => {
  const raw = String((req.query && req.query.u) || ''), u = raw.toLowerCase();
  const send = (code, body, cache) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache }); res.end(body); };
  if (!/^[a-z0-9_.]{3,20}$/.test(u) || bad(u)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
  if (raw !== u) { res.writeHead(301, { Location: '/' + u }); return res.end(); }
  let tpl = '';
  try { tpl = await template(req); } catch (e) { res.writeHead(500, { 'Content-Type': 'text/plain' }); return res.end('Error'); }
  try {
    const cfg = { pid: (tpl.match(/projectId\s*:\s*"([^"]+)"/) || [])[1], key: (tpl.match(/apiKey\s*:\s*"([^"]+)"/) || [])[1] };
    if (!cfg.pid || !cfg.key) throw new Error('no firebase config');
    const F = fs_(cfg), hit = await F.byUsername(u);
    if (!hit) return send(404, inject(tpl, { title: 'Typist not found | Chiku Type', desc: 'This Chiku Type profile does not exist.', url: ORIGIN + '/' + u }, true), 'public, s-maxage=60');
    const recs = await records(F, hit.d);
    return send(200, inject(tpl, seo(u, hit.d, recs)), 'public, s-maxage=300, stale-while-revalidate=86400');
  } catch (e) {
    return send(200, tpl, 'public, s-maxage=30');
  }
};
