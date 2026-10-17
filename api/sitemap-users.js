// /sitemap-users.xml: one URL per typist who has a username (rebuilt hourly by the CDN cache).
const fs = require('fs'), path = require('path');
const ORIGIN = process.env.SITE_ORIGIN || 'https://chikutype.com';
const RESERVED = new Set(['lessons','leaderboard','blog','api','admin','profile','about','games','events','colleges','college','login','logout','register','signup','signin','settings','index','home','privacy','terms','contact','sitemap','robots','favicon','www','support','help','chikutype','chiku','cert','certificate']);
const bad = u => !/^[a-z0-9_.]{3,20}$/.test(u) || RESERVED.has(u) || /\.(html?|xml|txt|json|js|css|ico|png|jpe?g|svg|webp|gif|map|php|webmanifest|pdf)$/.test(u);
module.exports = async (req, res) => {
  try {
    let tpl = ''; try { tpl = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8'); } catch (e) { tpl = await (await fetch('https://' + req.headers.host + '/index.html')).text(); }
    const pid = (tpl.match(/projectId\s*:\s*"([^"]+)"/) || [])[1], key = (tpl.match(/apiKey\s*:\s*"([^"]+)"/) || [])[1];
    const r = await fetch('https://firestore.googleapis.com/v1/projects/' + pid + '/databases/(default)/documents:runQuery?key=' + encodeURIComponent(key), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'scores' }], select: { fields: [{ fieldPath: 'username' }] }, where: { fieldFilter: { field: { fieldPath: 'username' }, op: 'GREATER_THAN', value: { stringValue: '' } } }, orderBy: [{ field: { fieldPath: 'username' }, direction: 'ASCENDING' }], limit: 10000 } }) });
    if (!r.ok) throw new Error('firestore ' + r.status);
    const names = (await r.json()).filter(x => x.document && x.document.fields && x.document.fields.username).map(x => x.document.fields.username.stringValue).filter(u => u && !bad(u));
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + names.map(u => '  <url><loc>' + ORIGIN + '/' + u + '</loc></url>').join('\n') + '\n</urlset>\n';
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }); res.end(xml);
  } catch (e) { res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end('Sitemap unavailable'); }
};
