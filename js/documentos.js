/**
 * documentos.js - genera los documentos que el cliente puede guardar o imprimir.
 *  - CSV del extracto (se abre en Excel).
 *  - Extracto y comprobante imprimibles (el navegador permite "Guardar como PDF").
 * Todo ocurre en el navegador: no se envía nada a ningún servidor.
 */
const Documentos = {
  /** Descarga un CSV. Separador ";" y decimal con coma, que es lo que Excel en español espera. */
  csv(lista, nombreArchivo) {
    const celda = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const filas = [['Fecha', 'Producto', 'Tipo', 'Detalle', 'Entrada', 'Salida']];
    lista.forEach((m) => filas.push([
      new Date(m.fecha).toLocaleString('es-CO'), m.productoNombre, m.tipo, m.descripcion,
      m.sentido === 'entrada' ? String(m.valor).replace('.', ',') : '',
      m.sentido === 'salida' ? String(m.valor).replace('.', ',') : '',
    ]));
    // \uFEFF (BOM) hace que Excel lea bien las tildes
    const texto = '\uFEFF' + filas.map((f) => f.map(celda).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  /** Imprime un documento HTML en un iframe oculto (así no se imprime todo el panel). */
  imprimir(titulo, cuerpo) {
    const marco = document.createElement('iframe');
    marco.setAttribute('aria-hidden', 'true');
    marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(marco);
    const doc = marco.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(titulo)}</title>
      <style>${Documentos.ESTILO}</style></head><body>${cuerpo}</body></html>`);
    doc.close();
    // Se espera un instante para que el iframe pinte antes de abrir el diálogo de impresión
    setTimeout(() => {
      marco.contentWindow.focus();
      marco.contentWindow.print();
      setTimeout(() => marco.remove(), 1500);
    }, 150);
  },

  htmlExtracto(usuario, lista, resumen, descripcionFiltro) {
    const filas = lista.map((m) => `<tr><td>${escapar(new Date(m.fecha).toLocaleString('es-CO'))}</td>
      <td>${escapar(m.productoNombre)}</td><td>${escapar(m.tipo)}</td><td>${escapar(m.descripcion)}</td>
      <td class="der ${m.sentido}">${m.sentido === 'entrada' ? '+' : '−'} ${formatoMoneda(m.valor)}</td></tr>`).join('');
    return `<header><h1>Mi Plata</h1><p>Extracto de movimientos</p></header>
      <dl><dt>Cliente</dt><dd>${escapar(usuario.nombre)}</dd><dt>Usuario</dt><dd>${escapar(usuario.username)}</dd>
      <dt>Filtro</dt><dd>${escapar(descripcionFiltro)}</dd><dt>Generado</dt><dd>${escapar(new Date().toLocaleString('es-CO'))}</dd></dl>
      <div class="resumen"><div><small>Entradas</small><b class="entrada">${formatoMoneda(resumen.entradas)}</b></div>
      <div><small>Salidas</small><b class="salida">${formatoMoneda(resumen.salidas)}</b></div>
      <div><small>Neto</small><b>${formatoMoneda(resumen.neto)}</b></div>
      <div><small>Movimientos</small><b>${resumen.cantidad}</b></div></div>
      <table><thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Detalle</th><th class="der">Valor</th></tr></thead>
      <tbody>${filas || '<tr><td colspan="5">Sin movimientos para este filtro.</td></tr>'}</tbody></table>
      <footer>Documento informativo generado por Mi Plata.</footer>`;
  },

  /** Cuerpo del comprobante. Sirve para el diálogo en pantalla y para imprimir. */
  htmlComprobante(c) {
    const parte = (titulo, p) => `<div class="parte"><small>${titulo}</small><b>${escapar(p.nombre)}</b>
      <span>${escapar(p.producto)} ${escapar(p.numero)}</span></div>`;
    return `<header><h1>Mi Plata</h1><p>Comprobante de transferencia</p></header>
      <div class="estado">✔ ${escapar(c.estado)}</div>
      <div class="valor">${formatoMoneda(c.valor)}</div>
      <div class="partes">${parte('Origen', c.origen)}<span class="flecha" aria-hidden="true">→</span>${parte('Destino', c.destino)}</div>
      <dl><dt>Referencia</dt><dd><b>${escapar(c.referencia)}</b></dd>
      <dt>Fecha</dt><dd>${escapar(new Date(c.fecha).toLocaleString('es-CO'))}</dd>
      <dt>Tipo</dt><dd>${c.propia ? 'Entre mis productos' : 'A otro usuario'}</dd></dl>
      <footer>Guarda este comprobante como respaldo de tu operación.</footer>`;
  },

  ESTILO: `
    body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;max-width:760px}
    header{border-bottom:3px solid #00875a;margin-bottom:18px}
    h1{margin:0;color:#00875a;font-size:26px} header p{margin:2px 0 10px;color:#555}
    dl{display:grid;grid-template-columns:110px 1fr;gap:4px 12px;margin:14px 0} dt{color:#666} dd{margin:0}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
    th,td{padding:7px 8px;border-bottom:1px solid #ddd;text-align:left} th{background:#e8f5ef}
    .der{text-align:right} .entrada{color:#0a7a50} .salida{color:#c62828}
    .resumen{display:flex;gap:12px;flex-wrap:wrap} .resumen div{flex:1;min-width:120px;border:1px solid #ddd;border-radius:8px;padding:8px 10px}
    .resumen small,.parte small{display:block;color:#666} .resumen b{font-size:16px}
    .estado{display:inline-block;background:#e6f7ef;color:#0a7a50;font-weight:700;padding:4px 12px;border-radius:20px}
    .valor{font-size:38px;font-weight:700;margin:14px 0}
    .partes{display:flex;align-items:center;gap:14px;margin:10px 0 16px} .parte{flex:1;border:1px solid #ddd;border-radius:10px;padding:10px 12px}
    .parte b{display:block;font-size:16px} .parte span{color:#555;font-size:13px} .flecha{font-size:24px;color:#00875a}
    footer{margin-top:26px;color:#777;font-size:12px;border-top:1px dashed #bbb;padding-top:8px}
    @page{margin:14mm}`,
};
