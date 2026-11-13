// Testes de lógica do Corre em Dia (rodar com: gjs run.js)
const GLib = imports.gi.GLib;
const SRC = new TextDecoder().decode(GLib.file_get_contents('app_t.js')[1]);
const RealDate = Date;

let falhas = 0, ok = 0; const achados = [];
function check(nome, cond, extra) { if (cond) ok++; else { falhas++; achados.push('FALHOU: ' + nome + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); } }
function nota(t) { achados.push('NOTA: ' + t); }

function boot(nowIso, estado) {
  const NOW = new RealDate(nowIso).getTime();
  class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(NOW); else super(...a); } static now() { return NOW; } }
  const els = {};
  const mk = id => els[id] || (els[id] = { id, innerHTML: '', textContent: '', hidden: false, value: '', classList: { toggle() {} }, dataset: {} });
  const store = {}; if (estado) store['corre-em-dia-v1'] = JSON.stringify(estado);
  const g = {
    Date: FakeDate,
    document: { getElementById: mk, querySelectorAll: () => [], addEventListener() {}, activeElement: null, body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) },
    location: { hash: '' }, addEventListener() {}, scrollTo() {},
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    setTimeout: () => 0, clearTimeout() {}, navigator: {}, window: {},
    URLSearchParams: function (o) { this.toString = () => Object.entries(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&'); },
  };
  const names = Object.keys(g);
  (new Function(...names, SRC))(...names.map(n => g[n]));
  return { T: globalThis.__T, els, store };
}
const C = (o) => Object.assign({ id: Math.random().toString(36).slice(2), tipo: 'mensal', valores: {}, fim: null, inicio: null }, o);
const dstr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// ---------- 1. Dinheiro ----------
{
  const { T } = boot('2026-11-13T10:00:00');
  const casos = [['150', 150], ['150,50', 150.5], ['1.234,56', 1234.56], ['R$ 50', 50], [' 99,9 ', 99.9], ['', NaN], ['abc', NaN], ['0', 0], ['10.5', 10.5], ['-20', -20],
    ['1.200', 1200], ['1.850', 1850], ['2.800', 2800], ['15.000', 15000], ['1.200,50', 1200.5], ['1,234.56', 1234.56], ['1.234.567', 1234567], ['0,5', 0.5], ['1,5', 1.5], ['12abc', NaN], ['1.2.3', NaN]];
  for (const [inp, esp] of casos) { const r = T.parseMoney(inp); check('parseMoney(' + JSON.stringify(inp) + ')', (isNaN(esp) && isNaN(r)) || r === esp, r); }
}

// ---------- 2. Datas de vencimento ----------
{
  const { T } = boot('2026-11-13T10:00:00', { contas: [] });
  const c31 = C({ dia: 31 });
  check('dia 31 em fevereiro/2027 vira 28', T.dueIn(c31, 2027, 1).getDate() === 28);
  check('dia 31 em fevereiro/2028 (bissexto) vira 29', T.dueIn(c31, 2028, 1).getDate() === 29);
  check('dia 31 em abril vira 30', T.dueIn(c31, 2027, 3).getDate() === 30);
  check('dia 30 em fevereiro vira 28', T.dueIn(C({ dia: 30 }), 2027, 1).getDate() === 28);
  check('bloco dia 15 = q1', T.bloco(C({ dia: 15 })) === 'q1');
  check('bloco dia 16 = q2', T.bloco(C({ dia: 16 })) === 'q2');
}

// ---------- 3. Adiantamento ----------
{
  const st = { contas: [C({ id: 'a', dia: 10, valor: 100 }), C({ id: 'b', dia: 28, valor: 100 }), C({ id: 'c', dia: 3, valor: 50 })], config: { adiantamento: 5 } };
  const { T } = boot('2026-11-13T10:00:00', st);
  check('adiant 5: dia 10 → pagar dia 5', T.planIn(T.state.contas[0], 2026, 10).getDate() === 5);
  check('adiant 5: dia 28 → pagar dia 23', T.planIn(T.state.contas[1], 2026, 10).getDate() === 23);
  check('adiant 5: dia 3 → não passa do dia 1', T.planIn(T.state.contas[2], 2026, 10).getDate() === 1);
  T.state.config.adiantamento = 50;
  check('adiant enorme: dia 28 → trava no dia 15', T.planIn(T.state.contas[1], 2026, 10).getDate() === 15);
  check('precisa() = maior distância (28-15=13)', T.precisa() === 13, T.precisa());
  // conta que vence dia 28 com meta dia 15 em fevereiro de 28 dias
  check('dia 31 em fev com adiant 50 → dia 15', T.planIn(C({ dia: 31 }), 2027, 1).getDate() === 15);
}

// ---------- 4. Semana e ocorrências ----------
{
  const st = { contas: [C({ id: 'x', dia: 1, valor: 100 }), C({ id: 'w', tipo: 'semanal', diaSemana: 1, valor: 150 })] };
  const { T } = boot('2026-12-30T10:00:00', st); // quarta, semana 28/dez a 3/jan
  const { start, end } = T.weekRange(0);
  check('semana começa na segunda 28/12', dstr(start) === '2026-12-28', dstr(start));
  check('semana termina domingo 03/01', dstr(end) === '2027-01-03', dstr(end));
  const occ = T.occurrences(start, end);
  check('virada de ano: conta do dia 1 de janeiro aparece', occ.some(o => o.c.id === 'x' && o.ym === '2027-01'), occ.map(o => o.key));
  check('semanal de segunda aparece 1x na semana', occ.filter(o => o.c.id === 'w').length === 1);
  const sem = T.weekRange(1); check('próxima semana 04/01–10/01', dstr(sem.start) === '2027-01-04');
  // domingo deve pertencer à semana que começou na segunda anterior
  const b2 = boot('2026-11-15T22:00:00', st); const w = b2.T.weekRange(0);
  check('domingo 15/11 fica na semana de 09/11', dstr(w.start) === '2026-11-09', dstr(w.start));
}

// ---------- 5. Contagem de dia da semana no mês ----------
{
  const { T } = boot('2026-11-13T10:00:00', { contas: [] });
  check('dez/2026 tem 4 segundas', T.vezesNoMes('2026-12', 1) === 4);
  check('nov/2026 tem 5 segundas', T.vezesNoMes('2026-11', 1) === 5, T.vezesNoMes('2026-11', 1));
  check('fev/2027 tem 4 domingos', T.vezesNoMes('2027-02', 0) === 4);
  check('mar/2027 tem 5 terças', T.vezesNoMes('2027-03', 2) === 5, T.vezesNoMes('2027-03', 2));
}

// ---------- 6. Valores por mês, fim e início ----------
{
  const c = C({ dia: 10, valor: 100, valores: { '2026-12': 0, '2027-01': 250 }, fim: '2027-03', inicio: '2026-12' });
  const { T } = boot('2026-11-13T10:00:00', { contas: [c] });
  const cc = T.state.contas[0];
  check('antes do início não está ativa', !T.ativa(cc, '2026-11'));
  check('valor 0 em dez some da semana', T.occurrences(new Date(2026, 11, 1), new Date(2026, 11, 31, 23)).length === 0);
  check('jan usa valor do mês (250)', T.valorEm(cc, '2027-01') === 250);
  check('fev usa padrão (100)', T.valorEm(cc, '2027-02') === 100);
  check('depois do fim não está ativa', !T.ativa(cc, '2027-04'));
  check('custo do mês jan = 250', T.custoMensalContas('2027-01') === 250);
}

// ---------- 7. Atrasadas ----------
{
  const st = { contas: [C({ id: 'a', dia: 5, valor: 100 }), C({ id: 'b', dia: 20, valor: 50 }), C({ id: 's', tipo: 'semanal', diaSemana: 1, valor: 10 })], pagos: {} };
  const { T } = boot('2026-11-13T10:00:00', st);
  const at = T.atrasadas();
  check('conta do dia 5 de nov aparece atrasada', at.some(o => o.key === 'a|2026-11'));
  check('não mostra outubro (antes de 01/11)', !at.some(o => o.ym === '2026-10'), at.map(o => o.key));
  check('conta do dia 20 ainda não está atrasada', !at.some(o => o.c.id === 'b'));
  check('semanal não pago de 09/11 entra em atrasadas', at.some(o => o.key === 's|2026-11-09'), at.map(o => o.key));
  // usuário novo em 2027: começa a usar em março, não deveria ver "atrasadas" de jan/fev
  const b = boot('2027-03-20T10:00:00', Object.assign({}, st, { config: { desde: '2027-03-20' } })); const at2 = b.T.atrasadas();
  check('usuário que começou em 20/03/2027 não vê nada antes disso', !at2.some(o => o.venc < new Date(2027, 2, 20)), at2.map(o => o.key));
  const b2 = boot('2026-12-20T10:00:00', st); const at3 = b2.T.atrasadas();
  check('semanal de mais de 4 semanas atrás não aparece', !at3.some(o => o.key === 's|2026-11-09'), at3.filter(o => o.c.id === 's').map(o => o.key));
  check('semanal de 3 semanas atrás aparece', at3.some(o => o.key === 's|2026-11-30'));
  const nv = boot('2026-11-13T10:00:00', { contas: [] }); check('usuário novo ganha "desde" = hoje', nv.T.state.config.desde === '2026-11-13', nv.T.state.config.desde);
  const ant = boot('2026-11-13T10:00:00', { contas: [C({ dia: 5, valor: 1 })] }); check('quem já tinha contas fica com desde 01/11/2026', ant.T.state.config.desde === '2026-11-01');
}

// ---------- 8. Metas ----------
{
  const m = { id: 'm', nome: 'Mudança', valor: 6000, alvo: '2027-07', guardado: 500, movs: [], criado: '2026-11-12', gastoMensal: 900 };
  const { T } = boot('2026-11-13T10:00:00', { contas: [], metas: [m] });
  const i = T.metaInfo(T.state.metas[0]);
  check('meta: falta 5500', i.falta === 5500);
  check('meta: prazo até 31/jul → 38 semanas', i.semanas === 38, i.semanas);
  check('meta: gasto novo entra a partir de jul/2027', T.custoMensalContas('2027-07') === 900 && T.custoMensalContas('2027-06') === 0);
  const b = boot('2027-08-10T10:00:00', { contas: [], metas: [m] }); const i2 = b.T.metaInfo(b.T.state.metas[0]);
  check('meta vencida marcada', i2.vencida === true);
  check('meta vencida não pede valor por semana', i2.porSemana === 0, i2.porSemana);
  const b3 = boot('2026-11-13T10:00:00', { contas: [], metas: [Object.assign({}, m, { alvo: '2026-11' })] });
  const i3 = b3.T.metaInfo(b3.T.state.metas[0]);
  check('meta com prazo no mês atual ainda NÃO venceu (vale até o fim do mês)', i3.vencida === false && i3.porSemana > 0, i3);
}

// ---------- 9. Projeção e custo de vida ----------
{
  const st = { contas: [C({ dia: 10, valor: 1000 }), C({ dia: 20, valor: 500, fim: '2027-02' }), C({ tipo: 'semanal', diaSemana: 1, valor: 100 })], config: { rendaSemanal: 1000, variaveisSemana: 0 }, reserva: { saldo: 0, movs: [] } };
  const { T } = boot('2026-11-13T10:00:00', st);
  const p = T.projecao();
  check('projeção tem 49 pontos', p.pts.length === 49);
  check('projeção nunca negativa', p.pts.every(x => x.saldo >= 0));
  check('custo de vida ignora parcela com fim', Math.round(T.custoVidaMensal()) === Math.round(1000 + T.semanalMensal('2026-11')), T.custoVidaMensal());
  if (Math.round(T.custoVidaMensal()) !== Math.round(1000 + 100 * 52 / 12)) nota('custoVidaMensal usa as semanas do MÊS ATUAL (nov tem 5 segundas): a meta da reserva muda de um mês para o outro (ex.: nov ' + Math.round(T.custoVidaMensal()) + ' vs média ' + Math.round(1000 + 100 * 52 / 12) + ')');
  const pr0 = T.projecao().pts[0];
  if (pr0.saldo === 0) nota('A projeção começa no mês atual sem descontar o que já foi pago no mês; o 1º mês somado é o próximo (aceitável, mas a sobra do mês corrente é ignorada)');
}

// ---------- 10. Status do mês e pagos de semanais ----------
{
  const st = { contas: [C({ id: 'a', dia: 10, valor: 100 }), C({ id: 's', tipo: 'semanal', diaSemana: 1, valor: 150 })], pagos: { 'a|2026-12': { em: '2026-11-13', valor: 100 }, 's|2026-12-07': { em: '2026-12-07', valor: 150 } } };
  const { T } = boot('2026-11-13T10:00:00', st);
  check('status pago em dezembro', T.statusMes(T.state.contas[0], '2026-12').pago === true);
  check('semanal pago soma 150 em dez', T.semanalPagoNoMes(T.state.contas[1], '2026-12') === 150);
  // alterar valor depois de pago: o "pago" do mês usa valor atual, não o valor registrado
  T.state.contas[0].valor = 300;
  const html = T.renderContas();
  if (/Pago<\/span><b class="num">R\$\s?300/.test(html.replace(/ /g, ' '))) nota('Totais "Pago" usam o valor ATUAL da conta, não o valor que estava quando foi pago (pagos[].valor é guardado mas ignorado)');
}

// ---------- 11. Renderização com dados estranhos ----------
{
  const st = { contas: [C({ dia: 0, valor: 50, nome: '<b>x</b>' }), C({ dia: 45, valor: 'abc' }), C({ dia: 10, valor: 100, nome: '' })], metas: [{ id: 'm', nome: 'Sem prazo', valor: 100 }], pagos: null, reserva: null, config: null };
  let erro = null; let html = '';
  try { const { T } = boot('2026-11-13T10:00:00', st); html = T.renderSemana() + T.renderContas() + T.renderReserva(); } catch (e) { erro = String(e); }
  check('renderiza com dados corrompidos sem quebrar', !erro, erro);
  check('nome com HTML é escapado', !html.includes('<b>x</b>'));
}

// ---------- 12. gcal ----------
{
  const st = { contas: [C({ id: 'a', nome: 'Itaú & Cia', dia: 31, valor: 100, fim: '2027-03' }), C({ id: 's', nome: 'Bike', tipo: 'semanal', diaSemana: 1, valor: 150 })] };
  const { T } = boot('2026-11-13T10:00:00', st);
  const u1 = decodeURIComponent(T.gcalLink(T.state.contas[0]));
  check('gcal mensal dia 31 usa BYMONTHDAY=-1', u1.includes('BYMONTHDAY=-1'), u1);
  check('gcal com UNTIL na última parcela', u1.includes('UNTIL=20270331'), u1);
  const u2 = decodeURIComponent(T.gcalLink(T.state.contas[1]));
  check('gcal semanal FREQ=WEEKLY', u2.includes('FREQ=WEEKLY'));
  check('gcal semanal começa numa segunda', /dates=20261116/.test(u2), u2.match(/dates=\d+/));
  T.state.config.adiantamento = 5; const c10 = Object.assign({}, T.state.contas[0], { dia: 20, fim: null });
  const u3 = decodeURIComponent(T.gcalLink(c10));
  check('gcal com adiantamento 5: dia 20 → lembrete dia 15', u3.includes('BYMONTHDAY=15') && /dates=20261115/.test(u3), u3.match(/BYMONTHDAY=\d+|dates=\d+/g));
}

// ---------- 13. Meta sem prazo (backup corrompido) ----------
{
  let erro = null; try { const { T } = boot('2026-11-13T10:00:00', { contas: [], metas: [{ id: 'q', nome: 'Sem prazo', valor: 10 }] }); T.renderReserva(); } catch (e) { erro = String(e); }
  check('meta sem prazo não quebra a aba Plano', !erro, erro);
}

print('\n=== RESULTADO: ' + ok + ' ok, ' + falhas + ' falhas ===');
achados.forEach(a => print(a));
