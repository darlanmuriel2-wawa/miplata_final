/**
 * dashboardApp.js - lógica de la interfaz del panel del cajero.
 * Usa AuthController y BankController; no calcula reglas de negocio aquí.
 *
 * Flujo con MySQL: el navegador NO guarda el dinero. Cada operación se envía a la API
 * (await), el servidor la guarda en la base de datos y luego `recargar()` vuelve a pedir
 * el usuario actualizado para repintar la pantalla con los datos reales.
 */
document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);

  // ---------- Guardia de sesión (la sesión la guarda el servidor) ----------
  let usuario = await cargarUsuario();
  if (!usuario) return; // ya se redirigió al login o se mostró el error
  const U = () => usuario; // el resto del archivo lee el usuario desde aquí

  /** Pide el usuario al servidor. Si no hay sesión, redirige al login. */
  async function cargarUsuario() {
    let u;
    try {
      u = await AuthController.usuarioActual();
    } catch (err) {
      toast(err.message, 'error');
      return null;
    }
    if (!u) { location.href = 'auth.html?modo=login'; return null; }
    if (u.esAdmin()) { location.href = 'admin-users.html'; return null; }
    return u;
  }

  async function recargar() {
    const nuevo = await cargarUsuario();
    if (nuevo) usuario = nuevo;
  }

  const NOMBRES = BankController.NOMBRES;

  // ---------- Navegación ----------
  function mostrarSeccion(nombre) {
    document.querySelectorAll('.seccion').forEach((s) => s.classList.toggle('activa', s.id === 'sec-' + nombre));
    document.querySelectorAll('.menu-lateral [data-seccion]').forEach((b) => b.classList.toggle('activo', b.dataset.seccion === nombre));
    if (nombre === 'saldo') renderSaldos();
    if (nombre === 'retirar') renderPreviewRetiro();
    if (nombre === 'movimientos') renderMovimientos();
    if (nombre === 'tarjeta') renderTarjeta();
    if (nombre === 'perfil') renderPerfil();
  }
  // DOM traversing + delegación: UN solo listener en el menú. closest() sube desde
  // el elemento donde se hizo clic hasta el botón que tiene data-seccion.
  document.querySelector('.menu-lateral').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-seccion]');
    if (boton) mostrarSeccion(boton.dataset.seccion);
  });
  $('btnCerrarSesion').addEventListener('click', async () => {
    await AuthController.cerrarSesion(); // el servidor destruye la sesión
    location.href = '../index.html';
  });

  function actualizarSaludo() {
    $('saludo').textContent = `Hola, ${U().nombre.split(' ')[0]} 👋`;
  }

  // ---------- Gráfica SVG: entradas y salidas de los últimos 7 días (sin librerías) ----------
  function renderGrafica() {
    const DIAS = 7;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    // 1) Preparar un "cubo" por día
    const dias = [];
    for (let i = DIAS - 1; i >= 0; i--) {
      const d = new Date(hoy);
      d.setDate(hoy.getDate() - i);
      dias.push({ fecha: d, entra: 0, sale: 0 });
    }
    // 2) Repartir cada movimiento en el cubo de su día
    BankController.movimientos(U(), 'todos').forEach((m) => {
      const f = new Date(m.fecha);
      f.setHours(0, 0, 0, 0);
      const cubo = dias.find((d) => d.fecha.getTime() === f.getTime());
      if (!cubo) return;
      if (m.sentido === 'entrada') cubo.entra += m.valor; else cubo.sale += m.valor;
    });
    // 3) Dibujar
    const W = 640, H = 230, base = 190, alto = 150, margen = 10;
    const maximo = Math.max(1, ...dias.map((d) => Math.max(d.entra, d.sale)));
    const ancho = (W - margen * 2) / DIAS;
    const barra = (valor, x, clase) => {
      const h = (valor / maximo) * alto;
      return `<rect class="${clase}" x="${x}" y="${base - h}" width="${ancho * 0.32}" height="${Math.max(h, valor > 0 ? 2 : 0)}" rx="4"><title>${formatoMoneda(valor)}</title></rect>`;
    };
    const barras = dias.map((d, i) => {
      const x0 = margen + i * ancho + ancho * 0.16;
      const etiqueta = d.fecha.toLocaleDateString('es-CO', { weekday: 'short' });
      return barra(d.entra, x0, 'bar-in') + barra(d.sale, x0 + ancho * 0.34, 'bar-out')
        + `<text class="eje" x="${x0 + ancho * 0.33}" y="${base + 20}" text-anchor="middle">${escapar(etiqueta)}</text>`;
    }).join('');
    $('grafica').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <line class="linea" x1="${margen}" x2="${W - margen}" y1="${base}" y2="${base}"/>
      <line class="linea" x1="${margen}" x2="${W - margen}" y1="${base - alto}" y2="${base - alto}" stroke-dasharray="4 4"/>
      <text class="eje" x="${margen}" y="${base - alto - 6}">${escapar(formatoMoneda(maximo))}</text>
      ${barras}</svg>`;
  }

  // ---------- Consultar saldo ----------
  function renderSaldos() {
    const r = BankController.consultarSaldos(U());
    $('patrimonio').textContent = formatoMoneda(r.ahorros.saldo + r.corriente.saldo - r.tarjeta.deuda);
    renderGrafica();
    const a = r.ahorros, c = r.corriente, t = r.tarjeta;
    $('tarjetasSaldo').innerHTML = `
      <div class="saldo-card">
        <small>Cuenta de Ahorros · ${escapar(a.numeroCuenta)}</small>
        <div class="monto">${formatoMoneda(a.saldo)}</div>
        <div class="detalle">Interés mensual: 1.5% (se aplica al retirar)</div>
      </div>
      <div class="saldo-card ${c.saldo < 0 ? 'rojo' : ''}">
        <small>Cuenta Corriente · ${escapar(c.numeroCuenta)}</small>
        <div class="monto">${formatoMoneda(c.saldo)}</div>
        <div class="detalle">Límite de retiro con sobregiro: ${formatoMoneda(c.disponible)}</div>
      </div>
      <div class="saldo-card tarjeta">
        <small>Tarjeta de Crédito · ${escapar(t.numeroCuenta)}</small>
        <div class="monto">${formatoMoneda(t.cupoDisponible)}</div>
        <div class="detalle">Cupo disponible de ${formatoMoneda(t.cupoTotal)} · Deuda: ${formatoMoneda(t.deuda)}</div>
      </div>`;
  }

  // ---------- Consignar ----------
  $('formConsignar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const d = datosFormulario(form);
    const saldo = await enviando(form, () => BankController.consignar(d.cuenta, Number(d.monto)));
    if (saldo === null) return;
    await recargar();
    toast(`Consignación exitosa. Nuevo saldo: ${formatoMoneda(saldo)}`);
    form.reset();
  });

  // ---------- Retirar ----------
  function renderPreviewRetiro() {
    const u = U();
    const tipo = $('retCuenta').value;
    const monto = Number($('retMonto').value);
    const cuenta = u.getCuenta(tipo);
    let html;
    if (tipo === 'ahorros') {
      const interes = cuenta.calcularInteres();
      html = `Saldo actual: <b>${formatoMoneda(cuenta.saldo)}</b>. Al retirar se abonará un interés del 1.5% (<b>${formatoMoneda(interes)}</b>).`;
      if (monto > 0 && monto <= cuenta.saldo) {
        html += ` Saldo después del retiro: <b>${formatoMoneda(cuenta.calcularRetiro(monto).saldoFinal)}</b>.`;
      }
    } else {
      html = `Saldo actual: <b>${formatoMoneda(cuenta.saldo)}</b>. Puedes retirar hasta <b>${formatoMoneda(cuenta.limiteRetiro())}</b> (saldo + 20% de sobregiro).`;
      if (monto > cuenta.saldo && monto <= cuenta.limiteRetiro()) {
        html += ` Este retiro usa <b>${formatoMoneda(cuenta.calcularRetiro(monto).sobregiro)}</b> de sobregiro.`;
      }
    }
    $('previewRetiro').innerHTML = html;
  }
  $('retCuenta').addEventListener('change', renderPreviewRetiro);
  $('retMonto').addEventListener('input', renderPreviewRetiro);
  $('formRetirar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const d = datosFormulario(form);
    const r = await enviando(form, () => BankController.retirar(d.cuenta, Number(d.monto)));
    if (!r) return;
    await recargar();
    const extra = r.interes > 0 ? ` (interés abonado: ${formatoMoneda(r.interes)})` : '';
    toast(`Retiro exitoso${extra}. Nuevo saldo: ${formatoMoneda(r.saldo)}`);
    form.reset();
    renderPreviewRetiro();
  });

  // ---------- Extracto de movimientos ----------
  const formFiltros = $('filtrosMov');
  const aFecha = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const leerFiltro = () => datosFormulario(formFiltros);
  let listaActual = []; // lo que se ve en pantalla es lo que se descarga/imprime

  function describirFiltro(f) {
    const prod = f.producto === 'todos' ? 'Todos los productos' : NOMBRES[f.producto];
    const tipo = { todos: 'entradas y salidas', entrada: 'solo entradas', salida: 'solo salidas' }[f.sentido];
    const rango = f.desde || f.hasta ? `${f.desde || 'inicio'} a ${f.hasta || 'hoy'}` : 'todas las fechas';
    return `${prod} · ${tipo} · ${rango}`;
  }

  function renderMovimientos() {
    const f = leerFiltro();
    listaActual = BankController.filtrarMovimientos(U(), f);
    const r = BankController.resumenMovimientos(listaActual);
    $('resumenMov').innerHTML = `
      <div><small>Entradas</small><b class="entrada">${formatoMoneda(r.entradas)}</b></div>
      <div><small>Salidas</small><b class="salida">${formatoMoneda(r.salidas)}</b></div>
      <div><small>Neto del periodo</small><b>${formatoMoneda(r.neto)}</b></div>
      <div><small>Movimientos</small><b>${r.cantidad}</b></div>`;
    $('tablaMov').innerHTML = listaActual.length
      ? listaActual.map((m) => `
        <tr>
          <td>${escapar(new Date(m.fecha).toLocaleString('es-CO'))}</td>
          <td>${escapar(m.productoNombre)}</td>
          <td>${escapar(m.tipo)}</td>
          <td>${escapar(m.descripcion)}</td>
          <td class="${m.sentido}">${m.sentido === 'entrada' ? '+' : '−'} ${formatoMoneda(m.valor)}</td>
          <td>${m.transferenciaId ? `<button type="button" class="btn btn-gris btn-sm" data-comprobante="${m.transferenciaId}">Comprobante</button>` : ''}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="vacio">No hay movimientos para este filtro.</td></tr>';
  }
  formFiltros.addEventListener('change', (e) => {
    if (e.target.matches('[name="desde"], [name="hasta"]')) {
      formFiltros.querySelectorAll('.chip').forEach((c) => c.classList.remove('activo'));
    }
    renderMovimientos();
  });
  formFiltros.addEventListener('submit', (e) => e.preventDefault());

  // Rangos rápidos (delegación): el clic en un chip rellena los dos campos de fecha
  formFiltros.querySelector('.presets').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-rango]');
    if (!chip) return;
    const hoy = new Date();
    const rango = chip.dataset.rango;
    let desde = new Date(hoy);
    if (rango === 'todo') desde = null;
    else if (rango === '7') desde.setDate(hoy.getDate() - 6);
    else if (rango === '30') desde.setDate(hoy.getDate() - 29);
    else if (rango === 'mes') desde.setDate(1);
    formFiltros.elements.desde.value = desde ? aFecha(desde) : '';
    formFiltros.elements.hasta.value = desde ? aFecha(hoy) : '';
    // traversing: se marca solo el chip pulsado entre sus hermanos
    [...chip.parentElement.children].forEach((c) => c.classList.toggle('activo', c === chip));
    renderMovimientos();
  });

  $('btnCsv').addEventListener('click', () => {
    if (!listaActual.length) return toast('No hay movimientos para descargar con este filtro.', 'error');
    Documentos.csv(listaActual, `extracto-miplata-${aFecha(new Date())}.csv`);
  });
  $('btnImprimirExtracto').addEventListener('click', () => {
    const f = leerFiltro();
    Documentos.imprimir('Extracto Mi Plata',
      Documentos.htmlExtracto(U(), listaActual, BankController.resumenMovimientos(listaActual), describirFiltro(f)));
  });

  // ---------- Comprobante de transferencia ----------
  const dlg = $('dlgComprobante');
  let comprobanteAbierto = null;
  function abrirComprobante(c) {
    comprobanteAbierto = c;
    $('contenidoComprobante').innerHTML = Documentos.htmlComprobante(c);
    if (!dlg.open) dlg.showModal();
  }
  $('btnCerrarComp').addEventListener('click', () => dlg.close());
  $('btnImprimirComp').addEventListener('click', () => Documentos.imprimir('Comprobante ' + comprobanteAbierto.referencia, Documentos.htmlComprobante(comprobanteAbierto)));
  // clic en el fondo oscuro (fuera de la tarjeta) también cierra
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  // Delegación: un listener en la tabla; closest() encuentra el botón aunque cambie el contenido
  $('tablaMov').addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-comprobante]');
    if (!boton) return;
    boton.disabled = true;
    try {
      abrirComprobante(await BankController.obtenerComprobante(boton.dataset.comprobante));
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      boton.disabled = false;
    }
  });

  // ---------- Transferir ----------
  function actualizarDestinos() {
    const origen = $('trOrigen').value;
    const modo = document.querySelector('input[name="modo"]:checked').value;
    $('campoUsuarioDestino').hidden = modo !== 'otro';
    const opciones = ['ahorros', 'corriente'].filter((t) => modo === 'otro' || t !== origen);
    $('trDestino').innerHTML = opciones.map((t) => `<option value="${t}">${NOMBRES[t]}</option>`).join('');
  }
  $('trOrigen').addEventListener('change', actualizarDestinos);
  document.querySelectorAll('input[name="modo"]').forEach((r) => r.addEventListener('change', actualizarDestinos));
  $('formTransferir').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const d = datosFormulario(form);
    const destino = { modo: d.modo, tipo: d.destino, username: d.usuarioDestino };
    const r = await enviando(form, () => BankController.transferir(d.origen, destino, Number(d.monto)));
    if (!r) return;
    await recargar();
    toast(`Transferencia exitosa a ${r.destinatario}. Saldo origen: ${formatoMoneda(r.saldoOrigen)}`);
    form.reset();
    actualizarDestinos();
    abrirComprobante(r.comprobante);
  });

  // ---------- Tarjeta de crédito ----------
  function renderTarjeta() {
    const t = U().productos.tarjeta;
    $('resumenTarjeta').innerHTML = `
      <div class="saldo-card tarjeta"><small>Cupo total</small><div class="monto">${formatoMoneda(t.cupoTotal)}</div><div class="detalle">Tarjeta ${escapar(t.numTarjeta)}</div></div>
      <div class="saldo-card tarjeta"><small>Cupo disponible</small><div class="monto">${formatoMoneda(t.cupoDisponible())}</div></div>
      <div class="saldo-card tarjeta rojo"><small>Deuda actual</small><div class="monto">${formatoMoneda(t.deudaActual)}</div></div>`;
    $('tablaCompras').innerHTML = t.compras.length
      ? t.compras.map((c) => `
        <tr>
          <td>${escapar(new Date(c.fecha).toLocaleDateString('es-CO'))}</td>
          <td>${escapar(c.descripcion)}</td>
          <td>${formatoMoneda(c.capital)}</td>
          <td>${c.cuotas}</td>
          <td>${(c.tasa * 100).toFixed(1)}%</td>
          <td><b>${formatoMoneda(c.cuotaMensual)}</b></td>
          <td>${formatoMoneda(c.saldoCapital)}</td>
        </tr>`).join('')
      : '<tr><td colspan="7" class="vacio">Aún no tienes compras con tarjeta.</td></tr>';
    renderPreviewCompra();
  }

  function renderPreviewCompra() {
    const sim = BankController.simularCuota(Number($('compValor').value), Number($('compCuotas').value));
    $('previewCompra').innerHTML = sim
      ? `Tasa: <b>${(sim.tasa * 100).toFixed(1)}% mensual</b> · Pago mensual: <b>${formatoMoneda(sim.cuota)}</b> · Total a pagar: <b>${formatoMoneda(sim.total)}</b>`
      : 'Ingresa valor y cuotas para ver tu pago mensual.';
  }
  $('compValor').addEventListener('input', renderPreviewCompra);
  $('compCuotas').addEventListener('input', renderPreviewCompra);

  $('formCompra').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const d = datosFormulario(form);
    const compra = await enviando(form, () => BankController.comprarConTarjeta(Number(d.valor), Number(d.cuotas), d.descripcion));
    if (!compra) return;
    await recargar();
    toast(`Compra registrada. Pago mensual: ${formatoMoneda(compra.cuotaMensual)} durante ${compra.cuotas} cuotas.`);
    form.reset();
    $('compCuotas').value = 1;
    renderTarjeta();
  });

  $('formPago').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const d = datosFormulario(form);
    const r = await enviando(form, () => BankController.pagarTarjeta(d.cuenta, Number(d.monto)));
    if (!r) return;
    await recargar();
    toast(`Pago exitoso. Deuda restante: ${formatoMoneda(r.deuda)}`);
    form.reset();
    renderTarjeta();
  });

  // ---------- Perfil ----------
  function renderPerfil() {
    const u = U();
    $('perIdent').value = u.identificacion;
    $('perNombre').value = u.nombre;
    $('perCelular').value = u.celular;
    $('perUsuario').value = u.username;
    $('claveUsuario').value = '';
    mostrarErrores($('formPerfil'), {});
    mostrarErrores($('formClave'), {});
  }

  $('formPerfil').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const r = await enviando(form, () => AuthController.actualizarPerfil(datosFormulario(form)));
    if (!r) return;
    if (!r.ok) {
      mostrarErrores(form, r.errores || {});
      if (!r.errores) toast(r.mensaje, 'error');
      return;
    }
    mostrarErrores(form, {});
    await recargar();
    actualizarSaludo();
    toast('Perfil actualizado correctamente.');
  });

  $('formClave').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const r = await enviando(form, () => AuthController.cambiarPassword(datosFormulario(form)));
    if (!r) return;
    if (!r.ok) {
      mostrarErrores(form, r.errores || {});
      if (!r.errores) toast(r.mensaje, 'error');
      return;
    }
    mostrarErrores(form, {});
    form.reset();
    toast('Contraseña cambiada correctamente.');
  });

  // ---------- Inicio ----------
  actualizarSaludo();
  actualizarDestinos();
  renderSaldos();
});
