    const STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>';
    const ICON = {
      alimentacao: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
      moradia: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
      evento: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
      intercambio: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
      bolsa: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
      selecao: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'
    };
    const CAT = { alimentacao: 'Alimentação', moradia: 'Moradia', evento: 'Evento', intercambio: 'Intercâmbio', bolsa: 'Bolsa / auxílio', selecao: 'Inscrições' };
    const ORDER = ['alimentacao', 'moradia', 'intercambio', 'evento', 'bolsa', 'selecao'];
    const ico = k => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
    let shownN = 30;
    let S = { news: [], status: 'loading', updatedAt: null, lastCheckAt: null, error: null }, filter = 'all', topic = 'all', query = '', first = true;

    const API = location.protocol === 'file:' ? 'http://localhost:3000' : '';
    const $ = s => document.querySelector(s);
    const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
    const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') };
    const dayDiff = (a, b) => Math.round((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 864e5);

    // status calculado no navegador: a borda muda de verde p/ vermelho sozinha, à meia-noite
    function statusOf(n) {
      if (!n.featured) return { k: 'plain' };
      if (n.result) return { k: 'result', txt: 'Resultado ou comunicado · não é inscrição aberta' };
      if (!n.deadline) {
        if (n.published && dayDiff(todayISO(), n.published.slice(0, 10)) > 180) return { k: 'closed', txt: 'Notícia antiga · prazo provavelmente encerrado' };
        return { k: 'unknown', txt: 'Prazo não identificado — confira na notícia' };
      }
      const d = dayDiff(n.deadline, todayISO());
      if (d < 0) return { k: 'closed', txt: 'Encerrado em ' + fmt(n.deadline) };
      if (d === 0) return { k: 'open', txt: 'Último dia: hoje (' + fmt(n.deadline) + ')' };
      if (d === 1) return { k: 'open', txt: 'Aberto até amanhã (' + fmt(n.deadline) + ')' };
      return { k: 'open', txt: 'Aberto até ' + fmt(n.deadline) + ' · faltam ' + d + ' dias' };
    }
    function ago(iso) {
      if (!iso) return '';
      const m = Math.round((Date.now() - new Date(iso)) / 6e4);
      if (m < 1) return 'agora mesmo'; if (m < 60) return 'há ' + m + ' min';
      const h = Math.round(m / 60); if (h < 24) return 'há ' + h + ' h';
      const d = Math.round(h / 24); return d === 1 ? 'ontem' : 'há ' + d + ' dias';
    }

    function render() {
      const list = S.news.map(n => ({ ...n, st: statusOf(n) }));
      const c = { all: list.length, open: 0, closed: 0, featured: 0 };
      list.forEach(n => { if (n.featured) c.featured++; if (n.st.k === 'open') c.open++; if (n.st.k === 'closed') c.closed++ });
      $('#tabs').innerHTML = [['all', 'Todas', '', c.all], ['featured', 'Destaques', '', c.featured], ['open', 'Inscrição aberta', 't-open', c.open], ['closed', 'Encerradas', 't-closed', c.closed]]
        .map(([k, l, cl, v]) => `<button class="tab ${cl}" data-f="${k}" aria-pressed="${filter === k}"><b>${v}</b><span>${l}</span></button>`).join('');

      const tc = {}; list.forEach(n => (n.categories || []).forEach(k => tc[k] = (tc[k] || 0) + 1));
      $('#topics').innerHTML = `<button class="topic" data-t="all" aria-pressed="${topic === 'all'}">Todos os assuntos</button>` +
        ORDER.map(k => `<button class="topic t-${k}" data-t="${k}" aria-pressed="${topic === k}" title="${CAT[k]}">${ico(k)}<span>${CAT[k]}</span><em>${tc[k] || 0}</em></button>`).join('');
      const q = query.trim().toLowerCase();
      const shown = list.filter(n => {
        if (filter === 'featured' && !n.featured) return false;
        if (filter === 'open' && n.st.k !== 'open') return false;
        if (filter === 'closed' && n.st.k !== 'closed') return false;
        if (topic !== 'all' && !(n.categories || []).includes(topic)) return false;
        return !q || (n.title + ' ' + n.summary).toLowerCase().includes(q);
      });

      const g = $('#grid');
      const total = shown.length, page = shown.slice(0, shownN);
      if (!S.news.length) {
        g.innerHTML = S.status === 'error'
          ? `<div class="state" style="grid-column:1/-1"><b>Não foi possível carregar as notícias.</b><br>${esc(S.error || '')}<br>Tentaremos de novo automaticamente.${location.protocol === 'file:' ? '<br><br><b>O servidor não está rodando.</b> Dê dois cliques em <code>iniciar.bat</code> (ou rode <code>node server.js</code>) e depois abra <a href="http://localhost:3000">http://localhost:3000</a>.' : ''}</div>`
          : '<div class="sk"></div><div class="sk"></div><div class="sk"></div>';
      } else if (!shown.length) {
        g.innerHTML = '<div class="state" style="grid-column:1/-1">Nenhuma notícia neste filtro.</div>';
      } else g.innerHTML = page.map(n => `
    <article class="card ${n.featured ? 'featured ' + n.st.k : ''}">
      ${n.featured ? `<span class="star" title="Destaque">${STAR}</span>` : ''}
      ${n.isNew ? '<span class="new">Nova</span>' : ''}
      <div class="meta">${n.published ? `<time datetime="${n.published}">${fmt(n.published.slice(0, 10))}</time>` : ''}
        </div>
      <div class="chips">${ORDER.filter(k => (n.categories || []).includes(k)).map(k => `<span class="chip t-${k}" title="${CAT[k]}">${ico(k)}${CAT[k]}</span>`).join('')}</div>
      <h2>${esc(n.title)}</h2>
      ${n.summary ? `<p>${esc(n.summary)}</p>` : ''}
      ${n.featured ? `<div class="pill">${esc(n.st.txt)}</div>` : ''}
      ${n.featured && n.deadlineSrc ? `<div class="src" title="Trecho da notícia de onde o prazo foi lido">Lido de: “${esc(n.deadlineSrc)}”</div>` : ''}
      <a class="go" href="${esc(n.url)}" target="_blank" rel="noopener">Ler notícia</a>
    </article>`).join('') + (total > shownN ? `<button class="more" id="more">Mostrar mais (restam ${total - shownN})</button>` : '');

      const a = S.archive || {};
      $('#archive').textContent = S.news.length ? (a.done ? 'Arquivo completo: ' + a.count + ' notícias guardadas.' : 'Lendo o arquivo do site… ' + a.count + ' notícias guardadas até agora (página ' + (a.page || 0) + ').') : '';
      const live = $('#live'); live.dataset.s = S.status;
      $('#liveTxt').textContent = {
        loading: 'Buscando notícias…',
        ok: 'Ao vivo · verificado ' + ago(S.lastCheckAt),
        stale: 'Site fora do ar · mostrando a última leitura (' + ago(S.updatedAt) + ')',
        error: 'Sem conexão com o site do IF Goiano'
      }[S.status];
    }

    function connect() {
      const es = new EventSource(API + '/events');
      es.addEventListener('news', e => {
        const d = JSON.parse(e.data);
        const fresh = d.news.filter(n => n.isNew).length;
        if (!first && fresh) toast(fresh === 1 ? 'Chegou 1 notícia nova' : 'Chegaram ' + fresh + ' notícias novas');
        first = false; S = d; render();
      });
      es.onerror = () => { S.status = S.news.length ? 'stale' : (location.protocol === 'file:' ? 'error' : 'loading'); if (!S.news.length && location.protocol === 'file:') S.error = 'Sem conexão com o servidor local.'; render() };
    }
    function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 4000) }

    $('#topics').addEventListener('click', e => { const b = e.target.closest('.topic'); if (b) { topic = b.dataset.t; shownN = 30; render() } });
    $('#tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) { filter = b.dataset.f; shownN = 30; render() } });
    $('#q').addEventListener('input', e => { query = e.target.value; shownN = 30; render() });
    $('#refresh').addEventListener('click', async e => { const b = e.currentTarget; b.setAttribute('aria-busy', 'true'); try { await fetch(API + '/api/refresh') } finally { b.removeAttribute('aria-busy') } });
    setInterval(render, 60000); // recalcula prazos e "há X min" sem recarregar
    $('#grid').addEventListener('click', e => { if (e.target.id === 'more') { shownN += 30; render() } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render() });
    render(); connect();