-- ============================================================
--  追加マイグレーション 009: 部門別設定と時間幅を持つ進行表
-- ------------------------------------------------------------
--  ・大会名/日付/会場/状態は tournaments の共通情報として維持
--  ・競技形式/順位条件/開始時刻/試合時間は divisions ごとに保存
--  ・既存データは null のまま大会既定値を継承するため、表示は変わらない
-- ============================================================

begin;

alter table divisions
  add column if not exists is_public boolean not null default true,
  add column if not exists teams_per_league int,
  add column if not exists point_target int,
  add column if not exists sets_to_win int,
  add column if not exists start_time text,
  add column if not exists finals_start_time text,
  add column if not exists qualifying_minutes_per_match int,
  add column if not exists finals_minutes_per_match int,
  add column if not exists tiebreakers jsonb;

alter table matches
  add column if not exists duration_minutes int;

update matches m
set duration_minutes = t.minutes_per_match
from tournaments t
where m.tournament_id = t.id and m.duration_minutes is null;

alter table tournaments
  add column if not exists schedule_blocks jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'divisions_teams_per_league_check') then
    alter table divisions add constraint divisions_teams_per_league_check check (teams_per_league is null or teams_per_league between 2 and 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'divisions_point_target_check') then
    alter table divisions add constraint divisions_point_target_check check (point_target is null or point_target between 1 and 99);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'divisions_sets_to_win_check') then
    alter table divisions add constraint divisions_sets_to_win_check check (sets_to_win is null or sets_to_win between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'divisions_qualifying_minutes_check') then
    alter table divisions add constraint divisions_qualifying_minutes_check check (qualifying_minutes_per_match is null or qualifying_minutes_per_match between 5 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'divisions_finals_minutes_check') then
    alter table divisions add constraint divisions_finals_minutes_check check (finals_minutes_per_match is null or finals_minutes_per_match between 5 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_duration_minutes_check') then
    alter table matches add constraint matches_duration_minutes_check check (duration_minutes is null or duration_minutes between 5 and 180);
  end if;
end $$;

commit;
