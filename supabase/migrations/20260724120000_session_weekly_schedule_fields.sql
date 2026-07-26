-- ADR-0031: sessions carry a fixed weekly schedule (day_of_week, start_time, end_time).
-- Amends core-schema-and-rls (Built, 73/73) after real center/session data surfaced:
-- every session meets on exactly one fixed weekday at one fixed time (e.g. pilot
-- target Frisco F3 = Sunday 2:00-3:30PM; Saaket S4 = Friday 6:45-8:15PM). Nullable
-- add -> backfill -> not-null, per ADR-0031's stated migration shape. No RLS/grant
-- change: sessions_*_select policies already scope on session identity/join path,
-- unaffected by additional plain columns.

alter table sessions add column day_of_week smallint;
alter table sessions add column start_time time;
alter table sessions add column end_time time;

-- No production/staging data exists yet for this table (core-schema-and-rls is
-- Built but not yet deployed-staging); this update is a no-op today and exists
-- only so the add/backfill/not-null sequence is safe to replay against any
-- environment that does have rows by the time this runs.
update sessions
set day_of_week = 0, start_time = '00:00', end_time = '00:00'
where day_of_week is null;

alter table sessions alter column day_of_week set not null;
alter table sessions alter column start_time set not null;
alter table sessions alter column end_time set not null;

-- 0=Sunday..6=Saturday, matching Postgres extract(dow from ...) so date-arithmetic
-- in the client/RPC layer never needs a translation table.
alter table sessions add constraint sessions_day_of_week_check check (day_of_week between 0 and 6);
