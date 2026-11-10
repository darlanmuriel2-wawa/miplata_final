# Mi Plata – Banco digital

Trabajo de clase en **JavaScript puro** (HTML + CSS + JS, sin frameworks) con **API en PHP** y base de datos **MySQL** (XAMPP).

## Instalación en XAMPP (paso a paso)

1. Instala **XAMPP** y, en el panel de control, enciende **Apache** y **MySQL**.
2. Copia esta carpeta dentro de `C:\xampp\htdocs\` y renómbrala a **`miplata`** (puedes usar otro nombre; la URL cambia igual).
3. Crea la base de datos: abre <http://localhost/phpmyadmin> → pestaña **Importar** → **Seleccionar archivo** → `database/miplata.sql` → **Importar**.
4. Abre **<http://localhost/miplata/>** en el navegador.
5. Entra como administrador: usuario **`admin`**, contraseña **`Admin123`** (o regístrate como cliente).

> Abre siempre el sitio desde `http://localhost/...`. Si haces doble clic en `index.html` o usas Live Server, el navegador no puede hablar con PHP y verás el aviso "No se pudo conectar con el servidor".

> **¿Ya tenías la versión anterior (v3) instalada?** No borres nada: en phpMyAdmin selecciona la base `miplata` → **Importar** → `database/actualizar_v3_a_v4.sql` (se ejecuta **una sola vez**; conserva tus usuarios y movimientos y agrega la tabla de comprobantes).

### Novedades de la v4
- **Extracto de movimientos:** filtra por producto, tipo (entradas/salidas) y rango de fechas (con botones Hoy, 7 días, 30 días, Este mes). Muestra totales y permite **descargar CSV** (abre en Excel) o **imprimir / guardar PDF**.
- **Comprobante de transferencia:** al transferir aparece un comprobante con referencia única (`MP-XXXXXXXX`), nombres, productos (números enmascarados) y valor. Se puede imprimir/guardar en PDF y reabrir después desde el extracto. Lo ven solo quien envió y quien recibió.
- **Métricas del administrador:** pestaña *Métricas* con usuarios, dinero en cuentas, deuda de tarjetas, transferencias y gráficas SVG (consignaciones vs. retiros, usuarios nuevos, dinero por cuenta, movimientos por tipo y top 5 de clientes).

### Si algo falla
| Síntoma | Causa y solución |
|---|---|
| "No se pudo conectar con el servidor" | Apache apagado, o abriste el archivo con doble clic. Enciende Apache y entra por `http://localhost/miplata/`. |
| "No se pudo usar la base de datos…" | MySQL apagado, o falta importar `database/miplata.sql`. |
| Sigue fallando la conexión a MySQL | Si le pusiste contraseña a `root`, escríbela en `api/config.php` (`'pass'`). Pon `MIPLATA_DEBUG` en `1` para ver el detalle. |
| Quiero empezar de cero | Vuelve a importar `database/miplata.sql` (borra y recrea las tablas). |
| Usar Live Server (puerto 5500) | Antes de los scripts, agrega `<script>window.MIPLATA_API_URL='http://localhost/miplata/api/index.php'</script>` y abre Live Server como `http://localhost:5500`. |

## Arquitectura
```
Vista (HTML + app.js / dashboardApp.js / adminApp.js / ui.js)
   ↓ llama (await)
Controladores JS (AuthController, BankController)      ← validan el formato y llaman a la API
   ↓
ApiClient.js ── fetch (JSON, cookie de sesión) ──►  api/index.php  (enrutador)
                                                       ↓
                              Controladores PHP (Auth, Usuario, Bank)   ← reglas de negocio
                                                       ↓
                                  Repositorio.php + Reglas.php + Database.php (PDO)
                                                       ↓
                                                    MySQL
```
**Regla de oro:** el navegador solo muestra y valida el formato; las reglas del dinero se aplican en el **servidor**. Aunque alguien altere el JavaScript, el banco sigue cumpliendo sus reglas.

## Estructura
```
miplata/
├── index.html                  Landing: mega-menú, carrusel, simulador, FAQ
├── css/styles.css              Sistema de diseño (tema claro/oscuro)
├── img/                        Fotos de las tarjetas de "¿Qué quieres hacer hoy?"
├── database/miplata.sql        Esquema MySQL + administrador inicial (instalación nueva)
├── database/actualizar_v3_a_v4.sql   Migración para quien ya tenía la v3
├── api/                        Backend PHP (PDO)
│   ├── index.php               Enrutador: ?accion=login, ?accion=retirar...
│   ├── config.php              Datos de conexión (valores de XAMPP)
│   ├── Database.php            Conexión PDO y transacciones
│   ├── Reglas.php              Intereses, sobregiro, cuotas (fuente de verdad)
│   ├── Repositorio.php         Consultas SQL de usuarios y productos
│   ├── Util.php                Errores, respuestas JSON, sesión y validaciones
│   └── controllers/            AuthController, UsuarioController, BankController, MetricasController
├── view/                       auth.html, dashboard.html, admin-users.html
├── js/
│   ├── app.js  ui.js           Utilidades, login/registro, tema, carrusel, FAQ...
│   ├── dashboardApp.js         Panel del cajero (incluye gráfica SVG)
│   ├── adminApp.js             CRUD de usuarios
│   ├── adminMetricas.js        Pestaña de métricas del administrador
│   ├── charts.js               Gráficas SVG hechas a mano (barras, dona, horizontales)
│   ├── documentos.js           CSV, extracto y comprobante imprimibles
│   ├── data/ApiClient.js       fetch + manejo de errores
│   └── models/                 Cuenta, CuentaAhorros, CuentaCorriente, TarjetaCredito, Usuario, Transaccion
├── controllers/                AuthController.js, BankController.js (cliente de la API)
├── tests/api-test.js           Pruebas automáticas de la API (opcional, requiere Node)
└── docs/                       UML e historias de usuario
```

## Base de datos
```
usuarios ─┬─< productos ─┬─< movimientos >─ transferencias
          │              └─< compras_tarjeta
          └─────────────────────────────────< transferencias (origen y destino)
```
- **usuarios:** identificación, nombre, celular, usuario (únicos), `password_hash`, rol, estado e intentos fallidos.
- **productos:** cada usuario tiene uno de cada tipo (`ahorros`, `corriente`, `tarjeta`) con su número, saldo, cupo y deuda.
- **movimientos:** fecha, tipo, sentido (entrada/salida), valor y descripción de cada operación.
- **transferencias:** el comprobante: referencia única, fecha, valor y una "foto" de quién envió a quién (nombres y productos). Si se borra un usuario, el comprobante se conserva (`ON DELETE SET NULL`).
- **compras_tarjeta:** capital, cuotas, tasa, cuota mensual y saldo pendiente de cada compra.
- Las llaves foráneas usan `ON DELETE CASCADE`: al eliminar un usuario se borra todo lo suyo.

## Reglas de negocio (se aplican en `api/`)
- **Ahorros:** el retiro no puede superar el saldo. Al retirar se abona el 1.5% mensual como movimiento "interés" y luego se descuenta el retiro.
- **Corriente:** sin intereses. Se puede retirar hasta saldo × 1.2 (con $1.000.000 → $1.200.000).
- **Tarjeta:** cupo $3.000.000. Cuotas ≤ 2 → 0%, 3–6 → 1.9%, ≥ 7 → 2.3% mensual. Cuota = (Capital × tasa) / (1 − (1 + tasa)^−n).
- **Transferencias:** entre productos propios o a otro usuario; nunca al mismo producto.
- **Login:** 3 intentos fallidos bloquean la cuenta; el contador es visible. El administrador desbloquea.

## Seguridad aplicada
- Contraseñas guardadas con **hash** (`password_hash` / `password_verify`), nunca en texto plano.
- **Consultas preparadas** con PDO: protege contra inyección SQL.
- **Sesión en el servidor** (cookie `HttpOnly`); los permisos (cliente / administrador) se verifican en cada petición.
- **Transacciones SQL** con bloqueo de filas (`SELECT … FOR UPDATE`): dos operaciones simultáneas no dejan saldos incorrectos.
- El servidor ignora el rol que mande el navegador al registrarse (siempre es `cliente`).

## Conceptos de front-end que usa el proyecto
| Concepto | Dónde verlo |
|---|---|
| **fetch + async/await + promesas** | `js/data/ApiClient.js`, `controllers/*.js`, `dashboardApp.js` |
| **DOM traversing** (`closest`, `parentElement`, `children`, `nextElementSibling`…) | `js/ui.js`, `dashboardApp.js`, `adminApp.js` |
| **Delegación de eventos** | `ui.js`, `dashboardApp.js`, `adminApp.js` |
| **Variables CSS y temas** | `css/styles.css` |
| **IntersectionObserver** | `ui.js` |
| **SVG generado con JS** | `dashboardApp.js → renderGrafica()`, `js/charts.js` |
| **`<dialog>` nativo, Blob y descarga de archivos, impresión con iframe** | `dashboard.html`, `js/documentos.js` |
| **Agregaciones SQL** (`COUNT`, `SUM`, `GROUP BY`) | `api/controllers/MetricasController.php` |
| **Debounce** (esperar antes de consultar al servidor) | `app.js` (contador de intentos) |
| **Herencia y polimorfismo** | `CuentaAhorros` y `CuentaCorriente` extienden `Cuenta` |

## API (resumen)
| Acción | Método | Quién |
|---|---|---|
| `registro`, `login`, `intentos` | POST / POST / GET | público |
| `me`, `logout`, `perfil`, `password` | GET / POST | usuario con sesión |
| `consignar`, `retirar`, `transferir`, `compra`, `pago_tarjeta` | POST | cliente con sesión |
| `comprobante?id=N` | GET | solo quien envió o recibió |
| `metricas` | GET | solo administrador |
| `usuarios`, `usuario_crear`, `usuario_editar`, `usuario_eliminar` | GET / POST | solo administrador |

Todas las respuestas son JSON: `{ "ok": true, ... }` o `{ "ok": false, "mensaje": "...", "errores": { "campo": "..." } }`.

## Pruebas (opcional)
Con Apache y MySQL encendidos y Node instalado: `node tests/api-test.js http://localhost/miplata/api/index.php` ejecuta 90 verificaciones de las reglas del banco, permisos, seguridad y concurrencia.
