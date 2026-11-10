<?php
/**
 * Reglas de negocio del banco (la fuente de verdad está en el SERVIDOR).
 * Aunque alguien manipule el JavaScript del navegador, estas reglas se siguen cumpliendo.
 */
class Reglas
{
    const TASA_AHORROS = 0.015;   // 1.5% mensual
    const SOBREGIRO    = 0.20;    // 20% sobre el saldo
    const MAX_INTENTOS = 3;
    const CUPO_INICIAL = 3000000;
    const MAX_MONTO    = 1000000000;

    public static $NOMBRES = [
        'ahorros'   => 'Cuenta de Ahorros',
        'corriente' => 'Cuenta Corriente',
        'tarjeta'   => 'Tarjeta de Crédito',
    ];

    public static function redondear($n)
    {
        return round((float)$n, 2);
    }

    /** '1234567890' -> '•••• 7890' (nunca se muestra el número completo en un comprobante). */
    public static function enmascarar($numero)
    {
        return '•••• ' . substr((string)$numero, -4);
    }

    public static function moneda($n)
    {
        return '$ ' . number_format((float)$n, 2, ',', '.');
    }

    /** Valida y normaliza un monto recibido del front. */
    public static function monto($valor)
    {
        if (!is_numeric($valor)) {
            throw new ApiError('Ingresa un monto válido mayor a cero.');
        }
        $m = self::redondear($valor);
        if (!is_finite($m) || $m <= 0) {
            throw new ApiError('Ingresa un monto válido mayor a cero.');
        }
        if ($m > self::MAX_MONTO) {
            throw new ApiError('El monto es demasiado grande para una sola operación.');
        }
        return $m;
    }

    public static function tipoCuenta($tipo)
    {
        if ($tipo !== 'ahorros' && $tipo !== 'corriente') {
            throw new ApiError('Producto no válido.');
        }
        return $tipo;
    }

    /** Interés mensual de la cuenta de ahorros (1.5% del saldo). */
    public static function interesAhorros($saldo)
    {
        return self::redondear($saldo * self::TASA_AHORROS);
    }

    /** Lo máximo que se puede sacar de una cuenta en una operación. */
    public static function limiteRetiro($tipo, $saldo)
    {
        if ($tipo === 'corriente') {
            return max(0, self::redondear($saldo * (1 + self::SOBREGIRO)));
        }
        return $saldo;
    }

    public static function mensajeLimite($tipo, $saldo)
    {
        $limite = self::moneda(self::limiteRetiro($tipo, $saldo));
        if ($tipo === 'corriente') {
            return "El monto supera el límite de retiro con sobregiro del 20% ($limite).";
        }
        return "El monto supera el saldo disponible ($limite).";
    }

    /** ≤ 2 cuotas: 0%  |  3 a 6: 1.9%  |  ≥ 7: 2.3%  (mensual) */
    public static function tasaPorCuotas($n)
    {
        if ($n <= 2) return 0.0;
        if ($n <= 6) return 0.019;
        return 0.023;
    }

    /** Cuota mensual = (Capital × tasa) / (1 − (1 + tasa)^(−n)) */
    public static function calcularCuota($capital, $n)
    {
        $tasa = self::tasaPorCuotas($n);
        if ($tasa == 0) {
            return self::redondear($capital / $n);
        }
        return self::redondear(($capital * $tasa) / (1 - pow(1 + $tasa, -$n)));
    }
}
