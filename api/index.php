<?php
/**
 * Punto de entrada único de la API (patrón "front controller").
 * El navegador llama:  api/index.php?accion=login   (con fetch)
 * Este archivo decide qué controlador y qué método ejecutar.
 */
require __DIR__ . '/Database.php';
require __DIR__ . '/Util.php';
require __DIR__ . '/Reglas.php';
require __DIR__ . '/Repositorio.php';
require __DIR__ . '/controllers/AuthController.php';
require __DIR__ . '/controllers/UsuarioController.php';
require __DIR__ . '/controllers/BankController.php';
require __DIR__ . '/controllers/MetricasController.php';

// Los errores de PHP no se imprimen (romperían el JSON); se guardan en el log de Apache.
ini_set('display_errors', '0');

Http::cors();
Sesion::iniciar();

// accion => [método HTTP permitido, clase, método]
$rutas = [
    // Autenticación
    'registro'         => ['POST', 'AuthController', 'registrar'],
    'login'            => ['POST', 'AuthController', 'login'],
    'logout'           => ['POST', 'AuthController', 'logout'],
    'me'               => ['GET',  'AuthController', 'me'],
    'intentos'         => ['GET',  'AuthController', 'intentos'],
    'perfil'           => ['POST', 'AuthController', 'perfil'],
    'password'         => ['POST', 'AuthController', 'password'],
    // Administración de usuarios (CRUD)
    'usuarios'         => ['GET',  'UsuarioController', 'listar'],
    'usuario_crear'    => ['POST', 'UsuarioController', 'crear'],
    'usuario_editar'   => ['POST', 'UsuarioController', 'editar'],
    'usuario_eliminar' => ['POST', 'UsuarioController', 'eliminar'],
    'metricas'         => ['GET',  'MetricasController', 'resumen'],
    // Cajero
    'consignar'        => ['POST', 'BankController', 'consignar'],
    'retirar'          => ['POST', 'BankController', 'retirar'],
    'transferir'       => ['POST', 'BankController', 'transferir'],
    'comprobante'      => ['GET',  'BankController', 'comprobante'],
    'compra'           => ['POST', 'BankController', 'compra'],
    'pago_tarjeta'     => ['POST', 'BankController', 'pagoTarjeta'],
];

try {
    $accion = isset($_GET['accion']) ? $_GET['accion'] : '';
    if (!isset($rutas[$accion])) {
        throw new ApiError('Acción no encontrada.', 404);
    }
    list($metodo, $clase, $funcion) = $rutas[$accion];
    if ($_SERVER['REQUEST_METHOD'] !== $metodo) {
        throw new ApiError('Método no permitido.', 405);
    }
    Http::json(call_user_func([$clase, $funcion]));

} catch (ApiError $e) {
    $respuesta = ['ok' => false, 'mensaje' => $e->getMessage()];
    if ($e->errores) {
        $respuesta['errores'] = $e->errores;
    }
    Http::json(array_merge($respuesta, $e->extra), $e->http);

} catch (PDOException $e) {
    error_log('[MiPlata] BD: ' . $e->getMessage());
    $mensaje = 'No se pudo usar la base de datos. Verifica que MySQL esté encendido en XAMPP y que importaste database/miplata.sql.';
    if (Config::get('debug')) {
        $mensaje .= ' (' . $e->getMessage() . ')';
    }
    Http::json(['ok' => false, 'mensaje' => $mensaje], 500);

} catch (Throwable $e) {
    error_log('[MiPlata] ' . $e->getMessage() . ' en ' . $e->getFile() . ':' . $e->getLine());
    $mensaje = 'Ocurrió un error inesperado en el servidor.';
    if (Config::get('debug')) {
        $mensaje .= ' (' . $e->getMessage() . ')';
    }
    Http::json(['ok' => false, 'mensaje' => $mensaje], 500);
}
