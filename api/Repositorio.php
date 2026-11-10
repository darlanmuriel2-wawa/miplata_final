<?php
/**
 * Repositorio: TODAS las consultas SQL de usuarios y productos están aquí.
 * Los controladores no escriben SQL de usuarios; piden "dame el usuario X".
 */
class Repositorio
{
    // ------------------------------------------------------------ usuarios
    public static function usuarioPorId($id)
    {
        $s = Database::pdo()->prepare('SELECT * FROM usuarios WHERE id = ?');
        $s->execute([(int)$id]);
        $f = $s->fetch();
        return $f ? $f : null;
    }

    public static function usuarioPorUsername($username)
    {
        $s = Database::pdo()->prepare('SELECT * FROM usuarios WHERE username = ?');
        $s->execute([$username]);
        $f = $s->fetch();
        return $f ? $f : null;
    }

    /** ¿Existe otro usuario con ese valor en esa columna? (para la unicidad) */
    public static function existeValor($columna, $valor, $exceptoId = null)
    {
        if (!in_array($columna, ['identificacion', 'username'], true)) {
            throw new InvalidArgumentException('Columna no permitida');
        }
        $s = Database::pdo()->prepare("SELECT id FROM usuarios WHERE $columna = ? AND id <> ? LIMIT 1");
        $s->execute([$valor, (int)$exceptoId]);
        return (bool)$s->fetch();
    }

    public static function listarUsuarios()
    {
        $filas = Database::pdo()->query('SELECT * FROM usuarios ORDER BY id')->fetchAll();
        return array_map([__CLASS__, 'usuarioPublico'], $filas);
    }

    /** Crea el usuario y sus tres productos en una sola transacción. */
    public static function crearUsuario($d, $rol, $estado)
    {
        return Database::transaccion(function ($pdo) use ($d, $rol, $estado) {
            $s = $pdo->prepare(
                'INSERT INTO usuarios (identificacion, nombre, celular, username, password_hash, rol, estado, creado_en)
                 VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())'
            );
            $s->execute([
                Http::texto($d, 'identificacion'),
                preg_replace('/\s+/u', ' ', Http::texto($d, 'nombre')),
                Http::texto($d, 'celular'),
                Http::texto($d, 'username'),
                password_hash(Http::crudo($d, 'password'), PASSWORD_DEFAULT),
                $rol,
                $estado,
            ]);
            $id = (int)$pdo->lastInsertId();
            self::crearProductos($id);
            return $id;
        });
    }

    public static function crearProductos($usuarioId)
    {
        $pdo = Database::pdo();
        $existentes = $pdo->prepare('SELECT tipo FROM productos WHERE usuario_id = ?');
        $existentes->execute([$usuarioId]);
        $tengo = array_column($existentes->fetchAll(), 'tipo');

        $ins = $pdo->prepare(
            'INSERT INTO productos (usuario_id, tipo, numero, saldo, cupo_total, deuda, creado_en)
             VALUES (?, ?, ?, 0, ?, ?, UTC_TIMESTAMP())'
        );
        foreach (['ahorros', 'corriente', 'tarjeta'] as $tipo) {
            if (in_array($tipo, $tengo, true)) continue;
            $esTarjeta = $tipo === 'tarjeta';
            $ins->execute([
                $usuarioId,
                $tipo,
                self::numeroUnico($esTarjeta ? 16 : 10),
                $esTarjeta ? Reglas::CUPO_INICIAL : null,
                $esTarjeta ? 0 : null,
            ]);
        }
    }

    private static function numeroUnico($digitos)
    {
        $pdo = Database::pdo();
        $s = $pdo->prepare('SELECT 1 FROM productos WHERE numero = ?');
        do {
            $n = '';
            for ($i = 0; $i < $digitos; $i++) {
                $n .= random_int(0, 9);
            }
            $s->execute([$n]);
        } while ($s->fetch());
        return $n;
    }

    // ------------------------------------------------------------ movimientos
    public static function movimiento($productoId, $tipo, $sentido, $valor, $descripcion, $transferenciaId = null)
    {
        $s = Database::pdo()->prepare(
            'INSERT INTO movimientos (producto_id, fecha, tipo, sentido, valor, descripcion, transferencia_id)
             VALUES (?, UTC_TIMESTAMP(3), ?, ?, ?, ?, ?)'
        );
        $s->execute([(int)$productoId, $tipo, $sentido, $valor, $descripcion, $transferenciaId]);
    }

    // ------------------------------------------------------------ comprobantes
    /** Comprobante de una transferencia (o null si no existe). */
    public static function comprobantePorId($id)
    {
        $s = Database::pdo()->prepare('SELECT * FROM transferencias WHERE id = ?');
        $s->execute([(int)$id]);
        $t = $s->fetch();
        return $t ? $t : null;
    }

    /** Forma que consume el front. Los números de producto se muestran enmascarados. */
    public static function comprobantePublico($t)
    {
        $propia = $t['origen_usuario_id'] !== null && $t['origen_usuario_id'] === $t['destino_usuario_id'];
        return [
            'id'         => (int)$t['id'],
            'referencia' => $t['referencia'],
            'fecha'      => self::iso($t['fecha']),
            'valor'      => (float)$t['valor'],
            'estado'     => 'Exitosa',
            'propia'     => $propia,
            'origen'     => [
                'nombre'   => $t['origen_nombre'],
                'tipo'     => $t['origen_producto'],
                'producto' => Reglas::$NOMBRES[$t['origen_producto']],
                'numero'   => Reglas::enmascarar($t['origen_numero']),
            ],
            'destino'    => [
                'nombre'   => $t['destino_nombre'],
                'tipo'     => $t['destino_producto'],
                'producto' => Reglas::$NOMBRES[$t['destino_producto']],
                'numero'   => Reglas::enmascarar($t['destino_numero']),
            ],
        ];
    }

    // ------------------------------------------------------------ serialización
    /** Datos del usuario SIN el hash de la contraseña (nunca sale del servidor). */
    public static function usuarioPublico($u)
    {
        return [
            'id'               => (int)$u['id'],
            'identificacion'   => $u['identificacion'],
            'nombre'           => $u['nombre'],
            'celular'          => $u['celular'],
            'username'         => $u['username'],
            'rol'              => $u['rol'],
            'estado'           => $u['estado'],
            'intentosFallidos' => (int)$u['intentos_fallidos'],
            'fechaRegistro'    => self::iso($u['creado_en']),
        ];
    }

    /** Usuario con sus productos y movimientos, con la forma que esperan los modelos de JavaScript. */
    public static function usuarioCompleto($id)
    {
        $u = self::usuarioPorId($id);
        if (!$u) return null;
        self::crearProductos((int)$id);   // por si faltara alguno (p. ej. el admin del script SQL)

        $pdo = Database::pdo();
        $datos = self::usuarioPublico($u);
        $s = $pdo->prepare('SELECT * FROM productos WHERE usuario_id = ?');
        $s->execute([(int)$id]);

        $productos = [];
        foreach ($s->fetchAll() as $p) {
            $m = $pdo->prepare(
                'SELECT id, fecha, tipo, sentido, valor, descripcion, transferencia_id FROM movimientos
                 WHERE producto_id = ? ORDER BY fecha DESC, id DESC'
            );
            $m->execute([$p['id']]);
            $movs = [];
            foreach ($m->fetchAll() as $f) {
                $movs[] = [
                    'id'          => 'M' . $f['id'],
                    'fecha'       => self::iso($f['fecha']),
                    'tipo'        => $f['tipo'],
                    'sentido'     => $f['sentido'],
                    'valor'       => (float)$f['valor'],
                    'descripcion' => $f['descripcion'],
                    'producto'    => $p['tipo'],
                    'transferenciaId' => $f['transferencia_id'] !== null ? (int)$f['transferencia_id'] : null,
                ];
            }

            if ($p['tipo'] === 'tarjeta') {
                $c = $pdo->prepare('SELECT * FROM compras_tarjeta WHERE producto_id = ? ORDER BY fecha, id');
                $c->execute([$p['id']]);
                $compras = [];
                foreach ($c->fetchAll() as $f) {
                    $compras[] = [
                        'id'           => 'C' . $f['id'],
                        'fecha'        => self::iso($f['fecha']),
                        'descripcion'  => $f['descripcion'],
                        'capital'      => (float)$f['capital'],
                        'cuotas'       => (int)$f['cuotas'],
                        'tasa'         => (float)$f['tasa'],
                        'cuotaMensual' => (float)$f['cuota_mensual'],
                        'saldoCapital' => (float)$f['saldo_capital'],
                    ];
                }
                $productos['tarjeta'] = [
                    'numTarjeta'  => $p['numero'],
                    'cupoTotal'   => (float)$p['cupo_total'],
                    'deudaActual' => (float)$p['deuda'],
                    'fechaCorte'  => self::iso($p['creado_en']),
                    'compras'     => $compras,
                    'movimientos' => $movs,
                ];
            } else {
                $productos[$p['tipo']] = [
                    'numeroCuenta'  => $p['numero'],
                    'saldo'         => (float)$p['saldo'],
                    'fechaCreacion' => self::iso($p['creado_en']),
                    'movimientos'   => $movs,
                ];
            }
        }
        $datos['productos'] = $productos;
        return $datos;
    }

    /** '2026-11-08 14:30:00.123' (UTC) -> '2026-11-08T14:30:00.123Z' (lo entiende new Date()) */
    private static function iso($fecha)
    {
        return str_replace(' ', 'T', $fecha) . 'Z';
    }
}
