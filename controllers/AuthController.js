/**
 * AuthController (front): registro, inicio de sesión, CRUD de usuarios, perfil y contraseña.
 *
 * Ahora los datos viven en MySQL. Este controlador:
 *   1) valida el FORMATO en el navegador (respuesta inmediata al usuario),
 *   2) envía los datos a la API por fetch,
 *   3) la API vuelve a validar (unicidad, reglas, permisos): el servidor manda.
 *
 * Los métodos son async: devuelven una promesa, así que se usan con `await`.
 */
class AuthController {
  static MAX_INTENTOS = 3;

  // ================= Validación de formato (sin servidor) =================
  static validarPassword(clave) {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(clave || '');
  }

  /** Revisa solo el formato. La unicidad (usuario/identificación repetidos) la valida el servidor. */
  static validarFormato(datos, { passwordObligatoria = true } = {}) {
    const e = {};
    const ident = String(datos.identificacion || '').trim();
    const nombre = String(datos.nombre || '').trim();
    const celular = String(datos.celular || '').trim();
    const username = String(datos.username || '').trim();

    if (!/^[A-Za-z0-9]{5,15}$/.test(ident)) e.identificacion = 'Cédula o pasaporte: entre 5 y 15 letras o números, sin espacios.';
    if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)+$/.test(nombre) || nombre.length < 5) {
      e.nombre = 'Escribe tu nombre completo (nombre y apellido, solo letras).';
    }
    if (!/^3\d{9}$/.test(celular)) e.celular = 'El celular debe tener 10 dígitos y empezar por 3.';
    if (!/^[A-Za-z0-9_.]{4,20}$/.test(username)) e.username = 'Usuario de 4 a 20 caracteres: letras, números, punto o guion bajo.';

    const clave = datos.password || '';
    if (clave || passwordObligatoria) {
      if (!AuthController.validarPassword(clave)) e.password = 'Mínimo 8 caracteres con mayúscula, minúscula y número.';
      if (datos.confirmar !== undefined && datos.confirmar !== clave) e.confirmar = 'Las contraseñas no coinciden.';
    }
    return e;
  }

  /** Valida formato y, si está bien, llama a la API. Devuelve {ok, errores?, mensaje?, ...}. */
  static async _enviar(accion, datos, opciones) {
    const errores = AuthController.validarFormato(datos, opciones);
    if (Object.keys(errores).length) return { ok: false, errores };
    return ApiClient.post(accion, datos); // la API puede devolver más errores (unicidad)
  }

  // ================= Registro y CRUD =================
  /** Registro público de un cliente nuevo. */
  static registrar(datos) {
    return AuthController._enviar('registro', datos, { passwordObligatoria: true });
  }

  /** Alta de usuario hecha por un administrador (puede elegir rol y estado). */
  static crearUsuario(datos) {
    return AuthController._enviar('usuario_crear', datos, { passwordObligatoria: true });
  }

  static editarUsuario(id, datos) {
    return AuthController._enviar('usuario_editar', { ...datos, id }, { passwordObligatoria: false });
  }

  static async eliminarUsuario(id) {
    return ApiClient.post('usuario_eliminar', { id });
  }

  static async listarUsuarios() {
    const r = await ApiClient.get('usuarios');
    return r.ok ? r.usuarios : [];
  }

  // ================= Inicio de sesión =================
  /** Intentos fallidos de un usuario (alimenta el contador visible). */
  static async intentosDe(username) {
    if (!String(username || '').trim()) return 0;
    const r = await ApiClient.get('intentos', { username });
    return r.ok ? r.intentos : 0;
  }

  static async login(username, password) {
    if (!String(username || '').trim() || !password) {
      return { ok: false, mensaje: 'Ingresa tu usuario y tu contraseña.' };
    }
    const r = await ApiClient.post('login', { username, password });
    if (r.ok) r.usuario = Usuario.fromObject(r.usuario); // JSON -> objeto Usuario con sus productos
    return r;
  }

  /** Usuario con sesión activa (o null). Pregunta al servidor, que es quien guarda la sesión. */
  static async usuarioActual() {
    const r = await ApiClient.get('me');
    return r.ok ? Usuario.fromObject(r.usuario) : null;
  }

  static async cerrarSesion() {
    try { await ApiClient.post('logout'); } catch (e) { /* sin conexión: igual se sale de la pantalla */ }
  }

  // ================= Perfil y seguridad =================
  static actualizarPerfil(datos) {
    const errores = AuthController.validarFormato({ ...datos, password: '', confirmar: undefined }, { passwordObligatoria: false });
    if (Object.keys(errores).length) return Promise.resolve({ ok: false, errores });
    return ApiClient.post('perfil', datos);
  }

  /** Solicita usuario y clave actual, luego nueva clave y confirmación. */
  static cambiarPassword({ username, actual, nueva, confirmar }) {
    const e = {};
    if (!AuthController.validarPassword(nueva)) e.nueva = 'Mínimo 8 caracteres con mayúscula, minúscula y número.';
    if (nueva !== confirmar) e.confirmar = 'Las contraseñas no coinciden.';
    if (Object.keys(e).length) return Promise.resolve({ ok: false, errores: e });
    return ApiClient.post('password', { username, actual, nueva, confirmar });
  }
}
