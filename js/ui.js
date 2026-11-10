/**
 * ui.js - comportamiento visual compartido por todas las páginas.
 * JavaScript puro, sin librerías.
 *
 * ====== DOM TRAVERSING (recorrer el DOM) ======
 * Es navegar el árbol HTML desde un elemento hacia sus familiares:
 *
 *   elemento.closest('.x')         -> sube por los ANCESTROS hasta encontrar '.x' (incluye al propio elemento)
 *   elemento.parentElement         -> el padre directo
 *   elemento.children              -> los hijos directos (colección)
 *   elemento.firstElementChild     -> primer hijo      | lastElementChild -> último hijo
 *   elemento.nextElementSibling    -> el hermano siguiente
 *   elemento.previousElementSibling-> el hermano anterior
 *   elemento.querySelector(...)    -> baja a buscar DENTRO de él
 *
 * Con esto se usa "delegación de eventos": en vez de poner un listener a cada
 * botón, se pone UNO en el contenedor y con closest() se descubre cuál botón
 * fue (sirve incluso para botones creados después con innerHTML).
 */
(function () {
  const $$ = (selector, raiz = document) => Array.from(raiz.querySelectorAll(selector));
  const guardar = {
    leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    escribir(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento: no pasa nada */ } },
  };
  const reducirMovimiento = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.documentElement.classList.add('js');

  // ---------------------------------------------------------------- Tema claro / oscuro
  function aplicarTema(tema) {
    document.documentElement.dataset.theme = tema;
    $$('[data-tema-toggle]').forEach((b) => {
      b.textContent = tema === 'dark' ? '☀️' : '🌙';
      b.setAttribute('aria-label', tema === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    });
  }

  // ---------------------------------------------------------------- Tamaño de texto (accesibilidad)
  function aplicarTamano(nivel) {
    nivel = Math.max(0, Math.min(2, nivel));
    if (nivel === 0) delete document.documentElement.dataset.fs;
    else document.documentElement.dataset.fs = String(nivel);
    guardar.escribir('miplata_fs', String(nivel));
  }

  // ---------------------------------------------------------------- Mega-menú
  function cerrarMegaMenus(excepto) {
    $$('.mega-item.abierto').forEach((li) => {
      if (li !== excepto) {
        li.classList.remove('abierto');
        li.querySelector('.mega-trigger').setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ---------------------------------------------------------------- Carrusel del hero
  function iniciarCarrusel() {
    const carrusel = document.getElementById('carrusel');
    if (!carrusel) return;
    const pistas = carrusel.querySelector('.carrusel-pistas');
    const cuenta = carrusel.querySelector('.carrusel-cuenta');
    const barra = carrusel.querySelector('.carrusel-barra i');
    const DURACION = 6500;
    let timer = null;

    function mostrar(slide) {
      // pistas.children = todos los slides hermanos
      Array.from(pistas.children).forEach((s) => s.classList.toggle('activo', s === slide));
      const posicion = Array.from(pistas.children).indexOf(slide) + 1;
      cuenta.textContent = `${String(posicion).padStart(2, '0')} / ${String(pistas.children.length).padStart(2, '0')}`;
      barra.style.transition = 'none';
      barra.style.width = '0';
      void barra.offsetWidth; // fuerza el reflow para reiniciar la animación
      if (!reducirMovimiento) {
        barra.style.transition = `width ${DURACION}ms linear`;
        barra.style.width = '100%';
      }
    }

    function mover(direccion) {
      const actual = pistas.querySelector('.slide.activo');
      // Hermano siguiente/anterior; si no hay, damos la vuelta al primero/último
      const destino = direccion > 0
        ? actual.nextElementSibling || pistas.firstElementChild
        : actual.previousElementSibling || pistas.lastElementChild;
      mostrar(destino);
    }

    function arrancar() {
      detener();
      if (!reducirMovimiento) timer = setInterval(() => mover(1), DURACION);
    }
    function detener() { clearInterval(timer); }

    carrusel.addEventListener('click', (e) => {
      const boton = e.target.closest('[data-dir]'); // closest: sube desde el clic hasta el botón
      if (!boton) return;
      mover(Number(boton.dataset.dir));
      arrancar();
    });
    carrusel.addEventListener('mouseenter', detener);
    carrusel.addEventListener('mouseleave', arrancar);

    mostrar(pistas.querySelector('.slide.activo') || pistas.firstElementChild);
    arrancar();
  }

  // ---------------------------------------------------------------- Simulador de tarjeta
  function iniciarSimulador() {
    const valor = document.getElementById('simValor');
    const cuotas = document.getElementById('simCuotas');
    if (!valor || !cuotas) return;
    const set = (id, texto) => { document.getElementById(id).textContent = texto; };

    function calcular() {
      const capital = Number(valor.value);
      const n = Number(cuotas.value);
      // Reutilizamos las MISMAS reglas del modelo TarjetaCredito (una sola fuente de verdad)
      const tasa = TarjetaCredito.tasaPorCuotas(n);
      const cuota = TarjetaCredito.calcularCuota(capital, n);
      const total = Cuenta.redondear(cuota * n);
      set('simValorOut', formatoMoneda(capital));
      set('simCuotasOut', `${n} ${n === 1 ? 'cuota' : 'cuotas'}`);
      set('simTasa', `${(tasa * 100).toFixed(1)}% mensual`);
      set('simCuota', formatoMoneda(cuota));
      set('simTotal', formatoMoneda(total));
      set('simInteres', formatoMoneda(total - capital));
    }
    valor.addEventListener('input', calcular);
    cuotas.addEventListener('input', calcular);
    calcular();
  }

  // ---------------------------------------------------------------- Scroll reveal y contadores
  function animarContador(el) {
    const meta = Number(el.dataset.contar);
    const decimales = Number(el.dataset.dec || 0);
    const sufijo = el.dataset.sufijo || '';
    const formato = (n) => n.toLocaleString('es-CO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }) + sufijo;
    if (reducirMovimiento) { el.textContent = formato(meta); return; }
    const inicio = performance.now();
    const DUR = 1300;
    (function paso(ahora) {
      const t = Math.min(1, (ahora - inicio) / DUR);
      const suave = 1 - Math.pow(1 - t, 3); // ease-out
      el.textContent = formato(meta * suave);
      if (t < 1) requestAnimationFrame(paso);
    })(inicio);
  }

  function iniciarObservadores() {
    const revelar = $$('.reveal');
    const contadores = $$('[data-contar]');
    if (!('IntersectionObserver' in window)) {
      revelar.forEach((el) => el.classList.add('visible'));
      contadores.forEach(animarContador);
      return;
    }
    const obs = new IntersectionObserver((entradas) => {
      entradas.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('visible');
        if (en.target.dataset.contar) animarContador(en.target);
        obs.unobserve(en.target);
      });
    }, { threshold: 0.15 });
    revelar.forEach((el) => obs.observe(el));
    contadores.forEach((el) => obs.observe(el));
  }

  // ---------------------------------------------------------------- Un solo listener de clics (delegación)
  document.addEventListener('click', (e) => {
    // Tema
    if (e.target.closest('[data-tema-toggle]')) {
      const nuevo = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      guardar.escribir('miplata_tema', nuevo);
      aplicarTema(nuevo);
      return;
    }

    // Tamaño de texto
    const fs = e.target.closest('[data-fs]');
    if (fs) {
      const actual = Number(document.documentElement.dataset.fs || 0);
      aplicarTamano(actual + Number(fs.dataset.fs));
      return;
    }

    // Mega-menú: abrir el panel del <li> donde está el botón y cerrar los demás
    const disparador = e.target.closest('.mega-trigger');
    const itemMenu = disparador ? disparador.closest('.mega-item') : null;
    cerrarMegaMenus(itemMenu);
    if (itemMenu) {
      itemMenu.classList.toggle('abierto');
      disparador.setAttribute('aria-expanded', String(itemMenu.classList.contains('abierto')));
    }

    // Pestañas de productos: filtran las tarjetas de SU sección
    const pestana = e.target.closest('.pestanas .tab');
    if (pestana) {
      Array.from(pestana.parentElement.children).forEach((t) => t.classList.toggle('activo', t === pestana));
      const seccion = pestana.closest('section');
      $$('.producto', seccion).forEach((tarjeta) => {
        tarjeta.hidden = !(pestana.dataset.filtro === 'todos' || tarjeta.dataset.cat === pestana.dataset.filtro);
      });
    }

    // FAQ: abrir la respuesta que está justo después del botón
    const pregunta = e.target.closest('.faq-pregunta');
    if (pregunta) {
      const item = pregunta.parentElement;
      const estabaAbierto = item.classList.contains('abierto');
      pregunta.closest('.faq').querySelectorAll('.faq-item.abierto').forEach((i) => i.classList.remove('abierto'));
      if (!estabaAbierto) item.classList.add('abierto');
    }
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMegaMenus(null); });

  // Resplandor de las tarjetas que sigue al mouse
  document.addEventListener('pointermove', (e) => {
    const tarjeta = e.target.closest && e.target.closest('.card');
    if (!tarjeta) return;
    const caja = tarjeta.getBoundingClientRect();
    tarjeta.style.setProperty('--mx', `${e.clientX - caja.left}px`);
    tarjeta.style.setProperty('--my', `${e.clientY - caja.top}px`);
  });

  // ---------------------------------------------------------------- Arranque
  function iniciar() {
    aplicarTema(document.documentElement.dataset.theme || 'dark');
    aplicarTamano(Number(guardar.leer('miplata_fs') || 0));
    iniciarCarrusel();
    iniciarSimulador();
    iniciarObservadores();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
