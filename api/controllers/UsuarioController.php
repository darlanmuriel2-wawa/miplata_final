<?php
/**
 * CRUD de usuarios: solo para administradores.
 */
class UsuarioController
{
    private static function rol($d)
    {
        return Http::texto($d, 'rol') === 'admin' ? 'admin' : 'cliente';
    }

    private static function estado($d)
    {
        return Http::texto($d, 'estado') === 'bloqueado' ? 'bloqueado' : 'activo';
    }

    /** GET usuarios */
    public static function listar()
    {
        Sesion::requerirAdmin();
        return ['ok' => true, 'usuarios' => Repositorio::listarUsuarios()];
    }

    /** POST usuario_crear */
    public static function crear()
    {
        Sesion::requerirAdmin();
        $d = Http::entrada();
        $errores = Validador::datosUsuario($d, null, true);
        if ($errores) {
            throw new ApiError('Revisa los datos del formulario.', 422, $errores);
        }
        $id = Repositorio::crearUsuario($d, self::rol($d), self::estado($d));
        return ['ok' => true, 'usuario' => Repositorio::usuarioPublico(Repositorio::usuarioPorId($id))];
    }

    /** POST usuario_editar */
    public static function editar()
    {
        Sesion::requerirAdmin();
        $d = Http::entrada();
        $id = isset($d['id']) ? (int)$d['id'] : 0;
        if (!Repositorio::usuarioPorId($id)) {
            throw new ApiError('El usuario no existe.', 404);
        }
        $errores = Validador::datosUsuario($d, $id, false);
        if ($errores) {
            throw new ApiError('Revisa los datos del formulario.', 422, $errores);
        }

        $estado = self::estado($d);
        $pdo = Database::pdo();
        $pdo->prepare(
            'UPDATE usuarios SET identificacion = ?, nombre = ?, celular = ?, username = ?, rol = ?, estado = ? WHERE id = ?'
        )->execute([
            Http::texto($d, 'identificacion'),
            preg_replace('/\s+/u', ' ', Http::texto($d, 'nombre')),
            Http::texto($d, 'celular'),
            Http::texto($d, 'username'),
            self::rol($d),
            $estado,
            $id,
        ]);
        if ($estado === 'activo') {   // desbloquear = reiniciar el contador de intentos
            $pdo->prepare('UPDATE usuarios SET intentos_fallidos = 0 WHERE id = ?')->execute([$id]);
        }
        if (Http::crudo($d, 'password') !== '') {
            $pdo->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')
                ->execute([password_hash(Http::crudo($d, 'password'), PASSWORD_DEFAULT), $id]);
        }
        return ['ok' => true, 'usuario' => Repositorio::usuarioPublico(Repositorio::usuarioPorId($id))];
    }

    /** POST usuario_eliminar */
    public static function eliminar()
    {
        $admin = Sesion::requerirAdmin();
        $d = Http::entrada();
        $id = isset($d['id']) ? (int)$d['id'] : 0;
        if (!Repositorio::usuarioPorId($id)) {
            throw new ApiError('El usuario no existe.', 404);
        }
        if ($id === (int)$admin['id']) {
            throw new ApiError('No puedes eliminar tu propia cuenta mientras tienes la sesión abierta.', 400);
        }
        // ON DELETE CASCADE borra también sus productos, movimientos y compras
        Database::pdo()->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
        return ['ok' => true];
    }
}
