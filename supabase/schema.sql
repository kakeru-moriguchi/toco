-- ============================================================
--  Rally Board / ピックルボール大会運営システム  スキーマ定義
--  Supabase の SQL Editor にこのファイルの内容を貼り付けて実行してください。
--  （何度実行しても同じ状態になるように書いてあります）
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 大会（1レコード＝1大会。通常は1行だけ使う）
-- ------------------------------------------------------------
create table if not exists tournaments (
  id                 uuid primary key default gen_random_uuid(),
  name               text        not null default '第1回 ピックルボール大会',
  event_date         date,
  venue              text        not null default '',
  note               text        not null default '',
  -- 大会設計（16チーム以外でも使えるように管理画面から変更可能）
  league_count       int         not null default 4,
  teams_per_league   int         not null default 4,
  point_target       int         not null default 11,   -- 1セット何点先取か（表示用の目安）
  -- 何セット先取か。1 = 1セットのみ / 2 = 3セット中2セット先取
  sets_to_win        int         not null default 1,
  -- 進行表の自動割り当て設定
  start_time         text        not null default '09:00',
  minutes_per_match  int         not null default 20,
  schedule_blocks    jsonb       not null default '[]'::jsonb,
  courts             text[]      not null default array['1','2','3','4'],
  -- 順位決定の優先順位。順位計算ロジックは独立させてあるので、
  -- ここの並びを変えるだけで同率時のルールを差し替えられる。
  -- 使える値: wins / diff / points_for / points_against / head_to_head / win_rate
  tiebreakers        text[]      not null default array['wins','diff','points_for'],
  -- 順位別ラウンド（Aトーナメント / Bトーナメント / Cリーグ …）の定義。
  --   mode   : top(上位から) / bottom(下位から) / rest(残り全部)
  --   format : bracket(トーナメント) / league(総当たり)
  -- mode を使うことで、リーグごとにチーム数が違っても振り分けが崩れない。
  bracket_tiers      jsonb       not null default
    '[{"key":"A","name":"Aトーナメント","mode":"top","from_rank":1,"to_rank":2,"bottom_count":1,"format":"bracket","third_place":true},
      {"key":"B","name":"Bトーナメント","mode":"rest","from_rank":3,"to_rank":3,"bottom_count":1,"format":"bracket","third_place":true},
      {"key":"C","name":"Cリーグ","mode":"bottom","from_rank":4,"to_rank":4,"bottom_count":1,"format":"league","third_place":false}]'::jsonb,
  phase              text        not null default 'setup'
                       check (phase in ('setup','league','bracket','finished')),
  -- 一覧から安全に退避するための論理アーカイブ。関連データは削除しない。
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists tournaments_active_idx
  on tournaments(archived_at, event_date desc, created_at desc);

-- ------------------------------------------------------------
-- 部門（初中級 / 中上級 / 50歳以上 など）
-- ------------------------------------------------------------
create table if not exists divisions (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name          text not null,
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  is_public     boolean not null default true,
  teams_per_league int check (teams_per_league is null or teams_per_league between 2 and 20),
  point_target int check (point_target is null or point_target between 1 and 99),
  sets_to_win int check (sets_to_win is null or sets_to_win between 1 and 5),
  start_time text,
  finals_start_time text,
  qualifying_minutes_per_match int check (qualifying_minutes_per_match is null or qualifying_minutes_per_match between 5 and 180),
  finals_minutes_per_match int check (finals_minutes_per_match is null or finals_minutes_per_match between 5 and 180),
  tiebreakers jsonb,
  -- 部門別大会形式。null は tournaments の共通設定を継承する。
  league_count  int check (league_count is null or league_count between 1 and 26),
  courts        text[],
  bracket_tiers jsonb,
  finals_enabled boolean not null default true,
  qualifying_match_order text not null default 'balanced'
    check (qualifying_match_order in ('balanced','toco_5_team')),
  game_labels   text[],
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tournament_id, name),
  unique (id, tournament_id)
);
create index if not exists divisions_tournament_idx
  on divisions(tournament_id, is_active desc, sort_order, created_at);

-- ------------------------------------------------------------
-- リーグ（A / B / C / D ...）
-- ------------------------------------------------------------
create table if not exists leagues (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  division_id   uuid not null references divisions(id) on delete restrict,
  name          text not null,                -- '①' など（表示は「①リーグ」）
  sort_order    int  not null default 0,
  -- 総当たり形式の級（例: Cリーグ）用。予選のリーグは null。
  tier_key      text,
  created_at    timestamptz not null default now()
);
create index if not exists leagues_tournament_idx on leagues(tournament_id, sort_order);
create index if not exists leagues_division_idx on leagues(tournament_id, division_id, sort_order);
create index if not exists leagues_tier_idx on leagues(tournament_id, tier_key);

-- ------------------------------------------------------------
-- チーム
-- ------------------------------------------------------------
create table if not exists teams (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  division_id   uuid not null references divisions(id) on delete restrict,
  league_id     uuid references leagues(id) on delete set null,
  name          text not null,
  members       text not null default '',     -- 「山田/佐藤」のようなメンバー名
  sort_order    int  not null default 0,      -- リーグ内の表示順（A1, A2 ...）
  created_at    timestamptz not null default now()
);
create index if not exists teams_tournament_idx on teams(tournament_id, sort_order);
create index if not exists teams_division_idx on teams(tournament_id, division_id, sort_order);
create index if not exists teams_league_idx on teams(league_id, sort_order);

-- ------------------------------------------------------------
-- 試合（リーグ戦・決勝トーナメント共通）
-- ------------------------------------------------------------
create table if not exists matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  division_id   uuid not null references divisions(id) on delete restrict,
  stage         text not null check (stage in ('league','bracket')),

  -- リーグ戦用
  league_id     uuid references leagues(id) on delete cascade,

  -- トーナメント用
  tier_key       text,               -- どの級の試合か（'A' / 'B' / 'C' …）
  round          int,                -- 1 = 初戦, 2, 3 ... 大きいほど決勝に近い
  bracket_index  int,                -- ラウンド内の上からの位置（0始まり）
  is_third_place boolean not null default false,

  -- 進行表
  match_no      int  not null default 0,   -- 試合番号（進行順）
  court         text not null default '',
  scheduled_at  text not null default '',  -- 'HH:MM' 形式の予定時刻
  duration_minutes int check (duration_minutes is null or duration_minutes between 5 and 180),
  status        text not null default 'pending'
                  check (status in ('pending','in_progress','done')),

  -- 対戦カード。トーナメント初期は team が null で label に「Aリーグ1位」等が入る
  team_a_id     uuid references teams(id) on delete set null,
  team_b_id     uuid references teams(id) on delete set null,
  team_a_label  text not null default '',
  team_b_label  text not null default '',

  -- 結果
  -- 各セットのスコア: [{"a":11,"b":7},{"a":9,"b":11}]
  sets           jsonb not null default '[]'::jsonb,
  -- 全セットの合計点。順位表の得点・失点に使う
  score_a        int,
  score_b        int,
  winner_team_id uuid references teams(id) on delete set null,

  -- 勝者・敗者の進出先（トーナメント）
  next_match_id       uuid references matches(id) on delete set null,
  next_slot           text check (next_slot in ('a','b')),
  loser_next_match_id uuid references matches(id) on delete set null,
  loser_next_slot     text check (loser_next_slot in ('a','b')),

  reported_at   timestamptz,
  reported_by   text,                        -- 'team' / 'admin'

  -- 参加者入力は承認されるまで正式結果へ反映しない
  approval_status         text not null default 'none'
                            check (approval_status in ('none','pending','approved','rejected')),
  pending_sets            jsonb not null default '[]'::jsonb,
  pending_score_a         int,
  pending_score_b         int,
  pending_winner_team_id  uuid references teams(id) on delete set null,
  submitted_by_team_id    uuid references teams(id) on delete set null,
  submitted_at            timestamptz,
  approved_by_team_id     uuid references teams(id) on delete set null,
  approved_at             timestamptz,
  rejection_reason        text,
  rejected_by_team_id     uuid references teams(id) on delete set null,
  rejected_at             timestamptz,
  updated_at    timestamptz not null default now()
);
create index if not exists matches_tournament_idx on matches(tournament_id, match_no);
create index if not exists matches_division_idx on matches(tournament_id, division_id, match_no);
create index if not exists matches_league_idx on matches(league_id);
create index if not exists matches_stage_idx on matches(tournament_id, stage, tier_key, round, bracket_index);

-- ------------------------------------------------------------
-- 結果の履歴（監査ログ）
--   将来の「相手チームによる承認」「主催者による修正履歴」「PINコード」の土台。
-- ------------------------------------------------------------
create table if not exists match_events (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  division_id   uuid not null references divisions(id) on delete restrict,
  match_id      uuid not null references matches(id) on delete cascade,
  action        text not null,          -- 'report_pending' / 'approve' / 'admin_edit' / 'reset' / 'status'
  score_a       int,
  score_b       int,
  actor         text not null default 'team',
  payload       jsonb  not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists match_events_match_idx on match_events(match_id, created_at desc);
create index if not exists match_events_division_idx on match_events(tournament_id, division_id, created_at desc);

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

-- ------------------------------------------------------------
-- 行レベルセキュリティ
--   参加者ブラウザ（anonキー）は「読むだけ」。
--   書き込みは Next.js の API Route が service_role キーで行うため、
--   anon 向けの insert/update/delete ポリシーは意図的に作らない。
-- ------------------------------------------------------------
create table if not exists team_result_credentials (
  team_id uuid primary key references teams(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);
alter table team_result_credentials enable row level security;
revoke all on table team_result_credentials from anon, authenticated;
grant all privileges on table team_result_credentials to service_role;

alter table tournaments  enable row level security;
alter table divisions    enable row level security;
alter table leagues      enable row level security;
alter table teams        enable row level security;
alter table matches      enable row level security;
alter table match_events enable row level security;

drop policy if exists "public read tournaments"  on tournaments;
drop policy if exists "public read divisions"    on divisions;
drop policy if exists "public read leagues"      on leagues;
drop policy if exists "public read teams"        on teams;
drop policy if exists "public read matches"      on matches;

create policy "public read tournaments" on tournaments for select using (true);
create policy "public read divisions"   on divisions   for select using (true);
create policy "public read leagues"     on leagues     for select using (true);
create policy "public read teams"       on teams       for select using (true);
create policy "public read matches"     on matches     for select using (true);
-- match_events は参加者に見せないので select ポリシーを作らない（＝anonからは読めない）

grant select on table divisions to anon, authenticated;
grant all privileges on table
  tournaments,
  divisions,
  leagues,
  teams,
  matches,
  match_events
to service_role;

-- ------------------------------------------------------------
-- リアルタイム配信の対象テーブル
--   （結果が入力されたら他のスマホにも自動反映するために必要）
-- ------------------------------------------------------------
alter table tournaments replica identity full;
alter table divisions   replica identity full;
alter table leagues     replica identity full;
alter table teams       replica identity full;
alter table matches     replica identity full;

do $$
begin
  begin execute 'alter publication supabase_realtime add table tournaments'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table divisions';   exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table leagues';     exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table teams';       exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table matches';     exception when duplicate_object then null; end;
end $$;

-- ------------------------------------------------------------
-- 初期データ（大会が1件も無ければ空の大会を1件作る）
-- ------------------------------------------------------------
insert into tournaments (name, venue, note)
select '第1回 ピックルボール大会', '', ''
where not exists (select 1 from tournaments);

insert into divisions (tournament_id, name, sort_order)
select id, 'メイン部門', 0 from tournaments
where not exists (select 1 from divisions where divisions.tournament_id = tournaments.id);

-- 初戦敗退者の単発コンソレーション。既存試合は変更しない。
begin;
alter table divisions add column if not exists consolation_enabled boolean not null default false;
alter table matches add column if not exists is_consolation boolean not null default false,
  add column if not exists consolation_void boolean not null default false;

-- 大会単位のロックで同時生成・同一チームの二重参加を防ぐ。
create or replace function public.create_consolation_matches(
  p_tournament_id uuid, p_division_id uuid, p_tier_key text, p_rows jsonb
) returns integer language plpgsql set search_path = public as $$
declare item jsonb; team_id uuid; first_match matches%rowtype;
  a uuid; b uuid; start_min int; duration int; court_name text; inserted_count int := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tournament_id::text, 0));
  if not exists (select 1 from divisions where id=p_division_id and tournament_id=p_tournament_id and consolation_enabled and finals_enabled) then
    raise exception '部門のコンソレーション設定を有効にしてください。';
  end if;
  <<pair_loop>>
  for item in select * from jsonb_array_elements(p_rows) loop
    a := (item->>'team_a_id')::uuid; b := (item->>'team_b_id')::uuid;
    if a is null or b is null or a=b then raise exception '異なる2チームを指定してください。'; end if;
    if exists (select 1 from matches m where m.tournament_id=p_tournament_id and m.division_id=p_division_id
      and m.tier_key=p_tier_key and m.is_consolation and not m.consolation_void
      and ((m.team_a_id=a and m.team_b_id=b) or (m.team_a_id=b and m.team_b_id=a))) then
      continue pair_loop;
    end if;
    foreach team_id in array array[a,b] loop
      select * into first_match from matches m
      where m.tournament_id=p_tournament_id and m.division_id=p_division_id and m.tier_key=p_tier_key
        and m.stage='bracket' and not m.is_consolation and not m.is_third_place
        and (m.team_a_id=team_id or m.team_b_id=team_id)
      order by m.round, m.bracket_index limit 1;
      if not found or first_match.status <> 'done' or first_match.approval_status <> 'approved'
        or first_match.winner_team_id is null or first_match.winner_team_id=team_id then
        raise exception '承認済みの初戦敗退チームだけ指定できます。';
      end if;
      if exists (select 1 from matches m where m.tournament_id=p_tournament_id and m.division_id=p_division_id
        and m.is_consolation and not m.consolation_void and (m.team_a_id=team_id or m.team_b_id=team_id)) then
        raise exception 'このチームのコンソレーションは作成済みです。画面を更新してください。';
      end if;
    end loop;
    start_min := split_part(item->>'scheduled_at', ':', 1)::int*60 + split_part(item->>'scheduled_at', ':', 2)::int;
    duration := (item->>'duration_minutes')::int; court_name := item->>'court';
    if duration is null or duration not between 5 and 180 or start_min is null or start_min < 0 or start_min+duration > 1440 or coalesce(court_name,'')='' then
      raise exception '当日中の開始時刻・試合時間・コートを設定してください。';
    end if;
    if exists (select 1 from matches m where m.tournament_id=p_tournament_id and not m.consolation_void
      and m.scheduled_at ~ '^\d{1,2}:\d{2}$' and (m.court=court_name or m.team_a_id in (a,b) or m.team_b_id in (a,b))
      and start_min < split_part(m.scheduled_at, ':', 1)::int*60+split_part(m.scheduled_at, ':', 2)::int+coalesce(m.duration_minutes,duration)
      and split_part(m.scheduled_at, ':', 1)::int*60+split_part(m.scheduled_at, ':', 2)::int < start_min+duration) then
      raise exception '別の試合と時間・コートが重複しています。画面を更新してください。';
    end if;
    if exists (select 1 from tournaments t, lateral jsonb_array_elements(t.schedule_blocks) block
      where t.id=p_tournament_id and start_min < split_part(block->>'end_time',':',1)::int*60+split_part(block->>'end_time',':',2)::int
      and split_part(block->>'start_time',':',1)::int*60+split_part(block->>'start_time',':',2)::int < start_min+duration) then
      raise exception '休憩・予約枠と重複しています。進行表を調整してください。';
    end if;
    insert into matches(tournament_id,division_id,stage,tier_key,is_consolation,team_a_id,team_b_id,
      match_no,court,scheduled_at,duration_minutes,round)
    values(p_tournament_id,p_division_id,'bracket',p_tier_key,true,a,b,
      (select coalesce(max(match_no),0)+1 from matches where tournament_id=p_tournament_id and division_id=p_division_id),
      court_name,item->>'scheduled_at',duration,1);
    inserted_count := inserted_count+1;
  end loop;
  return inserted_count;
end $$;
revoke all on function public.create_consolation_matches(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_consolation_matches(uuid,uuid,text,jsonb) to service_role;
commit;
