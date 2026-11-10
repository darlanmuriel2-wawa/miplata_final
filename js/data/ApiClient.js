/**
 * ApiClient: el único archivo del front que sabe CÓMO hablar con el servidor.
 *
 *   Vista -> Controlador (JS) -> ApiClient --fetch--> API PHP -> MySQL
 *
 * ¿Por qué async/await? fetch() no devuelve el resultado al instante: devuelve una
 * PROMESA (el servidor tarda unos milisegundos). `await` pausa esa función hasta que
 * llegue la respuesta, sin congelar la página.
 */

// Dirección de la API. Por defecto se calcula sola: <carpeta del proyecto>/api/index.php
// Si abres el front con Live Server (otro puerto), pon antes de los scripts:
//   <script>window.MIPLATA_API_URL = 'http://localhost/miplata/api/index.php';</script>
const API_URL = (() => {
  if (window.MIPLATA_API_URL) return window.MIPLATA_API_URL;
  const script = document.currentScript; // este mismo archivo: .../js/data/ApiClient.js
  return script ? new URL('../../api/index.php', script.src).href : 'api/index.php';
})();

/** Error de comunicación o respuesta con ok:false. `status` es el código HTTP (401 = sin sesión). */
class ApiError extends Error {
  constructor(mensaje, status = 0, datos = {}) {
    super(mensaje);
    this.status = status;
    this.datos = datos;
  }
}

class ApiClient {
  /**
   * Hace la petición y devuelve el JSON (con `ok` true/false y `status`).
   * Solo LANZA error si no hay conexión o la respuesta no es JSON.
   */
  static async llamar(accion, { datos, params = {} } = {}) {
    const url = new URL(API_URL, location.href);
    url.searchParams.set('accion', accion);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    let respuesta;
    try {
      respuesta = await fetch(url, {
        method: datos === undefined ? 'GET' : 'POST',
        credentials: 'include', // envía la cookie de sesión de PHP
        headers: datos === undefined ? {} : { 'Content-Type': 'application/json' },
        body: datos === undefined ? undefined : JSON.stringify(datos),
      });
    } catch (e) {
      const ayuda = location.protocol === 'file:'
        ? 'Abre la página desde XAMPP: http://localhost/miplata/ (no con doble clic en el archivo).'
        : 'Verifica que Apache y MySQL estén encendidos en XAMPP.';
      throw new ApiError('No se pudo conectar con el servidor. ' + ayuda, 0);
    }

    let json;
    try {
      json = await respuesta.json();
    } catch (e) {
      throw new ApiError(`El servidor respondió algo inesperado (HTTP ${respuesta.status}). Revisa el log de Apache/PHP.`, respuesta.status);
    }
    json.status = respuesta.status;
    return json;
  }

  static get(accion, params = {}) { return ApiClient.llamar(accion, { params }); }
  static post(accion, datos = {}) { return ApiClient.llamar(accion, { datos }); }

  /** Convierte una respuesta ok:false en una excepción (las operaciones de dinero usan este estilo). */
  static exigir(json) {
    if (!json.ok) throw new ApiError(json.mensaje || 'La operación no se pudo completar.', json.status, json);
    return json;
  }
}
