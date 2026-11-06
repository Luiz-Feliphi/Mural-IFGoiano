'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { LIST_URL, parseList, classify, isResult, extractDeadline, articleText } = require('./scraper');

const PORT = process.env.PORT || 3000;
const REFRESH_MS = (parseInt(process.env.REFRESH_MINUTES, 10) || 20) * 60 * 1000;
const RECHECK_MS = 6 * 60 * 60 * 1000;     // reconfere prazos de notícias recentes (editais podem ser prorrogados)
const RECENT_DAYS = 150;
const PAGE_SIZE = 10;                       // tamanho de página padrão do site (?start=10, 20, ...)
const MAX_START = 2000;
const PUBLIC = path.join(__dirname, 'public');
const DB_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'news.json');

if (process.env.INSECURE_TLS === '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ---------- banco de dados (arquivo JSON) ----------
const db = { items: {}, backfill: { next: 0, done: false } };
try {
  Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
  console.log(`Banco carregado: ${Object.keys(db.items).length} notícias.`);
} catch { /* primeira execução */ }
// versão 3 do extrator de prazos: refaz os prazos já guardados com a regra corrigida
if (db.extractorVersion !== 3) {
  for (const n of Object.values(db.items)) if (n.featured) { n.checkedAt = 0; n.deadline = null; n.deadlineSrc = null; }
  db.extractorVersion = 3;
}
// reclassifica o que já está guardado (novos assuntos/ícones); o que virar destaque terá o prazo buscado
for (const n of Object.values(db.items)) {
  const c = classify(n.title, n.summary || '');
  const was = n.featured;
  n.categories = c;
  n.result = isResult(n.title);
  n.featured = c.length > 0;
  if (n.featured && !was) { n.checkedAt = 0; n.deadline = null; n.deadlineSrc = null; }
}
if (process.env.REBACKFILL === '1') db.backfill = { next: 0, done: false };

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
      fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
      fs.renameSync(DB_FILE + '.tmp', DB_FILE);
    } catch (e) { console.error('Erro ao salvar banco:', e.message); }
  }, 1500);
}

// ---------- estado público ----------
const state = { news: [], updatedAt: null, lastCheckAt: null, status: 'loading', error: null, archive: { count: 0, done: false } };
const clients = new Set();
let lastBroadcast = 0;

function rebuild(touch) {
  const now = Date.now();
  state.news = Object.values(db.items)
    .map((n) => ({ ...n, isNew: !!n.discoveredLive && now - new Date(n.discoveredLive) < 48 * 36e5 }))
    .sort((a, b) => (b.published || '').localeCompare(a.published || ''));
  state.archive = { count: state.news.length, done: !!db.backfill.done, page: Math.floor(db.backfill.next / PAGE_SIZE) };
  if (touch) state.updatedAt = new Date().toISOString();
}
function broadcast(force) {
  if (!force && Date.now() - lastBroadcast < 4000) return;
  lastBroadcast = Date.now();
  const data = `event: news\ndata: ${JSON.stringify(state)}\n\n`;
  for (const c of clients) c.write(data);
}

// ---------- rede ----------
async function get(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MuralUrutai/1.0)', 'Accept-Language': 'pt-BR,pt;q=0.9' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.text();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function merge(items, live) {
  let added = 0;
  const hadData = Object.keys(db.items).length > 0;
  for (const it of items) {
    const cats = classify(it.title, it.summary);
    const base = { ...it, summary: it.summary.slice(0, 300), categories: cats, featured: cats.length > 0, result: isResult(it.title) };
    const old = db.items[it.id];
    if (!old) {
      db.items[it.id] = { ...base, deadline: null, checkedAt: 0, discoveredLive: live && hadData ? new Date().toISOString() : null };
      added++;
    } else {
      db.items[it.id] = { ...old, ...base, deadline: old.deadline, checkedAt: old.checkedAt, discoveredLive: old.discoveredLive };
    }
  }
  return added;
}

// Busca o prazo no texto das notícias em destaque (devagar, sem sobrecarregar o site)
let dlRunning = false;
async function processDeadlines(limit) {
  if (dlRunning) return 0;
  dlRunning = true;
  let done = 0;
  try {
    const now = Date.now();
    const todo = Object.values(db.items)
      .filter((n) => {
        if (!n.featured) return false;
        if (!n.checkedAt) return true;
        const ageDays = n.published ? (now - new Date(n.published)) / 864e5 : 0;
        return ageDays < RECENT_DAYS && now - n.checkedAt > RECHECK_MS;
      })
      .sort((a, b) => (b.published || '').localeCompare(a.published || ''))
      .slice(0, limit);
    for (const n of todo) {
      try {
        const r = extractDeadline(articleText(await get(n.url)), n.published, n.categories);
        n.deadline = r ? r.date : null;
        n.deadlineSrc = r ? r.source : null;
        n.checkedAt = Date.now();
      } catch (e) {
        console.warn('Prazo não verificado:', n.id, e.message);
        n.checkedAt = Date.now() - RECHECK_MS + 15 * 60 * 1000; // tenta de novo em 15 min
      }
      done++;
      await sleep(500);
    }
    if (done) saveSoon();
  } finally { dlRunning = false; }
  return done;
}

// ---------- atualização das notícias mais recentes ----------
let running = false;
async function refresh() {
  if (running) return;
  running = true;
  try {
    let items = parseList(await get(LIST_URL + '?limit=30'));
    if (items.length < 5) items = parseList(await get(LIST_URL));
    if (!items.length) throw new Error('Nenhuma notícia encontrada — o layout do site pode ter mudado.');
    const added = merge(items, true);
    await processDeadlines(15);
    state.status = 'ok';
    state.error = null;
    state.lastCheckAt = new Date().toISOString();
    rebuild(added > 0 || !state.updatedAt);
    saveSoon();
    console.log(`[${state.lastCheckAt}] lidas ${items.length}, novas ${added}, total ${state.news.length}`);
  } catch (e) {
    state.status = Object.keys(db.items).length ? 'stale' : 'error';
    state.error = e.message;
    state.lastCheckAt = new Date().toISOString();
    rebuild(false);
    console.error('Falha ao atualizar:', e.message);
  } finally {
    running = false;
    broadcast(true);
  }
}

// ---------- arquivo: lê as páginas antigas aos poucos ----------
let backfilling = false;
async function backfill() {
  if (backfilling || db.backfill.done) return;
  backfilling = true;
  let fails = 0;
  try {
    while (!db.backfill.done) {
      const start = db.backfill.next;
      try {
        const items = parseList(await get(`${LIST_URL}?start=${start}`));
        if (!items.length || start >= MAX_START) { db.backfill.done = true; }
        else { merge(items, false); db.backfill.next = start + PAGE_SIZE; }
        fails = 0;
      } catch (e) {
        console.warn('Arquivo: falha na página', start / PAGE_SIZE + 1, e.message);
        if (++fails >= 3) break; // tenta de novo no próximo ciclo
        await sleep(5000);
        continue;
      }
      await processDeadlines(4);
      rebuild(true);
      saveSoon();
      broadcast(db.backfill.done);
      if (state.status === 'loading') state.status = 'ok';
      await sleep(1500);
    }
    if (db.backfill.done) console.log(`Arquivo completo: ${state.news.length} notícias.`);
  } finally { backfilling = false; }
}

// Recalcula prazos pendentes em lote, logo após o arquivo (ex.: depois de uma correção do extrator)
const pending = () => Object.values(db.items).filter((n) => n.featured && !n.checkedAt).length;
async function drain() {
  let guard = 0;
  while (pending() && guard++ < 200) {
    const n = await processDeadlines(10);
    if (!n) break;
    rebuild(true);
    broadcast();
    await sleep(800);
  }
  if (guard > 1) { rebuild(true); saveSoon(); broadcast(true); }
}

// ---------- servidor HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`retry: 5000\nevent: news\ndata: ${JSON.stringify(state)}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (url.pathname === '/api/news') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(state));
    }
    if (url.pathname === '/api/refresh') {
      await refresh();
      backfill();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: state.status === 'ok' }));
    }
    const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('Não encontrado');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`Mural Urutaí em http://localhost:${PORT}`);
    rebuild(false);
    state.status = state.news.length ? 'ok' : 'loading';
    refresh().then(backfill).then(drain);              // ao iniciar: recentes, depois o arquivo, depois prazos pendentes
    setInterval(() => { refresh().then(backfill).then(drain); }, REFRESH_MS);
    setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25000);
  });

process.on('SIGINT', () => { try { fs.mkdirSync(path.dirname(DB_FILE), { recursive: true }); fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch {} process.exit(0); });
