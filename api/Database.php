<?php
/**
 * Conexión a MySQL con PDO.
 *
 * PDO + "consultas preparadas" (prepare/execute con ?) evitan la inyección SQL:
 * los datos del usuario NUNCA se pegan dentro del texto de la consulta.
 */
class Database
{
    private static $pdo = null;

    public static function pdo()
    {
        if (self::$pdo === null) {
            $c = Config::get('db');
            $dsn = "mysql:host={$c['host']};port={$c['port']};dbname={$c['name']};charset=utf8mb4";
            self::$pdo = new PDO($dsn, $c['user'], $c['pass'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,   // los errores lanzan excepciones
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,                    // preparación real en el servidor
            ]);
        }
        return self::$pdo;
    }

    /**
     * Ejecuta $fn dentro de una TRANSACCIÓN: o se guardan todos los cambios
     * (commit) o no se guarda ninguno (rollback). Es lo que evita que, por
     * ejemplo, se descuente dinero de una cuenta y no se abone en la otra.
     */
    public static function transaccion($fn)
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $resultado = $fn($pdo);
            $pdo->commit();
            return $resultado;
        } catch (Exception $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}

class Config
{
    private static $datos = null;

    public static function get($clave)
    {
        if (self::$datos === null) {
            self::$datos = require __DIR__ . '/config.php';
        }
        return self::$datos[$clave];
    }
}
