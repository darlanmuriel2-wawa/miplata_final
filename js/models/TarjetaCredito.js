/**
 * Tarjeta de Crédito: el banco asigna un cupo; cada compra genera una deuda
 * que se paga a cuotas con interés según el plazo elegido.
 *
 *   cuotas <= 2   -> 0%    mensual
 *   3 a 6 cuotas  -> 1.9%  mensual
 *   cuotas >= 7   -> 2.3%  mensual
 *
 * Cuota mensual = (Capital * tasa) / (1 - (1 + tasa)^(-n))
 */
class TarjetaCredito {
  constructor({ numTarjeta = null, cupoTotal = 3000000, deudaActual = 0, compras = [], movimientos = [], fechaCorte = null } = {}) {
    this.numTarjeta = numTarjeta || Cuenta.generarNumero() + Cuenta.generarNumero().slice(0, 6);
    this.cupoTotal = Number(cupoTotal);
    this.deudaActual = Number(deudaActual) || 0;
    this.fechaCorte = fechaCorte || new Date().toISOString();
    this.compras = compras;
    this.movimientos = movimientos.map((m) => (m instanceof Transaccion ? m : new Transaccion(m)));
  }

  get tipo() { return 'tarjeta'; }
  get nombreProducto() { return 'Tarjeta de Crédito'; }

  consultarCupo() {
    return this.cupoDisponible();
  }

  cupoDisponible() {
    return Cuenta.redondear(this.cupoTotal - this.deudaActual);
  }

  static tasaPorCuotas(n) {
    if (n <= 2) return 0;
    if (n <= 6) return 0.019;
    return 0.023;
  }

  static calcularCuota(capital, n) {
    const tasa = TarjetaCredito.tasaPorCuotas(n);
    if (tasa === 0) return Cuenta.redondear(capital / n);
    return Cuenta.redondear((capital * tasa) / (1 - Math.pow(1 + tasa, -n)));
  }

  static validarCuotas(n) {
    if (!Number.isInteger(n) || n < 1 || n > 36) {
      throw new Error('El número de cuotas debe ser un entero entre 1 y 36.');
    }
  }

  registrarCompra(valor, cuotas, descripcion) {
    Cuenta.validarMonto(valor);
    TarjetaCredito.validarCuotas(cuotas);
    if (!descripcion || !descripcion.trim()) throw new Error('Escribe una descripción de la compra.');
    if (valor > this.cupoDisponible()) {
      throw new Error(`La compra supera tu cupo disponible (${Cuenta.formatear(this.cupoDisponible())}).`);
    }
    const tasa = TarjetaCredito.tasaPorCuotas(cuotas);
    const cuotaMensual = TarjetaCredito.calcularCuota(valor, cuotas);
    const compra = {
      id: 'C' + Date.now().toString(36),
      fecha: new Date().toISOString(),
      descripcion: descripcion.trim(),
      capital: valor,
      cuotas,
      tasa,
      cuotaMensual,
      saldoCapital: valor,
    };
    this.compras.push(compra);
    this.deudaActual = Cuenta.redondear(this.deudaActual + valor);
    this.movimientos.push(new Transaccion({
      tipo: 'compra', valor, sentido: 'salida', producto: this.tipo,
      descripcion: `${compra.descripcion} (${cuotas} cuotas de ${Cuenta.formatear(cuotaMensual)})`,
    }));
    return compra;
  }

  validarPago(monto) {
    Cuenta.validarMonto(monto);
    if (this.deudaActual <= 0) throw new Error('Tu tarjeta no tiene deuda pendiente.');
    if (monto > this.deudaActual) {
      throw new Error(`El pago supera tu deuda actual (${Cuenta.formatear(this.deudaActual)}).`);
    }
  }

  pagarTarjeta(monto) {
    this.validarPago(monto);
    this.deudaActual = Cuenta.redondear(this.deudaActual - monto);
    // El pago se abona primero a las compras más antiguas
    let restante = monto;
    for (const c of this.compras) {
      if (restante <= 0) break;
      const abono = Math.min(c.saldoCapital, restante);
      c.saldoCapital = Cuenta.redondear(c.saldoCapital - abono);
      restante = Cuenta.redondear(restante - abono);
    }
    this.movimientos.push(new Transaccion({
      tipo: 'pago tarjeta', valor: monto, sentido: 'entrada', producto: this.tipo,
      descripcion: 'Pago a tarjeta de crédito',
    }));
  }

  obtenerResumen() {
    return {
      tipo: this.tipo, nombre: this.nombreProducto, numeroCuenta: this.numTarjeta,
      cupoTotal: this.cupoTotal, cupoDisponible: this.cupoDisponible(), deuda: this.deudaActual,
    };
  }
}
