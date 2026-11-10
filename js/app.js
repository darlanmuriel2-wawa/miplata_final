/**
 * app.js - utilidades compartidas + landing + páginas de acceso (login/registro).
 * Se carga en todas las páginas; cada bloque solo actúa si encuentra sus elementos.
 */

// ---------- Utilidades globales ----------
const formatoMoneda = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(n);

const escapar = (texto) =>
  String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const datosFormulario = (form) => Object.fromEntries(new FormData(form).entries());

function toast(mensaje, tipo = 'ok') {
  let cont = document.getElementById('toasts');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'toasts';
    document.body.appendChild(cont);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + (tipo === 'error' ? 'error' : '');
  t.textContent = mensaje;
  cont.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

/**
 * Ejecuta una operación async deshabilitando el botón de envío del formulario mientras
 * espera al servidor. Si ocurre un error de conexión lo muestra en un aviso.
 */
async function enviando(form, fn) {
  const boton = form.querySelector('button[type="submit"]');
  if (boton) boton.disabled = true;
  try {
    return await fn();
  } catch (err) {
    if (err.status === 401) { location.href = 'auth.html?modo=login'; return null; } // sesión vencida
    toast(err.message, 'error');
    return null;
  } finally {
    if (boton) boton.disabled = false;
  }
}

/** Pinta los mensajes de error bajo cada campo ({campo: mensaje}). */
function mostrarErrores(form, errores = {}) {
  form.querySelectorAll('[data-error]').forEach((span) => {
    const msg = errores[span.dataset.error] || '';
    span.textContent = msg;
    const campo = span.closest('.campo');
    const input = campo && campo.querySelector('input, select');
    if (input) input.classList.toggle('invalid', Boolean(msg));
  });
}

// ---------- Arranque ----------
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));

  const toggle = document.getElementById('menuToggle');
  const links = document.getElementById('navLinks');
  if (toggle && links) toggle.addEventListener('click', () => links.classList.toggle('abierto'));

  if (document.getElementById('formLogin')) iniciarPaginaAuth();
});

// ---------- Página de acceso ----------
function iniciarPaginaAuth() {
  const formLogin = document.getElementById('formLogin');
  const formRegistro = document.getElementById('formRegistro');
  const mensaje = document.getElementById('mensajeLogin');
  const contador = document.getElementById('contadorIntentos');
  const inputUsuario = document.getElementById('loginUsuario');
  const btnLogin = document.getElementById('btnLogin');
  const tabs = document.querySelectorAll('[data-modo]');

  function mostrarModo(modo) {
    formLogin.hidden = modo !== 'login';
    formRegistro.hidden = modo !== 'registro';
    tabs.forEach((t) => t.classList.toggle('activo', t.dataset.modo === modo));
    document.getElementById('tituloAuth').textContent = modo === 'login' ? 'Inicia sesión' : 'Crea tu cuenta';
  }
  mostrarModo(new URLSearchParams(location.search).get('modo') === 'registro' ? 'registro' : 'login');
  tabs.forEach((t) => t.addEventListener('click', () => mostrarModo(t.dataset.modo)));

  // Contador de intentos siempre visible (el número real vive en la base de datos)
  const pintarContador = (n) => {
    contador.textContent = `Intentos fallidos: ${n} de ${AuthController.MAX_INTENTOS}`;
    contador.classList.toggle('peligro', n >= 2);
  };
  pintarContador(0);

  // "Debounce": espera 300 ms sin escribir antes de preguntar al servidor, para no
  // hacer una petición por cada tecla.
  let espera;
  inputUsuario.addEventListener('input', () => {
    btnLogin.disabled = false;
    mensaje.hidden = true;
    clearTimeout(espera);
    espera = setTimeout(async () => {
      try { pintarContador(await AuthController.intentosDe(inputUsuario.value)); } catch (e) { /* sin conexión */ }
    }, 300);
  });

  // --- Login ---
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = datosFormulario(formLogin);
    const r = await enviando(formLogin, () => AuthController.login(d.usuario, d.clave));
    if (!r) return; // error de conexión: ya se mostró el aviso
    if (r.ok) {
      location.href = r.usuario.esAdmin() ? 'admin-users.html' : 'dashboard.html';
      return;
    }
    mensaje.textContent = r.mensaje;
    mensaje.hidden = false;
    if (r.intentos !== undefined) pintarContador(r.intentos);
    if (r.bloqueado) btnLogin.disabled = true;
    formLogin.clave.value = '';
  });

  // --- Registro ---
  formRegistro.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await enviando(formRegistro, () => AuthController.registrar(datosFormulario(formRegistro)));
    if (!r) return;
    if (!r.ok) {
      mostrarErrores(formRegistro, r.errores || {});
      if (!r.errores) toast(r.mensaje, 'error');
      return;
    }
    mostrarErrores(formRegistro, {});
    toast('¡Cuenta creada! Ya puedes iniciar sesión.');
    formRegistro.reset();
    mostrarModo('login');
    inputUsuario.value = r.usuario.username;
    pintarContador(0);
    formLogin.clave.focus();
  });
}
