/**
 * Cuenta de Ahorros: guardar dinero a mediano y largo plazo.
 * - Permite consignar y retirar.
 * - Interés de 1.5% mensual, calculado y aplicado en el momento del retiro.
 * - El retiro no puede superar el saldo disponible.
 */
class CuentaAhorros extends Cuenta {
  constructor(datos = {}) {
    super(datos);
    this.tasaInteres = 0.015;
  }

  get tipo() { return 'ahorros'; }
  get nombreProducto() { return 'Cuenta de Ahorros'; }

  /** Interés mensual sobre el saldo actual. */
  calcularInteres() {
    return Cuenta.redondear(this.saldo * this.tasaInteres);
  }

  /** Vista previa de un retiro (no modifica nada). */
  calcularRetiro(monto) {
    const interes = this.calcularInteres();
    return { interes, saldoFinal: Cuenta.redondear(this.saldo + interes - monto) };
  }

  /** Abona el interés al saldo y lo registra como movimiento. */
  aplicarIntereses() {
    const interes = this.calcularInteres();
    if (interes > 0) {
      this.saldo = Cuenta.redondear(this.saldo + interes);
      this.agregarMovimiento('interés', interes, 'entrada', 'Interés 1.5% mensual aplicado al retiro');
    }
    return interes;
  }

  retirar(monto) {
    this.validarRetiro(monto); // el monto no puede superar el saldo disponible
    const interes = this.aplicarIntereses();
    this.saldo = Cuenta.redondear(this.saldo - monto);
    this.agregarMovimiento('retiro', monto, 'salida', 'Retiro de Cuenta de Ahorros');
    return { interes };
  }
}
