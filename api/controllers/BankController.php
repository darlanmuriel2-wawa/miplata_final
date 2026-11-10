<?php
/**
 * Operaciones del cajero. Cada operación es una TRANSACCIÓN SQL y bloquea las
 * filas que toca (SELECT ... FOR UPDATE) para que dos operaciones simultáneas
 * no puedan dejar un saldo incorrecto.
 */
class BankController
{
    // ------------------------------------------------------------ ayudas
    /** id del producto de un usuario (sin bloquear). */
    private static function productoId($usuarioId, $tipo)
    {
        $s = Database::pdo()->prepare('SELECT id FROM productos WHERE usuario_id = ? AND tipo = ?');
        $s->execute([(int)$usuarioId, $tipo]);
        $id = $s->fetchColumn();
        if (!$id) {
            Repositorio::crearProductos((int)$usuarioId);
            $s->execute([(int)$usuarioId, $tipo]);
            $id = $s->fetchColumn();
        }
        return (int)$id;
    }

    /**
     * Bloquea las filas de los productos indicados. Se piden SIEMPRE en orden
     * de id para que dos transferencias cruzadas no se bloqueen entre sí.
     */
    private static function bloquear($pdo, $ids)
    {
        $ids = array_values(array_unique($ids));
        sort($ids);
        $marcas = implode(',', array_fill(0, count($ids), '?'));
        $s = $pdo->prepare("SELECT * FROM productos WHERE id IN ($marcas) ORDER BY id FOR UPDATE");
        $s->execute($ids);
        $mapa = [];
        foreach ($s->fetchAll() as $fila) {
            $mapa[(int)$fila['id']] = $fila;
        }
        return $mapa;
    }

    private static function guardarSaldo($pdo, $productoId, $saldo)
    {
        $pdo->prepare('UPDATE productos SET saldo = ? WHERE id = ?')->execute([$saldo, $productoId]);
    }

    /** Resta de una cuenta respetando su límite de retiro (saldo, o saldo + 20% en corriente). */
    private static function debitar($pdo, $prod, $monto, $tipoMov, $descripcion, $transferenciaId = null)
    {
        $saldo = (float)$prod['saldo'];
        if ($monto > Reglas::limiteRetiro($prod['tipo'], $saldo)) {
            throw new ApiError(Reglas::mensajeLimite($prod['tipo'], $saldo));
        }
        $nuevo = Reglas::redondear($saldo - $monto);
        self::guardarSaldo($pdo, $prod['id'], $nuevo);
        Repositorio::movimiento($prod['id'], $tipoMov, 'salida', $monto, $descripcion, $transferenciaId);
        return $nuevo;
    }

    private static function acreditar($pdo, $prod, $monto, $tipoMov, $descripcion, $transferenciaId = null)
    {
        $nuevo = Reglas::redondear((float)$prod['saldo'] + $monto);
        self::guardarSaldo($pdo, $prod['id'], $nuevo);
        Repositorio::movimiento($prod['id'], $tipoMov, 'entrada', $monto, $descripcion, $transferenciaId);
        return $nuevo;
    }

    /** Referencia única y legible para el comprobante: MP-3F9A12BC */
    private static function nuevaReferencia($pdo)
    {
        $s = $pdo->prepare('SELECT 1 FROM transferencias WHERE referencia = ?');
        do {
            $ref = 'MP-' . strtoupper(bin2hex(random_bytes(4)));
            $s->execute([$ref]);
        } while ($s->fetch());
        return $ref;
    }

    // ------------------------------------------------------------ consignar
    /** POST consignar {cuenta, monto} */
    public static function consignar()
    {
        $u = Sesion::requerir();
        $d = Http::entrada();
        $tipo = Reglas::tipoCuenta(Http::texto($d, 'cuenta'));
        $monto = Reglas::monto(isset($d['monto']) ? $d['monto'] : null);
        $pid = self::productoId($u['id'], $tipo);

        $saldo = Database::transaccion(function ($pdo) use ($pid, $monto, $tipo) {
            $prod = self::bloquear($pdo, [$pid])[$pid];
            return self::acreditar($pdo, $prod, $monto, 'consignación', 'Consignación en ' . Reglas::$NOMBRES[$tipo]);
        });
        return ['ok' => true, 'saldo' => $saldo];
    }

    // ------------------------------------------------------------ retirar
    /** POST retirar {cuenta, monto}  ->  ahorros: +1.5% de interés | corriente: sobregiro 20% */
    public static function retirar()
    {
        $u = Sesion::requerir();
        $d = Http::entrada();
        $tipo = Reglas::tipoCuenta(Http::texto($d, 'cuenta'));
        $monto = Reglas::monto(isset($d['monto']) ? $d['monto'] : null);
        $pid = self::productoId($u['id'], $tipo);

        $r = Database::transaccion(function ($pdo) use ($pid, $monto, $tipo) {
            $prod = self::bloquear($pdo, [$pid])[$pid];
            $saldo = (float)$prod['saldo'];
            $interes = 0.0;

            if ($tipo === 'ahorros') {
                if ($monto > $saldo) {                       // no puede superar el saldo disponible
                    throw new ApiError(Reglas::mensajeLimite('ahorros', $saldo));
                }
                $interes = Reglas::interesAhorros($saldo);   // 1.5% mensual aplicado AL RETIRAR
                if ($interes > 0) {
                    $saldo = Reglas::redondear($saldo + $interes);
                    self::guardarSaldo($pdo, $pid, $saldo);
                    Repositorio::movimiento($pid, 'interés', 'entrada', $interes, 'Interés 1.5% mensual aplicado al retiro');
                    $prod['saldo'] = $saldo;
                }
            }
            $nuevo = self::debitar($pdo, $prod, $monto, 'retiro', 'Retiro de ' . Reglas::$NOMBRES[$tipo]);
            return ['saldo' => $nuevo, 'interes' => $interes];
        });
        return ['ok' => true, 'saldo' => $r['saldo'], 'interes' => $r['interes']];
    }

    // ------------------------------------------------------------ transferir
    /** POST transferir {origen, modo: propio|otro, tipo (destino), username?, monto} */
    public static function transferir()
    {
        $u = Sesion::requerir();
        $d = Http::entrada();
        $origenTipo = Reglas::tipoCuenta(Http::texto($d, 'origen'));
        $destinoTipo = Reglas::tipoCuenta(Http::texto($d, 'tipo'));
        $modo = Http::texto($d, 'modo') === 'otro' ? 'otro' : 'propio';
        $monto = Reglas::monto(isset($d['monto']) ? $d['monto'] : null);

        $destUsuario = $u;
        if ($modo === 'otro') {
            $encontrado = Repositorio::usuarioPorUsername(Http::texto($d, 'username'));
            if (!$encontrado || $encontrado['rol'] === 'admin' || $encontrado['estado'] !== 'activo') {
                throw new ApiError('El usuario destino no existe.');
            }
            $destUsuario = $encontrado;
        }
        $mismoUsuario = (int)$destUsuario['id'] === (int)$u['id'];
        if ($mismoUsuario && $destinoTipo === $origenTipo) {
            throw new ApiError('No puedes transferir al mismo producto.');
        }

        $origenId = self::productoId($u['id'], $origenTipo);
        $destinoId = self::productoId($destUsuario['id'], $destinoTipo);

        $resultado = Database::transaccion(function ($pdo) use (
            $origenId, $destinoId, $monto, $origenTipo, $destinoTipo, $mismoUsuario, $u, $destUsuario
        ) {
            $filas = self::bloquear($pdo, [$origenId, $destinoId]);
            $origen = $filas[$origenId];
            $destino = $filas[$destinoId];
            $no = Reglas::$NOMBRES;

            $descSale = $mismoUsuario
                ? 'Transferencia a mi ' . $no[$destinoTipo]
                : 'Transferencia a ' . $destUsuario['nombre'] . ' (' . $no[$destinoTipo] . ')';
            $descEntra = $mismoUsuario
                ? 'Transferencia desde mi ' . $no[$origenTipo]
                : 'Transferencia de ' . $u['nombre'] . ' (' . $no[$origenTipo] . ')';

            // 1) Se valida el límite ANTES de crear el comprobante (si falla, el rollback lo deshace todo)
            if ($monto > Reglas::limiteRetiro($origen['tipo'], (float)$origen['saldo'])) {
                throw new ApiError(Reglas::mensajeLimite($origen['tipo'], (float)$origen['saldo']));
            }

            // 2) Comprobante: una fila con la "foto" de quién envió a quién
            $pdo->prepare(
                'INSERT INTO transferencias (referencia, fecha, valor, origen_usuario_id, origen_nombre, origen_producto,
                    origen_numero, destino_usuario_id, destino_nombre, destino_producto, destino_numero)
                 VALUES (?, UTC_TIMESTAMP(3), ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            )->execute([
                self::nuevaReferencia($pdo), $monto,
                $u['id'], $u['nombre'], $origenTipo, $origen['numero'],
                $destUsuario['id'], $destUsuario['nombre'], $destinoTipo, $destino['numero'],
            ]);
            $transferenciaId = (int)$pdo->lastInsertId();

            // 3) Los dos movimientos quedan enlazados al comprobante
            $nuevo = self::debitar($pdo, $origen, $monto, 'transferencia', $descSale, $transferenciaId);
            self::acreditar($pdo, $destino, $monto, 'transferencia', $descEntra, $transferenciaId);
            return ['saldo' => $nuevo, 'transferenciaId' => $transferenciaId];
        });
        return [
            'ok'           => true,
            'saldoOrigen'  => $resultado['saldo'],
            'destinatario' => $destUsuario['nombre'],
            'comprobante'  => Repositorio::comprobantePublico(Repositorio::comprobantePorId($resultado['transferenciaId'])),
        ];
    }

    /** GET comprobante?id=N -> solo lo puede ver quien envió o quien recibió la transferencia. */
    public static function comprobante()
    {
        $u = Sesion::requerir();
        $t = Repositorio::comprobantePorId(isset($_GET['id']) ? (int)$_GET['id'] : 0);
        $esParte = $t && ((int)$t['origen_usuario_id'] === (int)$u['id'] || (int)$t['destino_usuario_id'] === (int)$u['id']);
        if (!$esParte) {
            throw new ApiError('El comprobante no existe.', 404);   // mismo mensaje: no se revela si existe
        }
        return ['ok' => true, 'comprobante' => Repositorio::comprobantePublico($t)];
    }

    // ------------------------------------------------------------ tarjeta
    /** POST compra {valor, cuotas, descripcion} */
    public static function compra()
    {
        $u = Sesion::requerir();
        $d = Http::entrada();
        $valor = Reglas::monto(isset($d['valor']) ? $d['valor'] : null);
        $cuotas = (isset($d['cuotas']) && is_numeric($d['cuotas'])) ? (float)$d['cuotas'] : 0;
        if ($cuotas != floor($cuotas) || $cuotas < 1 || $cuotas > 36) {
            throw new ApiError('El número de cuotas debe ser un entero entre 1 y 36.');
        }
        $cuotas = (int)$cuotas;
        $descripcion = Http::texto($d, 'descripcion');
        if ($descripcion === '') {
            throw new ApiError('Escribe una descripción de la compra.');
        }
        $descripcion = mb_substr($descripcion, 0, 100);
        $pid = self::productoId($u['id'], 'tarjeta');

        $compra = Database::transaccion(function ($pdo) use ($pid, $valor, $cuotas, $descripcion) {
            $tarjeta = self::bloquear($pdo, [$pid])[$pid];
            $disponible = Reglas::redondear((float)$tarjeta['cupo_total'] - (float)$tarjeta['deuda']);
            if ($valor > $disponible) {
                throw new ApiError('La compra supera tu cupo disponible (' . Reglas::moneda($disponible) . ').');
            }
            $tasa = Reglas::tasaPorCuotas($cuotas);
            $cuota = Reglas::calcularCuota($valor, $cuotas);

            $pdo->prepare(
                'INSERT INTO compras_tarjeta (producto_id, fecha, descripcion, capital, cuotas, tasa, cuota_mensual, saldo_capital)
                 VALUES (?, UTC_TIMESTAMP(3), ?, ?, ?, ?, ?, ?)'
            )->execute([$pid, $descripcion, $valor, $cuotas, $tasa, $cuota, $valor]);

            $pdo->prepare('UPDATE productos SET deuda = ? WHERE id = ?')
                ->execute([Reglas::redondear((float)$tarjeta['deuda'] + $valor), $pid]);

            Repositorio::movimiento(
                $pid, 'compra', 'salida', $valor,
                "$descripcion ($cuotas cuotas de " . Reglas::moneda($cuota) . ')'
            );
            return ['capital' => $valor, 'cuotas' => $cuotas, 'tasa' => $tasa, 'cuotaMensual' => $cuota, 'descripcion' => $descripcion];
        });
        return ['ok' => true, 'compra' => $compra];
    }

    /** POST pago_tarjeta {cuenta, monto} -> paga la deuda con dinero de ahorros o corriente. */
    public static function pagoTarjeta()
    {
        $u = Sesion::requerir();
        $d = Http::entrada();
        $cuentaTipo = Reglas::tipoCuenta(Http::texto($d, 'cuenta'));
        $monto = Reglas::monto(isset($d['monto']) ? $d['monto'] : null);
        $tarjetaId = self::productoId($u['id'], 'tarjeta');
        $cuentaId = self::productoId($u['id'], $cuentaTipo);

        $r = Database::transaccion(function ($pdo) use ($tarjetaId, $cuentaId, $monto) {
            $filas = self::bloquear($pdo, [$tarjetaId, $cuentaId]);
            $tarjeta = $filas[$tarjetaId];
            $cuenta = $filas[$cuentaId];
            $deuda = (float)$tarjeta['deuda'];

            if ($deuda <= 0) {
                throw new ApiError('Tu tarjeta no tiene deuda pendiente.');
            }
            if ($monto > $deuda) {
                throw new ApiError('El pago supera tu deuda actual (' . Reglas::moneda($deuda) . ').');
            }
            $saldo = self::debitar($pdo, $cuenta, $monto, 'pago tarjeta', 'Pago a tarjeta de crédito');
            $nuevaDeuda = Reglas::redondear($deuda - $monto);
            $pdo->prepare('UPDATE productos SET deuda = ? WHERE id = ?')->execute([$nuevaDeuda, $tarjetaId]);

            // El pago se abona primero a las compras más antiguas
            $compras = $pdo->prepare(
                'SELECT id, saldo_capital FROM compras_tarjeta WHERE producto_id = ? AND saldo_capital > 0 ORDER BY fecha, id'
            );
            $compras->execute([$tarjetaId]);
            $restante = $monto;
            $upd = $pdo->prepare('UPDATE compras_tarjeta SET saldo_capital = ? WHERE id = ?');
            foreach ($compras->fetchAll() as $c) {
                if ($restante <= 0) break;
                $abono = min((float)$c['saldo_capital'], $restante);
                $upd->execute([Reglas::redondear((float)$c['saldo_capital'] - $abono), $c['id']]);
                $restante = Reglas::redondear($restante - $abono);
            }
            Repositorio::movimiento($tarjetaId, 'pago tarjeta', 'entrada', $monto, 'Pago a tarjeta de crédito');
            return ['deuda' => $nuevaDeuda, 'saldo' => $saldo];
        });
        return ['ok' => true, 'deuda' => $r['deuda'], 'saldo' => $r['saldo']];
    }
}
