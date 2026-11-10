/**
 * charts.js - gráficas SVG hechas a mano (sin librerías).
 * Cada función recibe datos y devuelve un string con el <svg>. Los colores viven en el CSS
 * (clases .c1 .c2 ...) para que cambien solos con el tema claro/oscuro.
 *
 * Idea clave: una gráfica es solo una regla de tres.
 *   altura de la barra = (valor / máximo) * alto disponible
 */
const Charts = {
  /** Abrevia dinero para los ejes: 1.250.000 -> "$1,3 M" */
  corto(n) {
    const a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(1).replace('.', ',') + ' MM';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1).replace('.', ',') + ' M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + ' mil';
    return '$' + Math.round(n);
  },

  vacio(texto) { return `<p class="vacio">${escapar(texto)}</p>`; },

  /**
   * Barras verticales agrupadas.
   * dias = [{ etiqueta, valores: [a, b] }], formato(valor) -> texto del tooltip y eje.
   */
  barras(dias, leyendas, formato, W = 640) {
    // H, base y alto se calculan desde W: la gráfica se ve proporcionada en tarjetas anchas o angostas
    const H = Math.round(W * 0.375), base = H - 40, alto = H - 80, mx = 12;
    const max = Math.max(...dias.flatMap((d) => d.valores), 0);
    if (!max) return Charts.vacio('Aún no hay datos en este periodo.');
    const n = dias.length, k = dias[0].valores.length;
    const ancho = (W - mx * 2) / n, bw = Math.min(16, (ancho * 0.8) / k);
    const barras = dias.map((d, i) => {
      const x0 = mx + i * ancho + (ancho - bw * k) / 2;
      const rects = d.valores.map((v, j) => {
        const h = (v / max) * alto;
        return `<rect class="c${j + 1}" x="${(x0 + j * bw).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${v > 0 ? Math.max(h, 2).toFixed(1) : 0}" rx="3"><title>${escapar(d.etiqueta)} · ${escapar(leyendas[j])}: ${escapar(formato(v))}</title></rect>`;
      }).join('');
      // Se rotulan solo algunos días para que el eje no se amontone
      const rotulo = i % 2 === n % 2 || n <= 7 ? `<text class="eje" x="${(mx + i * ancho + ancho / 2).toFixed(1)}" y="${base + 18}" text-anchor="middle">${escapar(d.etiqueta)}</text>` : '';
      return rects + rotulo;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapar(leyendas.join(' vs '))}">
      <line class="linea" x1="${mx}" x2="${W - mx}" y1="${base}" y2="${base}"/>
      <line class="linea guia" x1="${mx}" x2="${W - mx}" y1="${base - alto}" y2="${base - alto}"/>
      <text class="eje" x="${mx}" y="${base - alto - 6}">${escapar(formato(max))}</text>${barras}</svg>${Charts.leyenda(leyendas)}`;
  },

  /** Barras horizontales: items = [{ etiqueta, valor }]. */
  horizontales(items, formato) {
    const max = Math.max(...items.map((i) => i.valor), 0);
    if (!items.length || !max) return Charts.vacio('Aún no hay datos.');
    const filas = items.map((it, i) => `
      <div class="hbar"><span class="hbar-nombre" title="${escapar(it.etiqueta)}">${escapar(it.etiqueta)}</span>
        <span class="hbar-pista"><span class="hbar-valor c${(i % 5) + 1}" style="width:${Math.max(2, (it.valor / max) * 100).toFixed(1)}%"></span></span>
        <b>${escapar(formato(it.valor))}</b></div>`).join('');
    return `<div class="hbars">${filas}</div>`;
  },

  /** Dona: items = [{ etiqueta, valor }]. Cada porción es un arco calculado con trigonometría. */
  donut(items, formatoValor, centro) {
    const total = items.reduce((a, i) => a + i.valor, 0);
    if (!total) return Charts.vacio('Aún no hay datos.');
    const R = 70, r = 44, cx = 90, cy = 90;
    const punto = (ang, rad) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
    let ang = -Math.PI / 2;
    const arcos = items.map((it, i) => {
      const parte = (it.valor / total) * Math.PI * 2;
      const fin = ang + Math.min(parte, Math.PI * 2 - 0.001); // un arco de 360° exacto no se dibuja
      const [x1, y1] = punto(ang, R), [x2, y2] = punto(fin, R), [x3, y3] = punto(fin, r), [x4, y4] = punto(ang, r);
      const grande = parte > Math.PI ? 1 : 0;
      const d = `M${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 ${grande} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L${x3.toFixed(2)} ${y3.toFixed(2)} A${r} ${r} 0 ${grande} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}Z`;
      ang += parte;
      return `<path class="c${(i % 5) + 1}" d="${d}"><title>${escapar(it.etiqueta)}: ${escapar(formatoValor(it.valor))} (${Math.round((it.valor / total) * 100)}%)</title></path>`;
    }).join('');
    const lista = items.map((it, i) => `<li><i class="pt c${(i % 5) + 1}"></i>${escapar(it.etiqueta)} <b>${escapar(formatoValor(it.valor))}</b></li>`).join('');
    return `<div class="donut-wrap"><svg viewBox="0 0 180 180" role="img" aria-label="${escapar(centro)}">${arcos}
      <text class="donut-num" x="90" y="88" text-anchor="middle">${escapar(centro)}</text></svg><ul class="donut-lista">${lista}</ul></div>`;
  },

  leyenda(nombres) {
    return `<ul class="leyenda">${nombres.map((n, i) => `<li><i class="pt c${i + 1}"></i>${escapar(n)}</li>`).join('')}</ul>`;
  },
};
