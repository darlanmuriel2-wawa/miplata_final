/**
 * Transaccion / Movimiento (UML: Movimiento y Transferencia).
 * Cada operación que afecta un producto se guarda como una Transaccion
 * dentro del arreglo `movimientos` de ese producto.
 */
class Transaccion {
  /**
   * @param {string} tipo        consignación | retiro | transferencia | interés | compra | pago tarjeta
   * @param {number} valor       siempre positivo
   * @param {string} sentido     'entrada' (suma) o 'salida' (resta)
   */
  constructor({ id = null, fecha = null, tipo, valor, sentido = 'entrada', descripcion = '', producto = '', transferenciaId = null } = {}) {
    this.id = id || 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.fecha = fecha || new Date().toISOString();
    this.tipo = tipo;
    this.valor = Number(valor);
    this.sentido = sentido;
    this.descripcion = descripcion;
    this.producto = producto;
    this.transferenciaId = transferenciaId; // enlaza con el comprobante (solo transferencias)
  }

  fechaLegible() {
    return new Date(this.fecha).toLocaleString('es-CO');
  }
}
