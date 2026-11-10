/**
 * adminApp.js - CRUD de usuarios (solo para el rol administrador).
 * Los usuarios viven en MySQL: cada acción es una petición a la API (await).
 */
document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);

  // ---------- Guardia de sesión ----------
  let sesion;
  try {
    sesion = await AuthController.usuarioActual();
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  if (!sesion) { location.href = 'auth.html?modo=login'; return; }
  if (!sesion.esAdmin()) { location.href = 'dashboard.html'; return; }

  $('saludoAdmin').textContent = `Admin: ${sesion.nombre}`;
  $('btnSalirAdmin').addEventListener('click', async () => {
    await AuthController.cerrarSesion();
    location.href = '../index.html';
  });

  const form = $('formUsuario');
  let usuarios = []; // copia local de la tabla `usuarios` para pintar y para llenar el formulario

  async function renderTabla() {
    try {
      usuarios = await AuthController.listarUsuarios();
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    $('tablaUsuarios').innerHTML = usuarios.map((u) => `
      <tr>
        <td>${escapar(u.identificacion)}</td>
        <td>${escapar(u.nombre)}</td>
        <td>${escapar(u.celular)}</td>
        <td>${escapar(u.username)}</td>
        <td><span class="badge ${u.rol}">${u.rol === 'admin' ? 'Administrador' : 'Cliente'}</span></td>
        <td><span class="badge ${u.estado}">${u.estado}</span></td>
        <td>
          <button class="btn btn-sm" data-editar="${u.id}">Editar</button>
          <button class="btn btn-sm btn-peligro" data-eliminar="${u.id}">Eliminar</button>
        </td>
      </tr>`).join('');
  }

  // Los id vienen de MySQL como números y de dataset como texto: se comparan como texto.
  const buscar = (id) => usuarios.find((u) => String(u.id) === String(id)) || null;

  function abrirForm(u = null) {
    form.hidden = false;
    form.reset();
    mostrarErrores(form, {});
    $('usuarioId').value = u ? u.id : '';
    $('tituloForm').textContent = u ? 'Editar usuario' : 'Agregar usuario';
    $('labelPassword').textContent = u ? 'Nueva contraseña (vacía = no cambiar)' : 'Contraseña';
    if (u) {
      $('uIdent').value = u.identificacion;
      $('uNombre').value = u.nombre;
      $('uCelular').value = u.celular;
      $('uUsername').value = u.username;
      $('uRol').value = u.rol;
      $('uEstado').value = u.estado;
    }
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cerrarForm() {
    form.hidden = true;
    form.reset();
  }

  $('btnNuevo').addEventListener('click', () => abrirForm());
  $('btnCancelar').addEventListener('click', cerrarForm);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = datosFormulario(form);
    const id = $('usuarioId').value;
    const r = await enviando(form, () => (id ? AuthController.editarUsuario(id, d) : AuthController.crearUsuario(d)));
    if (!r) return;
    if (!r.ok) {
      mostrarErrores(form, r.errores || {});
      if (!r.errores) toast(r.mensaje, 'error');
      return;
    }
    toast(id ? 'Usuario actualizado.' : 'Usuario creado.');
    cerrarForm();
    await renderTabla();
  });

  // DOM traversing: el clic puede caer en el botón o en algo dentro de él.
  // closest() sube hasta el <button> y, desde ahí, hasta la <tr> (la fila) que lo contiene.
  $('tablaUsuarios').addEventListener('click', async (e) => {
    const boton = e.target.closest('button[data-editar], button[data-eliminar]');
    if (!boton) return;
    const fila = boton.closest('tr');
    const idEditar = boton.dataset.editar;
    const idEliminar = boton.dataset.eliminar;
    if (idEditar) {
      // parentElement.children = todas las filas hermanas: resaltamos solo la actual
      Array.from(fila.parentElement.children).forEach((f) => f.classList.toggle('fila-activa', f === fila));
      abrirForm(buscar(idEditar));
    }
    if (idEliminar) {
      const u = buscar(idEliminar);
      if (!u) return;
      if (!confirm(`¿Seguro que deseas eliminar a ${u.nombre} (${u.username})? Esta acción no se puede deshacer.`)) return;
      boton.disabled = true;
      try {
        const r = await AuthController.eliminarUsuario(idEliminar);
        if (!r.ok) { toast(r.mensaje, 'error'); boton.disabled = false; return; }
      } catch (err) {
        toast(err.message, 'error');
        boton.disabled = false;
        return;
      }
      toast('Usuario eliminado.');
      await renderTabla();
    }
  });

  await renderTabla();
});
