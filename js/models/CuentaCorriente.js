/**
 * Cuenta Corriente: gestión diaria del dinero (nómina, facturas, transferencias).
 * - No genera intereses.
 * - Sobregiro: se puede retirar hasta un 20% adicional sobre el saldo actual.
 *   Ejemplo: saldo $1.000.000 -> límite de retiro $1.200.000.
 */
class CuentaCorriente extends Cuenta {
  constructor(datos = {}) {
    super(datos);
    this.sobreGiroMax = 0.20;
  }

  get tipo() { return 'corriente'; }
  get nombreProducto() { return 'Cuenta Corriente'; }

  limiteRetiro() {
    return Math.max(0, Cuenta.redondear(this.saldo * (1 + this.sobreGiroMax)));
  }

  /** Cuánto del retiro quedaría como sobregiro (0 si alcanza con el saldo). */
  calcularRetiro(monto) {
    return { sobregiro: Math.max(0, monto - Math.max(0, this.saldo)) };
  }

  validarSobregiro(monto) {
    this.validarRetiro(monto);
  }

  mensajeLimite() {
    return `El monto supera el límite de retiro con sobregiro del 20% (${Cuenta.formatear(this.limiteRetiro())}).`;
  }
}
