-- Petals' Postgres roles and a database, run once per database by the superuser, through psql:
--   PETAL_OWNER_PASSWORD=… PETAL_APP_PASSWORD=… PETAL_DB_NAME=petals PETAL_DB_SERVED=1 psql -U postgres -f db-setup.sql
-- Two roles (specs/003-target/proposal-database.md, and research/postgres-capabilities-learning.md):
--   petals_owner  owns the database and its schema, and migrates it, by hand (scripts/db-migrate.ts)
--   petals_app    the running server: reads and writes rows, and nothing else. Not a superuser, no
--                 BYPASSRLS, owns no table, can't create one. It may connect only to a served database.
-- Text sorts by bytes (the builtin C.UTF-8 locale), as SQLite did, so lists keep their order.
-- Run again, it changes nothing but the passwords. It prints no password.
\set ON_ERROR_STOP on
\getenv owner_pw PETAL_OWNER_PASSWORD
\getenv app_pw PETAL_APP_PASSWORD
\getenv dbname PETAL_DB_NAME
\getenv served PETAL_DB_SERVED

SELECT 'CREATE ROLE petals_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'petals_owner') \gexec
SELECT 'CREATE ROLE petals_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT'
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'petals_app') \gexec
SELECT format('ALTER ROLE petals_owner PASSWORD %L', :'owner_pw') \gexec
SELECT format('ALTER ROLE petals_app PASSWORD %L', :'app_pw') \gexec

SELECT format(
  'CREATE DATABASE %I OWNER petals_owner TEMPLATE template0 ENCODING %L LOCALE_PROVIDER builtin BUILTIN_LOCALE %L',
  :'dbname', 'UTF8', 'C.UTF-8')
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'dbname') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'dbname') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO petals_app', :'dbname') WHERE :'served' = '1' \gexec
SELECT format('REVOKE CONNECT ON DATABASE %I FROM petals_app', :'dbname') WHERE :'served' <> '1' \gexec

\connect :dbname
ALTER SCHEMA public OWNER TO petals_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO petals_app;
