-- 部門ごとにリーグ数・使用コート・決勝方式・予選順・ゲーム名を設定する。
-- 既存値は null のままにし、大会共通設定を継承させるため挙動は変わらない。

alter table divisions
  add column if not exists league_count int,
  add column if not exists courts text[],
  add column if not exists bracket_tiers jsonb,
  add column if not exists finals_enabled boolean not null default true,
  add column if not exists qualifying_match_order text not null default 'balanced',
  add column if not exists game_labels text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'divisions_league_count_check') then
    alter table divisions add constraint divisions_league_count_check
      check (league_count is null or league_count between 1 and 26);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'divisions_match_order_check') then
    alter table divisions add constraint divisions_match_order_check
      check (qualifying_match_order in ('balanced','toco_5_team'));
  end if;
end $$;
