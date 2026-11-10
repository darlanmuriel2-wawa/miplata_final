-- =====================================================================
-- Mi Plata · ACTUALIZACIÓN de la base de datos (de la versión 3 a la 4)
--
-- Úsalo SOLO si ya importaste la versión anterior de miplata.sql y NO quieres perder
-- los usuarios y movimientos que ya tienes. (Si no te importan los datos, es más fácil
-- volver a importar database/miplata.sql completo.)
--
-- Cómo: phpMyAdmin -> base de datos "miplata" -> pestaña "Importar" -> este archivo.
-- Ejecútalo UNA sola vez (si lo repites dará error de "columna duplicada").
--
-- Qué agrega: la tabla de comprobantes de transferencia y el enlace en los movimientos.
-- Las transferencias hechas antes de la actualización no tienen comprobante.
-- =====================================================================

USE miplata;

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

ALTER TABLE movimientos
  ADD COLUMN transferencia_id BIGINT UNSIGNED NULL AFTER descripcion,
  ADD KEY idx_movimientos_transferencia (transferencia_id),
  ADD CONSTRAINT fk_movimientos_transferencia FOREIGN KEY (transferencia_id)
    REFERENCES transferencias (id) ON DELETE SET NULL;
