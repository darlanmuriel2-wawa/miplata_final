-- =====================================================================
-- Mi Plata · base de datos MySQL / MariaDB (XAMPP)
-- Cómo usarlo: phpMyAdmin -> pestaña "Importar" -> elegir este archivo -> Continuar.
-- (o por consola:  mysql -u root < database/miplata.sql)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS miplata
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE miplata;

-- Se borran en orden inverso a las dependencias para poder re-importar el archivo
DROP TABLE IF EXISTS compras_tarjeta;
DROP TABLE IF EXISTS movimientos;
DROP TABLE IF EXISTS transferencias;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS usuarios;

-- ---------------------------------------------------------------------
-- USUARIOS: clientes y administradores
-- La contraseña NUNCA se guarda en texto plano: es un hash (password_hash de PHP).
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  identificacion     VARCHAR(15)  NOT NULL,
  nombre             VARCHAR(100) NOT NULL,
  celular            CHAR(10)     NOT NULL,
  username           VARCHAR(20)  NOT NULL,
  password_hash      VARCHAR(255) NOT NULL,
  rol                ENUM('cliente','admin')     NOT NULL DEFAULT 'cliente',
  estado             ENUM('activo','bloqueado')  NOT NULL DEFAULT 'activo',
  intentos_fallidos  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  creado_en          DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_usuarios_identificacion (identificacion),
  UNIQUE KEY uq_usuarios_username (username)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- PRODUCTOS: cada usuario tiene exactamente uno de cada tipo
--   ahorros / corriente -> usan "saldo"
--   tarjeta             -> usa "cupo_total" y "deuda"
-- ---------------------------------------------------------------------
CREATE TABLE productos (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id  INT UNSIGNED NOT NULL,
  tipo        ENUM('ahorros','corriente','tarjeta') NOT NULL,
  numero      VARCHAR(20)  NOT NULL,
  saldo       DECIMAL(14,2) NOT NULL DEFAULT 0,
  cupo_total  DECIMAL(14,2) NULL,
  deuda       DECIMAL(14,2) NULL,
  creado_en   DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_productos_numero (numero),
  UNIQUE KEY uq_productos_usuario_tipo (usuario_id, tipo),
  CONSTRAINT fk_productos_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- TRANSFERENCIAS: una fila por transferencia = su COMPROBANTE.
-- Guarda una "foto" de los nombres y números de producto (enmascarados al mostrarse),
-- así el comprobante sigue siendo válido aunque después se edite o elimine un usuario.
-- ---------------------------------------------------------------------
CREATE TABLE transferencias (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  referencia          VARCHAR(20)  NOT NULL,
  fecha               DATETIME(3)  NOT NULL,
  valor               DECIMAL(14,2) NOT NULL,
  origen_usuario_id   INT UNSIGNED NULL,
  origen_nombre       VARCHAR(100) NOT NULL,
  origen_producto     ENUM('ahorros','corriente','tarjeta') NOT NULL,
  origen_numero       VARCHAR(20)  NOT NULL,
  destino_usuario_id  INT UNSIGNED NULL,
  destino_nombre      VARCHAR(100) NOT NULL,
  destino_producto    ENUM('ahorros','corriente','tarjeta') NOT NULL,
  destino_numero      VARCHAR(20)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_transferencias_referencia (referencia),
  KEY idx_transferencias_origen (origen_usuario_id),
  KEY idx_transferencias_destino (destino_usuario_id),
  CONSTRAINT fk_transferencias_origen FOREIGN KEY (origen_usuario_id)
    REFERENCES usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_transferencias_destino FOREIGN KEY (destino_usuario_id)
    REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- MOVIMIENTOS: historial de cada producto (fecha, tipo y valor)
-- Las fechas se guardan en UTC; el navegador las muestra en la hora local.
-- ---------------------------------------------------------------------
CREATE TABLE movimientos (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id  INT UNSIGNED NOT NULL,
  fecha        DATETIME(3)  NOT NULL,
  tipo         VARCHAR(30)  NOT NULL,
  sentido      ENUM('entrada','salida') NOT NULL,
  valor        DECIMAL(14,2) NOT NULL,
  descripcion  VARCHAR(255) NOT NULL DEFAULT '',
  transferencia_id BIGINT UNSIGNED NULL,   -- solo las transferencias: enlaza con su comprobante
  PRIMARY KEY (id),
  KEY idx_movimientos_producto_fecha (producto_id, fecha),
  KEY idx_movimientos_transferencia (transferencia_id),
  CONSTRAINT fk_movimientos_producto FOREIGN KEY (producto_id)
    REFERENCES productos (id) ON DELETE CASCADE,
  CONSTRAINT fk_movimientos_transferencia FOREIGN KEY (transferencia_id)
    REFERENCES transferencias (id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- COMPRAS_TARJETA: cada compra a cuotas con su tasa y su pago mensual
-- ---------------------------------------------------------------------
CREATE TABLE compras_tarjeta (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  producto_id    INT UNSIGNED NOT NULL,
  fecha          DATETIME(3)  NOT NULL,
  descripcion    VARCHAR(150) NOT NULL,
  capital        DECIMAL(14,2) NOT NULL,
  cuotas         TINYINT UNSIGNED NOT NULL,
  tasa           DECIMAL(6,4) NOT NULL,
  cuota_mensual  DECIMAL(14,2) NOT NULL,
  saldo_capital  DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_compras_producto FOREIGN KEY (producto_id)
    REFERENCES productos (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- DATOS INICIALES: administrador  ->  usuario: admin   contraseña: Admin123
-- ---------------------------------------------------------------------
INSERT INTO usuarios (identificacion, nombre, celular, username, password_hash, rol, estado, creado_en)
VALUES ('0000000000', 'Administrador MiPlata', '3000000000', 'admin',
        '$2y$10$sGEoqvtDcmdOnjkdEe/q0.Hc4aY0JSeK42CSc8MWehdybXILvAsEq',
        'admin', 'activo', UTC_TIMESTAMP());
