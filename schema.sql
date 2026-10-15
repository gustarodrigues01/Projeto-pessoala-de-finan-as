CREATE DATABASE IF NOT EXISTS familia_prospera
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Execute este arquivo conectado como administrador do MariaDB.
-- Substitua a senha abaixo e use a mesma em DB_PASSWORD no arquivo .env.
-- Recria somente o usuário do aplicativo; não apaga os dados das tabelas.
CREATE OR REPLACE USER 'familia_app'@'127.0.0.1'
  IDENTIFIED VIA mysql_native_password
  USING PASSWORD(@Gusta2008);

GRANT ALL PRIVILEGES ON familia_prospera.* TO 'familia_app'@'127.0.0.1';

USE familia_prospera;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_salt CHAR(32) CHARACTER SET ascii NOT NULL,
  password_hash BINARY(64) NOT NULL,
  created_at VARCHAR(30) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  user_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at BIGINT NOT NULL,
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_state (
  user_id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  state_json LONGTEXT NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  CONSTRAINT user_state_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
