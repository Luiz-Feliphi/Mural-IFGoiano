'use strict';
// Extração e classificação das notícias do IF Goiano – Campus Urutaí (sem dependências)

const BASE = 'https://ifgoiano.edu.br';
const LIST_URL = BASE + '/home/index.php/ultimas-noticias-urutai.html';

const MONTHS = { janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const MONTH_RE = '(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)';

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', otilde: 'õ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', ordm: 'º', ordf: 'ª', ndash: '–', mdash: '—', hellip: '…', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’' };

function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n in NAMED ? NAMED[n] : m));
}

function toText(html) {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|br|tr)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Lista de notícias a partir do HTML da listagem do Joomla. */
function parseList(html) {
  const re = /<a\b[^>]*href=["']([^"']*\/ultimas-noticias-urutai\/(\d+)-[^"']*\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const hits = [];
  let m;
  while ((m = re.exec(html))) {
    const title = toText(m[3]).replace(/\s+/g, ' ');
    if (title.length < 12) continue; // ignora "Leia mais" e afins
    hits.push({ id: m[2], href: m[1], title, start: m.index, end: re.lastIndex });
  }
  const seen = new Set();
  const items = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    const next = hits.slice(i + 1).find((x) => x.id !== h.id);
    const block = toText(html.slice(h.end, Math.min(next ? next.start : h.end + 3000, h.end + 3000)));

    const dm = block.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
    const tm = block.match(/(\d{1,2})h(\d{2})/);
    let published = null;
    if (dm) {
      let y = parseInt(dm[3], 10);
      if (y < 100) y += 2000;
      published = `${iso(y, +dm[2], +dm[1])}T${tm ? pad(tm[1]) + ':' + tm[2] : '00:00'}:00-03:00`;
    }
    const summary = block
      .split(/Escrito por/i)[0]
      .replace(/\s+/g, ' ')
      .replace(/Leia mais.*$/i, '')
      .trim();
    const url = h.href.startsWith('http') ? h.href : BASE + (h.href.startsWith('/') ? '' : '/') + h.href;
    items.push({ id: h.id, title: h.title, url: decode(url), summary, published });
  }
  return items;
}

/** Notícia de resultado/lista/comunicado (não é uma inscrição aberta). */
function isResult(title) {
  return /resultado|homologa|lista (preliminar|final|de)|deferid|convoca[çc]|classificad|aprovad|\bgabarito/i.test(title);
}

/** Classifica a notícia em assuntos (cada assunto vira um ícone no card). */
function classify(title, summary) {
  const t = `${title} ${summary}`;
  const cats = [];
  if (/\bbolsas?\b|bolsista|aux[ií]lio|\bvales?\b|assist[êe]ncia estudantil|perman[êe]ncia estudantil/i.test(t)) cats.push('bolsa');
  if (/alimenta[çc][ãa]o (estudantil|escolar)|(aux[ií]lios?|vales?|bolsa)[ -]alimenta|refeit[óo]rio|restaurante (estudantil|universit)|refei[çc][õo]es|merenda/i.test(t)) cats.push('alimentacao');
  if (/moradia|alojamento|resid[êe]ncia estudantil|rep[úu]blica estudantil|aux[ií]lio[ -]moradia/i.test(t)) cats.push('moradia');
  if (/interc[âa]mbio|mobilidade (acad[êe]mica|internacional|estudantil)|estudar no exterior|internacionaliza[çc]/i.test(t)) cats.push('intercambio');
  if (/inscri[çc]|processo seletivo|\bvagas?\b|chamada p[úu]blica de sele|sele[çc][ãa]o (de|para)/i.test(t)) cats.push('selecao');
  if (/\bintegra\b(?!\s+(o|a|os|as|um|uma)\b)|semana nacional|\bsnct\b|jornada|simp[óo]sio|congresso|\bfeira\b|\bmostra\b|semin[áa]rio|\bencontro\b|palestra|\bworkshop\b|\bcol[óo]quio\b|presencial/i.test(t)) cats.push('evento');
  // resultados/homologações de eleições internas não são oportunidades
  if (cats.length && isResult(title) && !/bolsa|alimentacao|moradia|intercambio/.test(cats.join(' '))) return [];
  return cats;
}

/**
 * Procura o prazo no texto da notícia.
 * 1) Prioridade: frases sobre INSCRIÇÃO/candidatura/prazo (ignora datas de mobilidade, aulas, resultado etc.).
 * 2) Só para eventos sem inscrição: data em que o evento acontece.
 * Retorna { date: 'AAAA-MM-DD', source: 'frase usada' } ou null.
 */
const INSCR = /inscri|candidat|submiss|\bprazo|cadastr|solicita[çc]|manifesta[çc][ãa]o de interesse/i;
const EVENT = /realizar[áa]|ser[áa] realizad|ocorrer[áa]|acontece|programa[çc][ãa]o|\bde \d{1,2} a \d{1,2} de /i;
const STOP = /resultado|homolog|matr[ií]cula|recurso|divulga[çc]|entrevista|\bprova|in[ií]cio das aulas|vig[êe]ncia|mobilidade|assinatura|contrata[çc]/i;

function extractDeadline(text, publishedISO, cats = []) {
  const pub = publishedISO ? new Date(publishedISO) : new Date();
  const pubY = pub.getUTCFullYear();

  const resolve = (d, mo, y) => {
    let year = y ? (y < 100 ? y + 2000 : y) : pubY;
    if (!y && validDate(year, mo, d) && new Date(iso(year, mo, d)) < new Date(pub.getTime() - 45 * 864e5)) year += 1;
    if (year < pubY - 1 || year > pubY + 2 || !validDate(year, mo, d)) return null;
    return iso(year, mo, d);
  };

  // todas as datas de um trecho (ignorando "a partir de ..." = data de início, não de fim)
  const datesIn = (str0) => {
    // "2026/2" (semestre) e "Edital nº 25/2026" não são datas
    const str = str0.replace(/\b20\d{2}\/[12]\b/g, ' ').replace(/n[ºo°.]*\s*\d+\/\d{2,4}/gi, ' ');
    const out = [];
    const push = (m, r) => {
      if (!r) return;
      if (new Date(r) < new Date(pub.getTime() - 2 * 864e5) || new Date(r) > new Date(pub.getTime() + 300 * 864e5)) return; // longe demais da publicação = provável erro
      if (/a partir (d[eo]|do dia)\s*(dia\s*)?$/i.test(str.slice(Math.max(0, m.index - 25), m.index))) return;
      out.push(r);
    };
    let m;
    const full = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g;
    while ((m = full.exec(str))) push(m, resolve(+m[1], +m[2], +m[3]));
    const short = /(?<![\d/.,-])(\d{1,2})\/(\d{1,2})(?![\d/])/g;
    while ((m = short.exec(str))) push(m, resolve(+m[1], +m[2], 0));
    const range = new RegExp(`(\\d{1,2})\\s*(?:º)?\\s*(?:a|e|à|às|até(?: o dia)?|-|–)\\s*(\\d{1,2})\\s*(?:º)?\\s*de\\s*${MONTH_RE}(?:\\s*de\\s*(\\d{4}))?`, 'gi');
    while ((m = range.exec(str))) push(m, resolve(+m[2], MONTHS[m[3].toLowerCase()], m[4] ? +m[4] : 0));
    const single = new RegExp(`(\\d{1,2})\\s*(?:º)?\\s*de\\s*${MONTH_RE}(?:\\s*de\\s*(\\d{4}))?`, 'gi');
    while ((m = single.exec(str))) push(m, resolve(+m[1], MONTHS[m[2].toLowerCase()], m[3] ? +m[3] : 0));
    return out.sort();
  };

  const sentences = text.split(/(?<=[.!?;])\s+|\n+/).map((x) => x.trim()).filter(Boolean).slice(0, 120);

  const pick = (keyRe, cutAtStop) => {
    let best = null;
    for (let i = 0; i < sentences.length; i++) {
      const km = keyRe.exec(sentences[i]);
      if (!km) continue;
      let seg = sentences[i];
      if (cutAtStop && /resultado|homolog|recurso|divulga[çc]|convoca|lista (preliminar|final)/i.test(seg.slice(0, km.index))) continue;
      if (cutAtStop) {
        const sm = STOP.exec(seg.slice(km.index + km[0].length));
        if (sm) seg = seg.slice(0, km.index + km[0].length + sm.index);
      }
      let ds = datesIn(seg);
      if (!ds.length && seg.length < 90 && sentences[i + 1]) { // "Inscrições:" com a data na linha seguinte
        seg = seg + ' ' + sentences[i + 1];
        ds = datesIn(sentences[i + 1]);
      }
      if (ds.length) {
        const cand = { date: ds[ds.length - 1], source: seg.slice(0, 160) };
        if (!best || cand.date > best.date) best = cand;
      }
    }
    return best;
  };

  return pick(INSCR, true) || (cats.includes('evento') ? pick(EVENT, false) : null);
}

function articleText(html) {
  const a = html.indexOf('Início do conteúdo da página');
  const b = html.indexOf('Fim do conteúdo da página');
  const slice = a >= 0 && b > a ? html.slice(a, b) : html;
  return toText(slice);
}

module.exports = { BASE, LIST_URL, parseList, classify, isResult, extractDeadline, articleText, toText };
