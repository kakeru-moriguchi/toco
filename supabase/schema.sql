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
  point_target       int         not null default 11,   -- 何点先取か（入力バリデーションの目安）
  -- 進行表の自動割り当て設定
  start_time         text        not null default '09:00',
  minutes_per_match  int         not null default 20,
  courts             text[]      not null default array['1','2','3','4'],
  -- 順位決定の優先順位。順位計算ロジックは独立させてあるので、
  -- ここの並びを変えるだけで同率時のルールを差し替えられる。
  -- 使える値: wins / diff / points_for / points_against / head_to_head / win_rate
  tiebreakers        text[]      not null default array['wins','diff','points_for'],
  -- 順位別トーナメント（A級/B級/C級…）の定義。
  -- 各リーグの何位から何位までを、どの級に入れるかを持つ。
  bracket_tiers      jsonb       not null default
    '[{"key":"A","name":"A級","from_rank":1,"to_rank":2,"third_place":true},
      {"key":"B","name":"B級","from_rank":3,"to_rank":3,"third_place":false},
      {"key":"C","name":"C級","from_rank":4,"to_rank":4,"third_place":false}]'::jsonb,
  phase              text        not null default 'setup'
                       check (phase in ('setup','league','bracket','finished')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ------------------------------------------------------------
-- リーグ（A / B / C / D ...）
-- ------------------------------------------------------------
create table if not exists leagues (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  name          text not null,                -- 'A' など（表示は「Aリーグ」）
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists leagues_tournament_idx on leagues(tournament_id, sort_order);

-- ------------------------------------------------------------
-- チーム
-- ------------------------------------------------------------
create table if not exists teams (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  league_id     uuid references leagues(id) on delete set null,
  name          text not null,
  members       text not null default '',     -- 「山田/佐藤」のようなメンバー名
  sort_order    int  not null default 0,      -- リーグ内の表示順（A1, A2 ...）
  created_at    timestamptz not null default now()
);
create index if not exists teams_tournament_idx on teams(tournament_id, sort_order);
create index if not exists teams_league_idx on teams(league_id, sort_order);

-- ------------------------------------------------------------
-- 試合（リーグ戦・決勝トーナメント共通）
-- ------------------------------------------------------------
create table if not exists matches (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
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
  status        text not null default 'pending'
                  check (status in ('pending','in_progress','done')),

  -- 対戦カード。トーナメント初期は team が null で label に「Aリーグ1位」等が入る
  team_a_id     uuid references teams(id) on delete set null,
  team_b_id     uuid references teams(id) on delete set null,
  team_a_label  text not null default '',
  team_b_label  text not null default '',

  -- 結果
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
  updated_at    timestamptz not null default now()
);
create index if not exists matches_tournament_idx on matches(tournament_id, match_no);
create index if not exists matches_league_idx on matches(league_id);
create index if not exists matches_stage_idx on matches(tournament_id, stage, tier_key, round, bracket_index);

-- ------------------------------------------------------------
-- 結果の履歴（監査ログ）
--   将来の「相手チームによる承認」「主催者による修正履歴」「PINコード」の土台。
-- ------------------------------------------------------------
create table if not exists match_events (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  match_id      uuid not null references matches(id) on delete cascade,
  action        text not null,          -- 'report' / 'admin_edit' / 'reset' / 'status'
  score_a       int,
  score_b       int,
  actor         text not null default 'team',
  payload       jsonb  not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists match_events_match_idx on match_events(match_id, created_at desc);

-- ------------------------------------------------------------
-- 行レベルセキュリティ
--   参加者ブラウザ（anonキー）は「読むだけ」。
--   書き込みは Next.js の API Route が service_role キーで行うため、
--   anon 向けの insert/update/delete ポリシーは意図的に作らない。
-- ------------------------------------------------------------
alter table tournaments  enable row level security;
alter table leagues      enable row level security;
alter table teams        enable row level security;
alter table matches      enable row level security;
alter table match_events enable row level security;

drop policy if exists "public read tournaments"  on tournaments;
drop policy if exists "public read leagues"      on leagues;
drop policy if exists "public read teams"        on teams;
drop policy if exists "public read matches"      on matches;

create policy "public read tournaments" on tournaments for select using (true);
create policy "public read leagues"     on leagues     for select using (true);
create policy "public read teams"       on teams       for select using (true);
create policy "public read matches"     on matches     for select using (true);
-- match_events は参加者に見せないので select ポリシーを作らない（＝anonからは読めない）

-- ------------------------------------------------------------
-- リアルタイム配信の対象テーブル
--   （結果が入力されたら他のスマホにも自動反映するために必要）
-- ------------------------------------------------------------
alter table tournaments replica identity full;
alter table leagues     replica identity full;
alter table teams       replica identity full;
alter table matches     replica identity full;

do $$
begin
  begin execute 'alter publication supabase_realtime add table tournaments'; exception when duplicate_object then null; end;
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
