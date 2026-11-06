const assert = require('assert');
const { parseList, classify, extractDeadline } = require('./scraper');
const html = `
<h2><a href="/home/index.php/ultimas-noticias-urutai/31523-if-goiano-campus-urutai-publica-edital-com-320-vagas.html">IF Goiano – Campus Urutaí publica Edital com 320 vagas para Cursos Técnicos em 2027</a></h2>
<p>O Instituto Federal Goiano publicou o Edital nº 30, de 25 de outubro de 2026, que regulamenta o Processo Seletivo...</p>
<ul><li>Escrito por Campus Urutaí</li><li>publicado</li><li>29/10/26</li><li>13h18</li></ul>
<h2><a href="/home/index.php/ultimas-noticias-urutai/31395-edital-n-29-2026-divulgado-o-resultado-final-da-eleicao.html">Edital nº 29/2026: Divulgado o Resultado Final da eleição para o Conselho</a></h2>
<p>O Instituto torna público o Resultado Final.</p><li>05/10/26</li><li>10h43</li>`;
const items = parseList(html);
assert.equal(items.length, 2);
assert.equal(items[0].published, '2026-10-29T13:18:00-03:00');
assert.deepEqual(classify(items[0].title, items[0].summary).sort(), ['selecao']);
assert.deepEqual(classify(items[1].title, items[1].summary), []);

// caso real que estava errado: o período da mobilidade (até 30/11) não é prazo de inscrição
const colombia = `Publicado edital para o intercâmbio acadêmico na UCEVA, na Colômbia.
Vagas: 02 vagas imediatas e 02 para lista de espera.
Auxílio: R$ 10.000,00 para passagens e despesas.
Inscrições: De 11 a 16 de abril de 2026, via e-mail (extensao.urt@ifgoiano.edu.br).
O processo seletivo inclui análise documental e entrevista presencial. O período da mobilidade será de 28 de julho a 30 de novembro de 2026.`;
const r = extractDeadline(colombia, '2026-04-09T16:56:00-03:00', ['bolsa', 'selecao']);
assert.equal(r.date, '2026-04-16');

assert.equal(extractDeadline('As inscrições vão de 10/11/2026 até 05/12/2026, com resultado em 20/12/2026.', '2026-10-29T13:18:00-03:00', ['selecao']).date, '2026-12-05');
assert.equal(extractDeadline('Inscrições abertas a partir de 10/11/2026.', '2026-10-29T00:00:00-03:00', ['selecao']), null);
assert.equal(extractDeadline('Inscrições:\nde 3 a 14 de novembro de 2026\nResultado em 30 de novembro.', '2026-10-29T00:00:00-03:00', ['selecao']).date, '2026-11-14');
assert.equal(extractDeadline('Prazo para inscrição: 12/11, às 23h59.', '2026-11-01T00:00:00-03:00', ['selecao']).date, '2026-11-12');
// evento sem inscrição: usa a data do evento
assert.equal(extractDeadline('De 26 a 29 de outubro, o Campus realizará a Semana Nacional.', '2026-10-14T04:52:00-03:00', ['evento']).date, '2026-10-29');
// seleção sem prazo claro: não inventa
assert.equal(extractDeadline('O campus realizará reunião em 10 de dezembro de 2026.', '2026-10-14T00:00:00-03:00', ['selecao']), null);
assert.equal(extractDeadline('Sem datas aqui.', '2026-10-29T00:00:00-03:00', ['evento']), null);
console.log('ok');
// assuntos / ícones
const has = (t, k) => classify(t, '').includes(k);
assert(has('Aberto edital de auxílio alimentação para estudantes', 'alimentacao'));
assert(has('Refeitório do campus muda horário', 'alimentacao'));
assert(!has('Pesquisa sobre alimentação de bovinos', 'alimentacao'));
assert(has('Inscrições abertas para moradia estudantil', 'moradia'));
assert(has('Alojamento: confira a lista de contemplados para vagas', 'moradia'));
assert(has('Intercâmbio na Colômbia: IF Goiano abre seleção', 'intercambio'));
assert(has('Mobilidade internacional 2026: inscrições', 'intercambio'));
assert(has('Integra IF Goiano 2026 acontece em novembro', 'evento'));
console.log('ok topics');
// --- correções desta rodada ---
const aluno = `O IF Goiano está com inscrições abertas para o Processo Seletivo de Alunos Especiais, com ingresso no segundo semestre letivo de 2026 (2026/2).
Inscrições
As inscrições poderão ser realizadas no período de 15 a 26 de junho de 2026, até às 23h59 (horário de Brasília), exclusivamente por meio de formulário eletrônico.
RETIFICAÇÃO: CLIQUE AQUI! Publicada em 23/06/2026`;
assert.equal(extractDeadline(aluno, '2026-06-12T15:23:00-03:00', ['selecao']).date, '2026-06-26');
// "(2026/2)" sozinho nunca vira data
assert.equal(extractDeadline('Inscrições abertas para o segundo semestre letivo de 2026 (2026/2).', '2026-06-12T00:00:00-03:00', ['selecao']), null);
// linha de cronograma de resultado não é prazo de inscrição
const cron = `Resultado preliminar da homologação das inscrições e notas 09/12/2026
Período de inscrição: 03/11/2026 a 30/11/2026`;
assert.equal(extractDeadline(cron, '2026-10-29T13:18:00-03:00', ['selecao']).date, '2026-11-30');
// data absurda (muito depois da publicação) é descartada
assert.equal(extractDeadline('Inscrições até 26/02/2028.', '2026-06-12T00:00:00-03:00', ['selecao']), null);
// listas/resultados não são inscrição aberta
const { isResult } = require('./scraper');
assert(isResult('Edital nº 25/2026: Divulgada a lista preliminar de inscrições deferidas para Reingresso'));
assert.deepEqual(classify('Edital nº 25/2026: Divulgada a lista preliminar de inscrições deferidas', 'vagas ociosas'), []);
assert(classify('Resultado final do auxílio moradia', '').includes('moradia')); // bolsa/moradia continuam em destaque
console.log('ok rodada 3');
