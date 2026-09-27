// Minimal static server, no dependencies. node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

// the site's own files live in src/; server.js stays at the project root
const ROOT = path.join(__dirname, 'src');
const PORT = process.env.PORT || 8080;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

/* ---------------------------------------------------------
   Instagram: feed proxy.
   The token never reaches the browser and the response is cached,
   so we don't hit the API on every visit.
   --------------------------------------------------------- */
const IG_LIMIT = Number(process.env.IG_LIMIT || 9);
const IG_CACHE_MS = Number(process.env.IG_CACHE_MIN || 30) * 60 * 1000;
const IG_TOKEN_FILE = process.env.IG_TOKEN_FILE || '';

let igToken = (process.env.IG_TOKEN || '').trim();
let igCache = { fetchedAt: 0, posts: null };

// If a token file exists it wins — that's where the refreshed token is written.
if (IG_TOKEN_FILE) {
  try { igToken = fs.readFileSync(IG_TOKEN_FILE, 'utf8').trim() || igToken; } catch (e) { /* falls back to the env one */ }
}

async function igFetchPosts() {
  const now = Date.now();
  if (igCache.posts && now - igCache.fetchedAt < IG_CACHE_MS) return igCache.posts;
  if (!igToken) return null;

  const fields = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp';
  const url = `https://graph.instagram.com/me/media?fields=${fields}&limit=${IG_LIMIT}` +
              `&access_token=${encodeURIComponent(igToken)}`;

  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);

  const posts = (body.data || []).map((item) => ({
    id: item.id,
    link: item.permalink,
    // video has no usable image in media_url: use the thumbnail
    image: item.media_type === 'VIDEO' ? (item.thumbnail_url || item.media_url) : item.media_url,
    type: item.media_type,
    caption: (item.caption || '').trim(),
    date: item.timestamp
  })).filter((post) => post.image);

  igCache = { fetchedAt: now, posts };
  return posts;
}

// The long-lived token expires in 60 days; refresh it on its own.
async function igRefreshToken() {
  if (!igToken) return;
  try {
    const res = await fetch('https://graph.instagram.com/refresh_access_token' +
      `?grant_type=ig_refresh_token&access_token=${encodeURIComponent(igToken)}`);
    const body = await res.json();
    if (!res.ok || !body.access_token) throw new Error(body?.error?.message || `HTTP ${res.status}`);
    igToken = body.access_token;
    if (IG_TOKEN_FILE) fs.writeFileSync(IG_TOKEN_FILE, igToken, 'utf8');
    console.log(`[instagram] token refreshed, expires in ${Math.round((body.expires_in || 0) / 86400)} days`);
  } catch (e) {
    console.warn('[instagram] could not refresh the token:', e.message);
  }
}

if (igToken) {
  igRefreshToken();
  setInterval(igRefreshToken, 24 * 60 * 60 * 1000).unref();
} else {
  console.log('[instagram] no IG_TOKEN — the section will fall back to a link to the profile');
}

async function igRespond(res) {
  let payload;
  try {
    const posts = await igFetchPosts();
    payload = posts ? { posts } : { posts: [], reason: 'no-token' };
  } catch (e) {
    console.warn('[instagram] fetch failed:', e.message);
    // A stale cache beats an empty grid.
    payload = igCache.posts
      ? { posts: igCache.posts, reason: 'stale-cache' }
      : { posts: [], reason: 'error' };
  }
  const body = JSON.stringify(payload);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300'
  });
  res.end(body);
}

/* ---------------------------------------------------------
   Open Graph precisa de URLs absolutas (o WhatsApp não resolve
   caminho relativo). Em vez de chumbar o domínio no HTML, o
   marcador __SITE_URL__ é trocado aqui: por SITE_URL, se
   definida, senão pelo host da própria requisição.
   --------------------------------------------------------- */
const SITE_URL = (process.env.SITE_URL || '').trim().replace(/\/+$/, '');

function siteUrl(req) {
  if (SITE_URL) return SITE_URL;
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim();
  return `${proto}://${host}`;
}

http.createServer((req, res) => {
  const requestPath = decodeURIComponent(req.url.split('?')[0]);

  if (requestPath === '/api/instagram') { igRespond(res); return; }

  const target = path.join(ROOT, requestPath === '/' ? 'index.html' : requestPath);

  // no escaping the root, no serving hidden files (.env, .git, .secrets…)
  if (!target.startsWith(ROOT) || /(^|[\\/])\./.test(path.relative(ROOT, target))) {
    res.writeHead(403).end('403');
    return;
  }

  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1><p>Página não encontrada.</p>');
      return;
    }
    const ext = path.extname(target);
    const body = ext === '.html'
      ? Buffer.from(data.toString('utf8').replaceAll('__SITE_URL__', siteUrl(req)), 'utf8')
      : data;

    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.png' || ext === '.svg' ? 'public, max-age=86400' : 'no-cache'
    });
    res.end(body);
  });
}).listen(PORT, () => console.log(`Fernanda Crochê at http://localhost:${PORT}`));
