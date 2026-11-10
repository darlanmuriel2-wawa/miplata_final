<?php
/**
 * Configuración de la API.
 * Los valores por defecto son los de XAMPP (usuario root, sin contraseña).
 * Si cambiaste la contraseña de MySQL, modifícala aquí.
 */
return [
    'db' => [
        'host' => getenv('MIPLATA_DB_HOST') ?: '127.0.0.1',
        'port' => getenv('MIPLATA_DB_PORT') ?: '3306',
        'name' => getenv('MIPLATA_DB_NAME') ?: 'miplata',
        'user' => getenv('MIPLATA_DB_USER') ?: 'root',
        'pass' => getenv('MIPLATA_DB_PASS') !== false ? getenv('MIPLATA_DB_PASS') : '',
    ],

    // Solo se usa si abres el front con Live Server (otro puerto) en vez de XAMPP.
    'cors_origins' => ['http://localhost:5500', 'http://127.0.0.1:5500'],

    // Las fechas se guardan en UTC. Colombia es UTC-5 (sin horario de verano): se usa para agrupar por día.
    'utc_offset_horas' => -5,

    // true muestra el detalle técnico de los errores (útil mientras desarrollas).
    'debug' => getenv('MIPLATA_DEBUG') === '1',
];
