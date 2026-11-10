<?php
/**
 * Registro, inicio de sesión (3 intentos), sesión actual, perfil y contraseña.
 */
class AuthController
{
    /** POST registro -> cualquier visitante crea su cuenta de cliente. */
    public static function registrar()
    {
        $d = Http::entrada();
        $errores = Validador::datosUsuario($d, null, true);
        if ($errores) {
            throw new ApiError('Revisa los datos del formulario.', 422, $errores);
        }
        $id = Repositorio::crearUsuario($d, 'cliente', 'activo');   // el rol NO lo decide el visitante
        return ['ok' => true, 'usuario' => Repositorio::usuarioPublico(Repositorio::usuarioPorId($id))];
    }

    /** POST login */
    public static function login()
    {
        $d = Http::entrada();
        $username = Http::texto($d, 'username');
        $password = Http::crudo($d, 'password');
        if ($username === '' || $password === '') {
            throw new ApiError('Ingresa tu usuario y tu contraseña.', 400);
        }

        $u = Repositorio::usuarioPorUsername($username);
        if (!$u) {
            throw new ApiError('El usuario no está registrado.', 401);
        }

        if ($u['estado'] === 'bloqueado') {
            throw new ApiError(
                'Tu cuenta está bloqueada por superar 3 intentos fallidos. Comunícate con un administrador.',
                423,
                null,
                ['bloqueado' => true, 'intentos' => (int)$u['intentos_fallidos']]
            );
        }

        if (password_verify($password, $u['password_hash'])) {
            Database::pdo()->prepare('UPDATE usuarios SET intentos_fallidos = 0 WHERE id = ?')->execute([$u['id']]);
            Sesion::iniciarParaUsuario($u['id']);
            return ['ok' => true, 'usuario' => Repositorio::usuarioCompleto($u['id'])];
        }

        // Contraseña incorrecta: suma un intento y, al tercero, bloquea la cuenta
        $pdo = Database::pdo();
        $pdo->prepare('UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = ?')->execute([$u['id']]);
        $s = $pdo->prepare('SELECT intentos_fallidos FROM usuarios WHERE id = ?');
        $s->execute([$u['id']]);
        $intentos = (int)$s->fetchColumn();

        if ($intentos >= Reglas::MAX_INTENTOS) {
            $pdo->prepare("UPDATE usuarios SET estado = 'bloqueado' WHERE id = ?")->execute([$u['id']]);
            throw new ApiError(
                'Contraseña incorrecta. Tu cuenta quedó bloqueada tras el tercer intento fallido.',
                423,
                null,
                ['bloqueado' => true, 'intentos' => $intentos]
            );
        }
        $restantes = Reglas::MAX_INTENTOS - $intentos;
        throw new ApiError(
            'Contraseña incorrecta. Te ' . ($restantes === 1 ? 'queda 1 intento' : "quedan $restantes intentos") . '.',
            401,
            null,
            ['intentos' => $intentos, 'restantes' => $restantes]
        );
    }

    /** GET intentos?username=... -> alimenta el contador visible en el formulario. */
    public static function intentos()
    {
        $u = Repositorio::usuarioPorUsername(trim(isset($_GET['username']) ? $_GET['username'] : ''));
        return ['ok' => true, 'intentos' => $u ? (int)$u['intentos_fallidos'] : 0];
    }

    /** GET me -> usuario de la sesión actual con sus productos. */
    public static function me()
    {
        $u = Sesion::requerir();
        return ['ok' => true, 'usuario' => Repositorio::usuarioCompleto($u['id'])];
    }

    /** POST logout */
    public static function logout()
    {
        Sesion::cerrar();
        return ['ok' => true];
    }

    /** POST perfil -> editar los datos del registro (no toca la contraseña). */
    public static function perfil()
    {
        $u = Sesion::requerir();
        $d = Http::entrada();
        $errores = Validador::datosUsuario($d, $u['id'], false);
        unset($errores['password'], $errores['confirmar']);
        if ($errores) {
            throw new ApiError('Revisa los datos del formulario.', 422, $errores);
        }
        $s = Database::pdo()->prepare(
            'UPDATE usuarios SET identificacion = ?, nombre = ?, celular = ?, username = ? WHERE id = ?'
        );
        $s->execute([
            Http::texto($d, 'identificacion'),
            preg_replace('/\s+/u', ' ', Http::texto($d, 'nombre')),
            Http::texto($d, 'celular'),
            Http::texto($d, 'username'),
            $u['id'],
        ]);
        return ['ok' => true, 'usuario' => Repositorio::usuarioPublico(Repositorio::usuarioPorId($u['id']))];
    }

    /** POST password -> usuario y clave actual, nueva clave y confirmación. */
    public static function password()
    {
        $u = Sesion::requerir();
        $d = Http::entrada();
        $actual = Http::crudo($d, 'actual');
        $nueva = Http::crudo($d, 'nueva');
        $confirmar = Http::crudo($d, 'confirmar');

        $e = [];
        if (strcasecmp(Http::texto($d, 'username'), $u['username']) !== 0) {
            $e['username'] = 'El usuario no coincide con el de tu sesión.';
        }
        if (!password_verify($actual, $u['password_hash'])) {
            $e['actual'] = 'La contraseña actual es incorrecta.';
        }
        if (!Validador::password($nueva)) {
            $e['nueva'] = Validador::mensajePassword();
        } elseif ($nueva === $actual) {
            $e['nueva'] = 'La nueva contraseña debe ser diferente a la actual.';
        }
        if ($nueva !== $confirmar) {
            $e['confirmar'] = 'Las contraseñas no coinciden.';
        }
        if ($e) {
            throw new ApiError('Revisa los datos del formulario.', 422, $e);
        }
        Database::pdo()->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')
            ->execute([password_hash($nueva, PASSWORD_DEFAULT), $u['id']]);
        return ['ok' => true];
    }
}
