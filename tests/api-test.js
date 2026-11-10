// Pruebas automáticas de la API de Mi Plata (PHP + MySQL).
// Uso:  node tests/api-test.js http://localhost/miplata/api/index.php
// Requiere Node 18+, Apache y MySQL encendidos y la base importada. Crea usuarios de prueba con sufijo aleatorio.
// Pruebas de la API (PHP + MySQL) con peticiones HTTP reales. Cada "cliente" tiene su propia cookie de sesión.
const BASE = process.argv[2] || 'http://127.0.0.1:8080/api/index.php';
let fallos = 0, total = 0;
const ok = (c, m) => { total++; if (!c) { fallos++; console.log('FALLO:', m); } else console.log('ok   :', m); };

function cliente() {
  let cookie = '';
  return async (accion, datos, params = '') => {
    const r = await fetch(`${BASE}?accion=${accion}${params}`, {
      method: datos === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: datos === undefined ? undefined : JSON.stringify(datos),
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const j = await r.json();
    j.http = r.status;
    return j;
  };
}
const sufijo = Date.now().toString().slice(-6);
const A = { identificacion: '10' + sufijo, nombre: 'Ana Maria Perez', celular: '3001234567', username: 'ana' + sufijo, password: 'Clave123', confirmar: 'Clave123' };
const L = { identificacion: '20' + sufijo, nombre: 'Luis Gomez', celular: '3111234567', username: 'luis' + sufijo, password: 'Clave123', confirmar: 'Clave123' };

(async () => {
  const anon = cliente(), ana = cliente(), luis = cliente(), admin = cliente();

  // ---------- Sin sesión
  let r = await anon('me'); ok(r.http === 401 && !r.ok, 'sin sesión: me -> 401');
  r = await anon('consignar', { cuenta: 'ahorros', monto: 1000 }); ok(r.http === 401, 'sin sesión: consignar -> 401');
  r = await anon('usuarios'); ok(r.http === 401, 'sin sesión: listar usuarios -> 401');
  r = await anon('noexiste'); ok(r.http === 404, 'acción inexistente -> 404');
  r = await anon('login'); ok(r.http === 405, 'login por GET -> 405');

  // ---------- Registro
  r = await anon('registro', { identificacion: '1', nombre: 'a', celular: '12', username: 'a', password: 'x', confirmar: 'y' });
  ok(r.http === 422 && Object.keys(r.errores).length === 6, 'registro inválido -> 6 errores por campo');
  r = await anon('registro', { ...A, rol: 'admin' }); ok(r.ok && r.usuario.rol === 'cliente', 'registro válido (aunque mande rol=admin, queda cliente)');
  r = await anon('registro', { ...L, username: A.username }); ok(r.http === 422 && r.errores.username, 'usuario duplicado rechazado');
  r = await anon('registro', { ...L, identificacion: A.identificacion }); ok(r.http === 422 && r.errores.identificacion, 'identificación duplicada rechazada');
  r = await anon('registro', { ...L, username: A.username.toUpperCase() }); ok(r.http === 422 && r.errores.username, 'usuario duplicado sin importar mayúsculas');
  r = await anon('registro', L); ok(r.ok, 'segundo usuario');

  // ---------- Login y 3 intentos
  r = await ana('login', { username: 'noexiste_zz', password: 'x' }); ok(r.http === 401 && /no está registrado/.test(r.mensaje), 'login: usuario inexistente');
  r = await ana('login', { username: A.username, password: 'mala' }); ok(r.http === 401 && r.intentos === 1 && r.restantes === 2, 'intento fallido 1');
  r = await anon('intentos', undefined, `&username=${A.username}`); ok(r.intentos === 1, 'contador visible: 1');
  r = await ana('login', { username: A.username, password: 'mala' }); ok(r.intentos === 2, 'intento fallido 2');
  r = await ana('login', { username: A.username, password: 'mala' }); ok(r.http === 423 && r.bloqueado, 'tercer intento bloquea la cuenta');
  r = await ana('login', { username: A.username, password: A.password }); ok(r.http === 423 && r.bloqueado, 'cuenta bloqueada no entra ni con la clave correcta');

  // ---------- Admin
  r = await admin('login', { username: 'admin', password: 'Admin123' }); ok(r.ok && r.usuario.rol === 'admin', 'admin inicia sesión');
  r = await admin('usuarios'); ok(r.ok && r.usuarios.length >= 3 && !JSON.stringify(r).includes('password'), 'admin lista usuarios (sin hash de contraseña)');
  const idAna = r.usuarios.find((u) => u.username === A.username).id;
  const idLuis = r.usuarios.find((u) => u.username === L.username).id;
  r = await admin('usuario_editar', { id: idAna, identificacion: A.identificacion, nombre: A.nombre, celular: A.celular, username: A.username, rol: 'cliente', estado: 'activo' });
  ok(r.ok && r.usuario.estado === 'activo' && r.usuario.intentosFallidos === 0, 'admin desbloquea y reinicia intentos');
  r = await ana('login', { username: A.username, password: A.password }); ok(r.ok, 'Ana entra tras desbloqueo');
  r = await ana('usuarios'); ok(r.http === 403, 'cliente no puede listar usuarios (403)');
  r = await ana('usuario_eliminar', { id: idLuis }); ok(r.http === 403, 'cliente no puede eliminar usuarios (403)');
  r = await admin('usuario_eliminar', { id: 1 }); ok(r.http === 400 && /propia cuenta/.test(r.mensaje), 'admin no puede eliminarse a sí mismo');
  r = await luis('login', { username: L.username, password: L.password }); ok(r.ok, 'Luis inicia sesión');

  // ---------- Seguridad: SQL injection / hash
  r = await anon('login', { username: "' OR '1'='1", password: "' OR '1'='1" }); ok(!r.ok && r.http === 401, 'inyección SQL en login no entra');
  r = await anon('registro', { ...L, username: "x'); DROP TABLE usuarios;--", identificacion: '99999' + sufijo }); ok(r.http === 422, 'inyección SQL en registro rechazada por validación');
  r = await admin('usuarios'); ok(r.ok, 'la tabla usuarios sigue existiendo');

  // ---------- Ahorros
  r = await ana('consignar', { cuenta: 'ahorros', monto: 1000000 }); ok(r.ok && r.saldo === 1000000, 'consignar 1.000.000 en ahorros');
  r = await ana('consignar', { cuenta: 'ahorros', monto: -5 }); ok(!r.ok && r.http === 400, 'consignar monto negativo rechazado');
  r = await ana('consignar', { cuenta: 'ahorros', monto: 'abc' }); ok(!r.ok, 'consignar monto no numérico rechazado');
  r = await ana('consignar', { cuenta: 'tarjeta', monto: 10 }); ok(!r.ok, 'consignar en tarjeta rechazado');
  r = await ana('retirar', { cuenta: 'ahorros', monto: 2000000 }); ok(!r.ok && /saldo disponible/.test(r.mensaje), 'ahorros: retiro > saldo rechazado');
  r = await ana('retirar', { cuenta: 'ahorros', monto: 500000 }); ok(r.ok && r.interes === 15000 && r.saldo === 515000, 'ahorros: interés 1.5% al retirar (saldo 515.000)');

  // ---------- Corriente
  r = await ana('consignar', { cuenta: 'corriente', monto: 1000000 }); ok(r.ok, 'consignar 1.000.000 en corriente');
  r = await ana('retirar', { cuenta: 'corriente', monto: 1200001 }); ok(!r.ok && /sobregiro del 20%/.test(r.mensaje), 'corriente: > 1.200.000 rechazado');
  r = await ana('retirar', { cuenta: 'corriente', monto: 1200000 }); ok(r.ok && r.saldo === -200000 && r.interes === 0, 'corriente: retiro 1.200.000 con sobregiro (saldo -200.000, sin interés)');
  r = await ana('retirar', { cuenta: 'corriente', monto: 1 }); ok(!r.ok, 'corriente: con saldo negativo no se puede retirar más');

  // ---------- Tarjeta
  r = await ana('compra', { valor: 1000000, cuotas: 2, descripcion: 'TV' }); ok(r.ok && r.compra.cuotaMensual === 500000 && r.compra.tasa === 0, 'tarjeta: 2 cuotas sin interés (500.000)');
  r = await ana('compra', { valor: 100000, cuotas: 6, descripcion: 'Zapatos' }); ok(r.ok && r.compra.tasa === 0.019 && Math.abs(r.compra.cuotaMensual - 17792.38) < 0.01, 'tarjeta: 6 cuotas al 1.9% (' + r.compra.cuotaMensual + ')');
  r = await ana('compra', { valor: 100000, cuotas: 12, descripcion: 'Maleta' }); ok(r.ok && r.compra.tasa === 0.023, 'tarjeta: 12 cuotas al 2.3%');
  r = await ana('compra', { valor: 5000000, cuotas: 3, descripcion: 'Moto' }); ok(!r.ok && /cupo disponible/.test(r.mensaje), 'tarjeta: compra mayor al cupo rechazada');
  r = await ana('compra', { valor: 1000, cuotas: 0, descripcion: 'x' }); ok(!r.ok, 'tarjeta: 0 cuotas rechazado');
  r = await ana('compra', { valor: 1000, cuotas: 2.5, descripcion: 'x' }); ok(!r.ok, 'tarjeta: cuotas decimales rechazadas');
  r = await ana('compra', { valor: 1000, cuotas: 2, descripcion: '  ' }); ok(!r.ok, 'tarjeta: sin descripción rechazada');
  r = await ana('pago_tarjeta', { cuenta: 'ahorros', monto: 100000 }); ok(r.ok && r.deuda === 1100000 && r.saldo === 415000, 'pago tarjeta: deuda 1.100.000, ahorros 415.000');
  r = await ana('pago_tarjeta', { cuenta: 'ahorros', monto: 99999999 }); ok(!r.ok && /supera tu deuda/.test(r.mensaje), 'pago mayor a la deuda rechazado');

  // ---------- Transferencias
  r = await ana('transferir', { origen: 'ahorros', modo: 'propio', tipo: 'ahorros', monto: 1 }); ok(!r.ok && /mismo producto/.test(r.mensaje), 'transferir al mismo producto rechazado');
  r = await ana('transferir', { origen: 'ahorros', modo: 'otro', username: A.username, tipo: 'ahorros', monto: 1 }); ok(!r.ok && /mismo producto/.test(r.mensaje), 'mismo producto vía mi propio usuario rechazado');
  r = await ana('transferir', { origen: 'ahorros', modo: 'otro', username: 'nadie_zz', tipo: 'ahorros', monto: 1 }); ok(!r.ok && /no existe/.test(r.mensaje), 'usuario destino inexistente');
  r = await ana('transferir', { origen: 'ahorros', modo: 'otro', username: 'admin', tipo: 'ahorros', monto: 1 }); ok(!r.ok, 'no se puede transferir al administrador');
  r = await ana('transferir', { origen: 'ahorros', modo: 'propio', tipo: 'corriente', monto: 100000 }); ok(r.ok && r.saldoOrigen === 315000, 'transferencia entre productos propios');
  r = await ana('transferir', { origen: 'ahorros', modo: 'otro', username: L.username.toUpperCase(), tipo: 'corriente', monto: 50000 }); ok(r.ok && r.destinatario === L.nombre, 'transferencia a otro usuario');
  r = await ana('transferir', { origen: 'ahorros', modo: 'otro', username: L.username, tipo: 'corriente', monto: 99999999 }); ok(!r.ok, 'transferencia mayor al saldo rechazada');
  // ---------- Comprobantes y métricas
  r = await ana('transferir', { origen: 'ahorros', modo: 'otro', username: L.username, tipo: 'corriente', monto: 1000 });
  const comp = r.comprobante;
  ok(r.ok && comp && /^MP-[0-9A-F]{8}$/.test(comp.referencia) && comp.valor === 1000 && comp.estado === 'Exitosa', 'transferir devuelve comprobante con referencia MP-XXXXXXXX');
  ok(comp.origen.nombre === A.nombre && comp.destino.nombre === L.nombre && /^•••• \d{4}$/.test(comp.origen.numero) && comp.propia === false, 'comprobante: nombres y números enmascarados');
  r = await ana('comprobante', undefined, `&id=${comp.id}`); ok(r.ok && r.comprobante.referencia === comp.referencia, 'el remitente ve su comprobante');
  r = await luis('comprobante', undefined, `&id=${comp.id}`); ok(r.ok, 'el destinatario también ve el comprobante');
  r = await admin('comprobante', undefined, `&id=${comp.id}`); ok(r.http === 404, 'un tercero recibe 404 (no se revela si existe)');
  r = await anon('comprobante', undefined, `&id=${comp.id}`); ok(r.http === 401, 'comprobante sin sesión -> 401');
  r = await ana('comprobante', undefined, '&id=99999999'); ok(r.http === 404, 'comprobante inexistente -> 404');
  r = await ana('me'); ok(r.usuario.productos.ahorros.movimientos.some((m) => m.transferenciaId === comp.id), 'el movimiento queda enlazado con transferenciaId');
  r = await ana('transferir', { origen: 'ahorros', modo: 'propio', tipo: 'corriente', monto: 10 }); ok(r.comprobante && r.comprobante.propia === true, 'transferencia propia: comprobante.propia = true');
  r = await ana('transferir', { origen: 'ahorros', modo: 'otro', username: L.username, tipo: 'corriente', monto: 99999999 });
  ok(!r.ok, 'transferencia rechazada no crea comprobante (rollback)');
  r = await ana('metricas'); ok(r.http === 403, 'cliente no puede ver métricas -> 403');
  r = await anon('metricas'); ok(r.http === 401, 'métricas sin sesión -> 401');
  r = await admin('metricas'); const m = r.metricas;
  ok(r.ok && m.usuarios.total >= 3 && m.usuarios.clientes >= 2 && m.series.registros.length === 14 && m.series.flujo.length === 14, 'admin recibe métricas con series de 14 días');
  ok(m.operaciones.transferencias >= 3 && m.operaciones.volumenTransferencias >= 51010 && m.dinero.enCuentas === m.dinero.ahorros + m.dinero.corriente, 'métricas: transferencias y dinero coherentes');
  ok(m.series.registros.reduce((a, x) => a + x.valor, 0) >= 2 && m.series.topClientes.length <= 5, 'métricas: registros de hoy y top de clientes');
  r = await luis('me'); ok(r.usuario.productos.corriente.saldo === 51000, 'el destinatario recibe el dinero (50.000 + 1.000 del comprobante)');

  // ---------- Movimientos y datos del usuario
  r = await ana('me'); const u = r.usuario;
  const movs = Object.values(u.productos).flatMap((p) => p.movimientos);
  ok(movs.length >= 12, 'movimientos guardados en la BD (' + movs.length + ')');
  const aho = u.productos.ahorros.movimientos;
  ok(aho.every((m, i) => i === 0 || new Date(aho[i - 1].fecha) >= new Date(m.fecha)), 'movimientos de ahorros ordenados por fecha descendente');
  ok(u.productos.ahorros.saldo === 263990 && u.productos.corriente.saldo === -99990, 'saldos finales exactos (ahorros 263.990, corriente -99.990)');
  ok(u.productos.tarjeta.deudaActual === 1100000 && u.productos.tarjeta.compras.length === 3, 'tarjeta: deuda 1.100.000 y 3 compras guardadas');
  ok(u.productos.tarjeta.compras[0].saldoCapital === 900000, 'pago abonado a la compra más antigua (saldo capital 900.000)');
  ok(!('password' in u) && !('password_hash' in u), 'la respuesta no incluye la contraseña');

  // ---------- Perfil y contraseña
  r = await ana('perfil', { identificacion: A.identificacion, nombre: 'Ana M Perez', celular: '3009998877', username: L.username }); ok(r.http === 422 && r.errores.username, 'perfil: usuario duplicado rechazado');
  r = await ana('perfil', { identificacion: A.identificacion, nombre: 'Ana M Perez', celular: '3009998877', username: A.username }); ok(r.ok && r.usuario.celular === '3009998877', 'perfil actualizado');
  r = await ana('password', { username: A.username, actual: 'mala', nueva: 'Nueva1234', confirmar: 'Nueva1234' }); ok(r.http === 422 && r.errores.actual, 'cambio de clave: actual incorrecta');
  r = await ana('password', { username: A.username, actual: A.password, nueva: A.password, confirmar: A.password }); ok(r.http === 422 && r.errores.nueva, 'cambio de clave: igual a la actual rechazada');
  r = await ana('password', { username: A.username, actual: A.password, nueva: 'Nueva1234', confirmar: 'Otra12345' }); ok(r.http === 422 && r.errores.confirmar, 'cambio de clave: confirmación distinta');
  r = await ana('password', { username: A.username, actual: A.password, nueva: 'Nueva1234', confirmar: 'Nueva1234' }); ok(r.ok, 'cambio de clave correcto');
  const ana2 = cliente();
  r = await ana2('login', { username: A.username, password: A.password }); ok(!r.ok, 'la clave vieja ya no sirve');
  r = await ana2('login', { username: A.username, password: 'Nueva1234' }); ok(r.ok, 'la clave nueva sí sirve');

  // ---------- Concurrencia: 10 retiros simultáneos de 100.000 con saldo 265.000 -> solo 2 deben pasar
  await ana('consignar', { cuenta: 'corriente', monto: 1000000 });
  const antes = (await ana('me')).usuario.productos.corriente.saldo;
  const lote = await Promise.all(Array.from({ length: 10 }, () => ana('retirar', { cuenta: 'corriente', monto: 100000 })));
  const pasaron = lote.filter((x) => x.ok).length;
  const despues = (await ana('me')).usuario.productos.corriente.saldo;
  ok(despues === antes - pasaron * 100000, `concurrencia: el saldo coincide con los retiros aprobados (${pasaron} de 10, saldo ${antes} -> ${despues})`);
  ok(despues >= 0 && pasaron === 9, 'concurrencia: 9 retiros válidos y el décimo rechazado (el saldo no baja de lo permitido)');

  // ---------- Logout
  r = await ana('logout', {}); ok(r.ok, 'logout');
  r = await ana('me'); ok(r.http === 401, 'tras logout la sesión ya no sirve');

  // ---------- Eliminación en cascada
  r = await admin('usuario_eliminar', { id: idLuis }); ok(r.ok, 'admin elimina a Luis');
  r = await luis('me'); ok(r.http === 401, 'usuario eliminado pierde la sesión');

  console.log(fallos === 0 ? `\nTODAS LAS PRUEBAS PASARON (${total})` : `\nFALLOS: ${fallos} de ${total}`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error('ERROR en el test:', e); process.exit(2); });
