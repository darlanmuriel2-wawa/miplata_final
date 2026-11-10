<?php
/**
 * Utilidades compartidas: errores de la API, respuestas JSON, sesión y validaciones.
 */

/** Error "esperado" (validación, regla de negocio, permisos...). Se responde como JSON. */
class ApiError extends Exception
{
    public $http;
    public $errores;
    public $extra;

    public function __construct($mensaje, $http = 400, $errores = null, $extra = [])
    {
        parent::__construct($mensaje);
        $this->http = $http;
        $this->errores = $errores;   // errores por campo: ['username' => 'mensaje', ...]
        $this->extra = $extra;       // datos adicionales (intentos, bloqueado...)
    }
}

class Http
{
    public static function json($datos, $codigo = 200)
    {
        http_response_code($codigo);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /** Cuerpo de la petición: JSON (fetch) o formulario clásico. */
    public static function entrada()
    {
        static $cache = null;
        if ($cache === null) {
            $json = json_decode(file_get_contents('php://input'), true);
            $cache = is_array($json) ? $json : $_POST;
        }
        return $cache;
    }

    /** Texto limpio (sin espacios a los lados) de un campo. */
    public static function texto($datos, $clave)
    {
        return (isset($datos[$clave]) && is_scalar($datos[$clave])) ? trim((string)$datos[$clave]) : '';
    }

    /** Valor tal cual (para contraseñas: no se recortan espacios). */
    public static function crudo($datos, $clave)
    {
        return (isset($datos[$clave]) && is_string($datos[$clave])) ? $datos[$clave] : '';
    }

    /** Aplica CORS solo para los orígenes permitidos en config.php (modo Live Server). */
    public static function cors()
    {
        $origen = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
        if ($origen !== '' && in_array($origen, Config::get('cors_origins'), true)) {
            header('Access-Control-Allow-Origin: ' . $origen);
            header('Access-Control-Allow-Credentials: true');
            header('Access-Control-Allow-Headers: Content-Type');
            header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
            header('Vary: Origin');
        }
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}

class Sesion
{
    public static function iniciar()
    {
        if (session_status() === PHP_SESSION_NONE) {
            session_name('MIPLATASESSID');
            session_set_cookie_params([
                'path'     => '/',
                'httponly' => true,    // JavaScript no puede leer la cookie
                'samesite' => 'Lax',
            ]);
            session_start();
        }
    }

    public static function iniciarParaUsuario($id)
    {
        session_regenerate_id(true);   // evita la fijación de sesión
        $_SESSION['uid'] = (int)$id;
    }

    public static function cerrar()
    {
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
    }

    /** Devuelve la fila del usuario con sesión válida o lanza 401. */
    public static function requerir()
    {
        $id = isset($_SESSION['uid']) ? (int)$_SESSION['uid'] : 0;
        $u = $id ? Repositorio::usuarioPorId($id) : null;
        if (!$u || $u['estado'] !== 'activo') {
            self::cerrar();
            throw new ApiError('Sesión no válida. Inicia sesión de nuevo.', 401);
        }
        return $u;
    }

    public static function requerirAdmin()
    {
        $u = self::requerir();
        if ($u['rol'] !== 'admin') {
            throw new ApiError('Solo un administrador puede hacer esto.', 403);
        }
        return $u;
    }
}

class Validador
{
    public static function password($clave)
    {
        return (bool)preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/', $clave);
    }

    public static function mensajePassword()
    {
        return 'Mínimo 8 caracteres con mayúscula, minúscula y número.';
    }

    /**
     * Valida los datos de un usuario (las mismas reglas del front).
     * Devuelve un arreglo ['campo' => 'mensaje'] (vacío si todo está bien).
     */
    public static function datosUsuario($d, $idActual = null, $passwordObligatoria = true)
    {
        $e = [];
        $ident = Http::texto($d, 'identificacion');
        $nombre = preg_replace('/\s+/u', ' ', Http::texto($d, 'nombre'));
        $celular = Http::texto($d, 'celular');
        $username = Http::texto($d, 'username');

        if (!preg_match('/^[A-Za-z0-9]{5,15}$/', $ident)) {
            $e['identificacion'] = 'Cédula o pasaporte: entre 5 y 15 letras o números, sin espacios.';
        } elseif (Repositorio::existeValor('identificacion', $ident, $idActual)) {
            $e['identificacion'] = 'Ya existe un usuario con esa identificación.';
        }

        if (!preg_match('/^\p{L}+(\s\p{L}+)+$/u', $nombre) || mb_strlen($nombre) < 5 || mb_strlen($nombre) > 100) {
            $e['nombre'] = 'Escribe tu nombre completo (nombre y apellido, solo letras).';
        }

        if (!preg_match('/^3\d{9}$/', $celular)) {
            $e['celular'] = 'El celular debe tener 10 dígitos y empezar por 3.';
        }

        if (!preg_match('/^[A-Za-z0-9_.]{4,20}$/', $username)) {
            $e['username'] = 'Usuario de 4 a 20 caracteres: letras, números, punto o guion bajo.';
        } elseif (Repositorio::existeValor('username', $username, $idActual)) {
            $e['username'] = 'Ese nombre de usuario ya está en uso.';
        }

        $clave = Http::crudo($d, 'password');
        if ($clave !== '' || $passwordObligatoria) {
            if (!self::password($clave)) {
                $e['password'] = self::mensajePassword();
            }
            if (array_key_exists('confirmar', $d) && Http::crudo($d, 'confirmar') !== $clave) {
                $e['confirmar'] = 'Las contraseñas no coinciden.';
            }
        }
        return $e;
    }
}
