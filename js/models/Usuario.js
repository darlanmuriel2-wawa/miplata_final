/**
 * Usuario (UML: Usuario -> Cliente / Administrador).
 * Se construye a partir del JSON que entrega la API (MySQL). Nunca contiene la
 * contraseña: el servidor solo guarda su hash y no lo envía al navegador.
 * El rol ('cliente' | 'admin') reemplaza la herencia en JavaScript.
 * Cada cliente tiene sus tres productos: ahorros, corriente y tarjeta.
 */
class Usuario {
  constructor({
    id = null, identificacion = '', nombre = '', celular = '', username = '',
    rol = 'cliente', estado = 'activo', intentosFallidos = 0, productos = null, fechaRegistro = null,
  } = {}) {
    this.id = id || 'U' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.identificacion = identificacion;
    this.nombre = nombre;
    this.celular = celular;
    this.username = username;
    this.rol = rol;
    this.estado = estado; // 'activo' | 'bloqueado'
    this.intentosFallidos = intentosFallidos;
    this.fechaRegistro = fechaRegistro || new Date().toISOString();
    const p = productos || {};
    this.productos = {
      ahorros: new CuentaAhorros(p.ahorros || {}),
      corriente: new CuentaCorriente(p.corriente || {}),
      tarjeta: new TarjetaCredito(p.tarjeta || {}),
    };
  }

  static fromObject(obj) {
    return new Usuario(obj);
  }

  esAdmin() {
    return this.rol === 'admin';
  }

  /** Devuelve la cuenta de ahorros o corriente (no la tarjeta). */
  getCuenta(tipo) {
    if (tipo !== 'ahorros' && tipo !== 'corriente') throw new Error('Producto no válido.');
    return this.productos[tipo];
  }

  actualizarPerfil({ identificacion, nombre, celular, username }) {
    this.identificacion = identificacion;
    this.nombre = nombre;
    this.celular = celular;
    this.username = username;
  }
}
