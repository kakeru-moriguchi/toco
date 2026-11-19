-- ============================================================
--  追加マイグレーション 005: 大会内の部門管理
-- ------------------------------------------------------------
--  ・既存データは削除しない
--  ・各大会に「メイン部門」を作り、既存データをそこへ割り当てる
--  ・部門は物理削除せず is_active で無効化する
-- ============================================================

begin;

create table if not exists divisions (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name          text not null,
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tournament_id, name),
  unique (id, tournament_id)
);

create index if not exists divisions_tournament_idx
  on divisions(tournament_id, is_active desc, sort_order, created_at);

insert into divisions (tournament_id, name, sort_order)
select t.id, 'メイン部門', 0
from tournaments t
where not exists (
  select 1 from divisions d where d.tournament_id = t.id
);

alter table leagues add column if not exists division_id uuid references divisions(id) on delete restrict;
alter table teams add column if not exists division_id uuid references divisions(id) on delete restrict;
alter table matches add column if not exists division_id uuid references divisions(id) on delete restrict;
alter table match_events add column if not exists division_id uuid references divisions(id) on delete restrict;

update leagues l
set division_id = (
  select d.id from divisions d
  where d.tournament_id = l.tournament_id
  order by d.sort_order, d.created_at
  limit 1
)
where l.division_id is null
;

update teams t
set division_id = coalesce(
  (select l.division_id from leagues l where l.id = t.league_id),
  (select d.id from divisions d where d.tournament_id = t.tournament_id order by d.sort_order, d.created_at limit 1)
)
where t.division_id is null
;

update matches m
set division_id = coalesce(
  (select l.division_id from leagues l where l.id = m.league_id),
  (select t.division_id from teams t where t.id = m.team_a_id),
  (select t.division_id from teams t where t.id = m.team_b_id),
  (select d.id from divisions d where d.tournament_id = m.tournament_id order by d.sort_order, d.created_at limit 1)
)
where m.division_id is null
;

update match_events e
set division_id = coalesce(
  (select m.division_id from matches m where m.id = e.match_id),
  (select d.id from divisions d where d.tournament_id = e.tournament_id order by d.sort_order, d.created_at limit 1)
)
where e.division_id is null
;

alter table leagues alter column division_id set not null;
alter table teams alter column division_id set not null;
alter table matches alter column division_id set not null;
alter table match_events alter column division_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leagues_division_tournament_fk') then
    alter table leagues add constraint leagues_division_tournament_fk
      foreign key (division_id, tournament_id) references divisions(id, tournament_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'teams_division_tournament_fk') then
    alter table teams add constraint teams_division_tournament_fk
      foreign key (division_id, tournament_id) references divisions(id, tournament_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'matches_division_tournament_fk') then
    alter table matches add constraint matches_division_tournament_fk
      foreign key (division_id, tournament_id) references divisions(id, tournament_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'match_events_division_tournament_fk') then
    alter table match_events add constraint match_events_division_tournament_fk
      foreign key (division_id, tournament_id) references divisions(id, tournament_id) on delete restrict;
  end if;
end $$;

create index if not exists leagues_division_idx on leagues(tournament_id, division_id, sort_order);
create index if not exists teams_division_idx on teams(tournament_id, division_id, sort_order);
create index if not exists matches_division_idx on matches(tournament_id, division_id, match_no);
create index if not exists match_events_division_idx on match_events(tournament_id, division_id, created_at desc);

alter table divisions enable row level security;
drop policy if exists "public read divisions" on divisions;
create policy "public read divisions" on divisions for select using (true);
alter table divisions replica identity full;

grant select on table divisions to anon, authenticated;
grant all privileges on table divisions to service_role;

do $$
begin
  begin execute 'alter publication supabase_realtime add table divisions';
  exception when duplicate_object then null;
  end;
end $$;

commit;

