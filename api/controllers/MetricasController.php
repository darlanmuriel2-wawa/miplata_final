<?php
/**
 * Métricas del banco para el panel del administrador.
 * Todo se calcula con consultas de AGREGACIÓN (COUNT, SUM, GROUP BY): la base de datos
 * hace el trabajo pesado y a la API solo viaja el resumen.
 */
class MetricasController
{
    /** Días que se muestran en las gráficas de series de tiempo. */
    const DIAS = 14;

    /** GET metricas (solo administrador) */
    public static function resumen()
    {
        Sesion::requerirAdmin();
        $pdo = Database::pdo();

        // Las fechas se guardan en UTC; para agrupar por DÍA se convierten a la hora de Colombia.
        $offset = (int)Config::get('utc_offset_horas');
        $local = function ($columna) use ($offset) {
            return "DATE_ADD($columna, INTERVAL $offset HOUR)";
        };
        $dias = self::ultimosDias($offset);
        $desde = $dias[0] . ' 00:00:00';

        // ---------------------------------------------------------- usuarios
        $u = $pdo->query(
            "SELECT COUNT(*) total,
                    COALESCE(SUM(rol = 'cliente'), 0)      clientes,
                    COALESCE(SUM(rol = 'admin'), 0)        admins,
                    COALESCE(SUM(estado = 'activo'), 0)    activos,
                    COALESCE(SUM(estado = 'bloqueado'), 0) bloqueados,
                    COALESCE(SUM(creado_en >= UTC_TIMESTAMP() - INTERVAL 7 DAY), 0) nuevos7
             FROM usuarios"
        )->fetch();

        // ---------------------------------------------------------- dinero
        $dinero = ['ahorros' => 0.0, 'corriente' => 0.0, 'deuda' => 0.0, 'cupo' => 0.0];
        foreach ($pdo->query(
            'SELECT tipo, COALESCE(SUM(saldo), 0) saldo, COALESCE(SUM(cupo_total), 0) cupo, COALESCE(SUM(deuda), 0) deuda
             FROM productos GROUP BY tipo'
        )->fetchAll() as $f) {
            if ($f['tipo'] === 'ahorros')   $dinero['ahorros'] = (float)$f['saldo'];
            if ($f['tipo'] === 'corriente') $dinero['corriente'] = (float)$f['saldo'];
            if ($f['tipo'] === 'tarjeta')   { $dinero['deuda'] = (float)$f['deuda']; $dinero['cupo'] = (float)$f['cupo']; }
        }

        // ---------------------------------------------------------- operaciones
        $hoy = $dias[count($dias) - 1];
        $s = $pdo->prepare('SELECT COUNT(*) FROM movimientos WHERE ' . $local('fecha') . ' >= ?');
        $s->execute([$hoy . ' 00:00:00']);
        $movHoy = (int)$s->fetchColumn();
        $movTotal = (int)$pdo->query('SELECT COUNT(*) FROM movimientos')->fetchColumn();
        $t = $pdo->query('SELECT COUNT(*) n, COALESCE(SUM(valor), 0) v FROM transferencias')->fetch();

        // ---------------------------------------------------------- serie: usuarios nuevos por día
        $s = $pdo->prepare(
            'SELECT DATE(' . $local('creado_en') . ') d, COUNT(*) n FROM usuarios
             WHERE ' . $local('creado_en') . ' >= ? GROUP BY d'
        );
        $s->execute([$desde]);
        $porDia = [];
        foreach ($s->fetchAll() as $f) $porDia[$f['d']] = (int)$f['n'];
        $registros = [];
        foreach ($dias as $d) $registros[] = ['fecha' => $d, 'valor' => isset($porDia[$d]) ? $porDia[$d] : 0];

        // ---------------------------------------------------------- serie: consignaciones vs retiros
        $s = $pdo->prepare(
            "SELECT DATE(" . $local('fecha') . ") d, tipo, SUM(valor) total FROM movimientos
             WHERE tipo IN ('consignación', 'retiro') AND " . $local('fecha') . " >= ? GROUP BY d, tipo"
        );
        $s->execute([$desde]);
        $flujo = [];
        foreach ($dias as $d) $flujo[$d] = ['fecha' => $d, 'consignaciones' => 0.0, 'retiros' => 0.0];
        foreach ($s->fetchAll() as $f) {
            if (!isset($flujo[$f['d']])) continue;
            $clave = $f['tipo'] === 'retiro' ? 'retiros' : 'consignaciones';
            $flujo[$f['d']][$clave] = (float)$f['total'];
        }

        // ---------------------------------------------------------- tipos de movimiento
        $tipos = [];
        foreach ($pdo->query('SELECT tipo, COUNT(*) n FROM movimientos GROUP BY tipo ORDER BY n DESC')->fetchAll() as $f) {
            $tipos[] = ['tipo' => $f['tipo'], 'cantidad' => (int)$f['n']];
        }

        // ---------------------------------------------------------- top 5 clientes por dinero en cuentas
        $top = [];
        foreach ($pdo->query(
            "SELECT u.nombre, u.username, COALESCE(SUM(CASE WHEN p.tipo IN ('ahorros', 'corriente') THEN p.saldo ELSE 0 END), 0) total
             FROM usuarios u JOIN productos p ON p.usuario_id = u.id
             WHERE u.rol = 'cliente' GROUP BY u.id, u.nombre, u.username
             ORDER BY total DESC, u.id LIMIT 5"
        )->fetchAll() as $f) {
            $top[] = ['nombre' => $f['nombre'], 'username' => $f['username'], 'saldo' => (float)$f['total']];
        }

        return [
            'ok' => true,
            'metricas' => [
                'usuarios' => [
                    'total' => (int)$u['total'], 'clientes' => (int)$u['clientes'], 'admins' => (int)$u['admins'],
                    'activos' => (int)$u['activos'], 'bloqueados' => (int)$u['bloqueados'], 'nuevos7' => (int)$u['nuevos7'],
                ],
                'dinero' => [
                    'ahorros'       => $dinero['ahorros'],
                    'corriente'     => $dinero['corriente'],
                    'enCuentas'     => Reglas::redondear($dinero['ahorros'] + $dinero['corriente']),
                    'deudaTarjetas' => $dinero['deuda'],
                    'cupoOtorgado'  => $dinero['cupo'],
                ],
                'operaciones' => [
                    'movimientos' => $movTotal, 'movimientosHoy' => $movHoy,
                    'transferencias' => (int)$t['n'], 'volumenTransferencias' => (float)$t['v'],
                ],
                'series' => [
                    'registros' => $registros,
                    'flujo'     => array_values($flujo),
                    'tipos'     => $tipos,
                    'topClientes' => $top,
                ],
                'generado' => gmdate('Y-m-d\TH:i:s\Z'),
            ],
        ];
    }

    /** Últimos DIAS días (hora de Colombia) como ['2026-11-01', ..., 'hoy']. */
    private static function ultimosDias($offset)
    {
        $ahora = new DateTime('now', new DateTimeZone('UTC'));
        $ahora->modify(($offset >= 0 ? '+' : '') . $offset . ' hours');
        $dias = [];
        for ($i = self::DIAS - 1; $i >= 0; $i--) {
            $d = clone $ahora;
            $d->modify("-$i days");
            $dias[] = $d->format('Y-m-d');
        }
        return $dias;
    }
}
