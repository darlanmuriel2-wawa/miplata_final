/**
 * Clase base de los productos tipo cuenta (UML: Producto Bancario / Cuenta).
 * CuentaAhorros y CuentaCorriente heredan de ella.
 */
class Cuenta {
  constructor({ numeroCuenta = null, saldo = 0, movimientos = [], fechaCreacion = null } = {}) {
    this.numeroCuenta = numeroCuenta || Cuenta.generarNumero();
    this.saldo = Number(saldo) || 0;
    this.fechaCreacion = fechaCreacion || new Date().toISOString();
    // Historial de movimientos: se guarda en un Array de Transaccion
    this.movimientos = movimientos.map((m) => (m instanceof Transaccion ? m : new Transaccion(m)));
  }

  // ---------- utilidades estáticas ----------
  static generarNumero() {
    let n = '';
    for (let i = 0; i < 10; i++) n += Math.floor(Math.random() * 10);
    return n;
  }

  static redondear(n) {
    return Math.round(n * 100) / 100;
  }

  static formatear(n) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(n);
  }

  static validarMonto(monto) {
    if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) {
      throw new Error('Ingresa un monto válido mayor a cero.');
    }
  }

  // ---------- identidad del producto (se sobrescribe en las hijas) ----------
  get tipo() { return 'cuenta'; }
  get nombreProducto() { return 'Cuenta'; }

  // ---------- operaciones ----------
  consultarSaldo() {
    return this.saldo;
  }

  agregarMovimiento(tipo, valor, sentido, descripcion = '') {
    const t = new Transaccion({ tipo, valor, sentido, descripcion, producto: this.tipo });
    this.movimientos.push(t);
    return t;
  }

  /** Máximo que se puede sacar de la cuenta en una operación. */
  limiteRetiro() {
    return this.saldo;
  }

  mensajeLimite() {
    return `El monto supera el saldo disponible (${Cuenta.formatear(this.limiteRetiro())}).`;
  }

  validarRetiro(monto) {
    Cuenta.validarMonto(monto);
    if (monto > this.limiteRetiro()) throw new Error(this.mensajeLimite());
  }

  acreditar(monto, tipo, descripcion) {
    Cuenta.validarMonto(monto);
    this.saldo = Cuenta.redondear(this.saldo + monto);
    return this.agregarMovimiento(tipo, monto, 'entrada', descripcion);
  }

  debitar(monto, tipo, descripcion) {
    this.validarRetiro(monto);
    this.saldo = Cuenta.redondear(this.saldo - monto);
    return this.agregarMovimiento(tipo, monto, 'salida', descripcion);
  }

  consignar(monto) {
    return this.acreditar(monto, 'consignación', `Consignación en ${this.nombreProducto}`);
  }

  retirar(monto) {
    this.debitar(monto, 'retiro', `Retiro de ${this.nombreProducto}`);
    return { interes: 0 };
  }

  obtenerResumen() {
    return {
      tipo: this.tipo,
      nombre: this.nombreProducto,
      numeroCuenta: this.numeroCuenta,
      saldo: this.saldo,
      disponible: this.limiteRetiro(),
    };
  }
}
