/**
 * adminMetricas.js - pestaña "Métricas" del panel del administrador.
 * Pide UN resumen a la API (GET metricas) y lo dibuja con Charts. No calcula nada del negocio:
 * los totales salen de consultas SQL (COUNT/SUM/GROUP BY) en el servidor.
 */
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const num = (n) => Number(n).toLocaleString('es-CO');
  const pesos = (n) => '$ ' + Math.round(n).toLocaleString('es-CO'); // KPIs sin centavos
  const dia = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
  let cargada = false;

  // ---------- Pestañas (traversing: closest + hermanos) ----------
  document.querySelector('.pestanas').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-panel]');
    if (!tab) return;
    [...tab.parentElement.children].forEach((t) => {
      const activa = t === tab;
      t.classList.toggle('activa', activa);
      t.setAttribute('aria-selected', String(activa));
      document.getElementById(t.dataset.panel).hidden = !activa;
    });
    if (tab.dataset.panel === 'panelMetricas' && !cargada) cargar();
  });
  $('btnActualizarMet').addEventListener('click', cargar);

  async function cargar() {
    const btn = $('btnActualizarMet');
    btn.disabled = true;
    try {
      const r = ApiClient.exigir(await ApiClient.get('metricas'));
      pintar(r.metricas);
      cargada = true;
    } catch (err) {
      if (err.status === 401) { location.href = 'auth.html?modo=login'; return; }
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  function kpi(titulo, valor, nota, clase = '') {
    return `<div class="kpi ${clase}"><small>${escapar(titulo)}</small><b>${escapar(valor)}</b><span>${escapar(nota)}</span></div>`;
  }

  function pintar(m) {
    const u = m.usuarios, d = m.dinero, o = m.operaciones, s = m.series;
    $('metGenerado').textContent = 'Actualizado ' + new Date(m.generado).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    $('kpis').innerHTML =
      kpi('Usuarios', num(u.total), `${num(u.clientes)} clientes · ${num(u.admins)} admin`) +
      kpi('Activos / bloqueados', `${num(u.activos)} / ${num(u.bloqueados)}`, `${num(u.nuevos7)} nuevos en 7 días`, u.bloqueados ? 'alerta-kpi' : '') +
      kpi('Dinero en cuentas', pesos(d.enCuentas), `Ahorros + corriente`) +
      kpi('Deuda en tarjetas', pesos(d.deudaTarjetas), `Cupo otorgado ${pesos(d.cupoOtorgado)}`) +
      kpi('Transferencias', num(o.transferencias), `Volumen ${pesos(o.volumenTransferencias)}`) +
      kpi('Movimientos', num(o.movimientos), `${num(o.movimientosHoy)} hoy`);

    $('grFlujo').innerHTML = Charts.barras(
      s.flujo.map((f) => ({ etiqueta: dia(f.fecha), valores: [f.consignaciones, f.retiros] })),
      ['Consignaciones', 'Retiros'], Charts.corto);
    $('grRegistros').innerHTML = Charts.barras(
      s.registros.map((f) => ({ etiqueta: dia(f.fecha), valores: [f.valor] })),
      ['Usuarios nuevos'], (v) => num(v), 340);
    $('grDinero').innerHTML = Charts.donut(
      [{ etiqueta: 'Ahorros', valor: d.ahorros }, { etiqueta: 'Corriente', valor: Math.max(0, d.corriente) }],
      Charts.corto, Charts.corto(d.enCuentas));
    $('grTipos').innerHTML = Charts.donut(
      s.tipos.map((t) => ({ etiqueta: t.tipo, valor: t.cantidad })), num, num(o.movimientos));
    $('grTop').innerHTML = Charts.horizontales(
      s.topClientes.map((c) => ({ etiqueta: c.nombre, valor: Math.max(0, c.saldo) })), formatoMoneda);
  }
});
