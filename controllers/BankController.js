/**
 * BankController (front): operaciones del cajero.
 *
 * Dos clases de métodos:
 *  - ASYNC (consignar, retirar, transferir, comprar, pagar): envían la operación a la API.
 *    El servidor aplica las reglas, guarda en MySQL y responde. Si algo no se cumple
 *    lanzan un Error con el mensaje, que la vista muestra en un aviso.
 *  - PUROS (consultarSaldos, movimientos, simularCuota): solo leen/calculan con los datos
 *    que ya tiene el navegador; no necesitan servidor.
 */
class BankController {
  static NOMBRES = { ahorros: 'Cuenta de Ahorros', corriente: 'Cuenta Corriente', tarjeta: 'Tarjeta de Crédito' };

  // ---------- Operaciones que se guardan en MySQL ----------
  static async consignar(tipo, monto) {
    Cuenta.validarMonto(monto); // respuesta rápida sin viajar al servidor
    const r = ApiClient.exigir(await ApiClient.post('consignar', { cuenta: tipo, monto }));
    return r.saldo;
  }

  /** Ahorros: el servidor aplica el 1.5% de interés al retirar. Corriente: permite sobregiro del 20%. */
  static async retirar(tipo, monto) {
    Cuenta.validarMonto(monto);
    const r = ApiClient.exigir(await ApiClient.post('retirar', { cuenta: tipo, monto }));
    return { saldo: r.saldo, interes: r.interes };
  }

  /**
   * destino = { modo: 'propio', tipo }              -> entre productos del mismo usuario
   * destino = { modo: 'otro', username, tipo }      -> a otro usuario
   */
  static async transferir(origenTipo, destino, monto) {
    Cuenta.validarMonto(monto);
    const r = ApiClient.exigir(await ApiClient.post('transferir', {
      origen: origenTipo, modo: destino.modo, tipo: destino.tipo, username: destino.username || '', monto,
    }));
    return { saldoOrigen: r.saldoOrigen, destinatario: r.destinatario, comprobante: r.comprobante };
  }

  /** Pide al servidor un comprobante ya emitido (solo lo ven quien envió y quien recibió). */
  static async obtenerComprobante(id) {
    return ApiClient.exigir(await ApiClient.get('comprobante', { id })).comprobante;
  }

  static async comprarConTarjeta(valor, cuotas, descripcion) {
    Cuenta.validarMonto(valor);
    TarjetaCredito.validarCuotas(cuotas);
    const r = ApiClient.exigir(await ApiClient.post('compra', { valor, cuotas, descripcion }));
    return r.compra;
  }

  /** Paga la tarjeta con dinero de una cuenta de ahorros o corriente. */
  static async pagarTarjeta(cuentaTipo, monto) {
    Cuenta.validarMonto(monto);
    const r = ApiClient.exigir(await ApiClient.post('pago_tarjeta', { cuenta: cuentaTipo, monto }));
    return { deuda: r.deuda, saldo: r.saldo };
  }

  // ---------- Consultas locales (sin servidor) ----------
  static consultarSaldos(usuario) {
    const p = usuario.productos;
    return {
      ahorros: p.ahorros.obtenerResumen(),
      corriente: p.corriente.obtenerResumen(),
      tarjeta: p.tarjeta.obtenerResumen(),
    };
  }

  /** Historial ordenado por fecha descendente. filtro: todos | ahorros | corriente | tarjeta */
  static movimientos(usuario, filtro = 'todos') {
    const lista = [];
    Object.entries(usuario.productos).forEach(([clave, producto]) => {
      if (filtro !== 'todos' && filtro !== clave) return;
      producto.movimientos.forEach((m) => lista.push({ ...m, productoNombre: BankController.NOMBRES[clave] }));
    });
    return lista.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }

  /**
   * Extracto: movimientos filtrados. filtro = { producto, desde, hasta, sentido }
   * desde/hasta llegan como 'YYYY-MM-DD' (input type=date) y se comparan por DÍA LOCAL.
   */
  static filtrarMovimientos(usuario, filtro = {}) {
    const { producto = 'todos', desde = '', hasta = '', sentido = 'todos' } = filtro;
    const ini = desde ? new Date(desde + 'T00:00:00') : null;
    const fin = hasta ? new Date(hasta + 'T23:59:59.999') : null;
    return BankController.movimientos(usuario, producto).filter((m) => {
      const f = new Date(m.fecha);
      if (ini && f < ini) return false;
      if (fin && f > fin) return false;
      return sentido === 'todos' || m.sentido === sentido;
    });
  }

  /** Totales del extracto: entradas, salidas y neto. */
  static resumenMovimientos(lista) {
    const suma = (s) => lista.filter((m) => m.sentido === s).reduce((a, m) => a + m.valor, 0);
    const entradas = Cuenta.redondear(suma('entrada'));
    const salidas = Cuenta.redondear(suma('salida'));
    return { cantidad: lista.length, entradas, salidas, neto: Cuenta.redondear(entradas - salidas) };
  }

  static simularCuota(valor, cuotas) {
    if (!(valor > 0) || !Number.isInteger(cuotas) || cuotas < 1) return null;
    const tasa = TarjetaCredito.tasaPorCuotas(cuotas);
    const cuota = TarjetaCredito.calcularCuota(valor, cuotas);
    return { tasa, cuota, total: Cuenta.redondear(cuota * cuotas) };
  }
}
