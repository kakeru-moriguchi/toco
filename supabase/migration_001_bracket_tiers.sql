-- ============================================================
--  追加マイグレーション 001: 順位別トーナメント（A級 / B級 / C級）対応
-- ------------------------------------------------------------
--  すでに schema.sql を実行済みのデータベースに対して、
--  Supabase の SQL Editor でこのファイルの内容を実行してください。
--
--  ・既存のチーム・試合・結果は削除されません
--  ・何度実行しても同じ状態になります
-- ============================================================

-- 1) 大会設定に「級」の定義を追加
alter table tournaments
  add column if not exists bracket_tiers jsonb not null default
    '[{"key":"A","name":"A級","from_rank":1,"to_rank":2,"third_place":true},
      {"key":"B","name":"B級","from_rank":3,"to_rank":3,"third_place":false},
      {"key":"C","name":"C級","from_rank":4,"to_rank":4,"third_place":false}]'::jsonb;

-- 2) 試合に「どの級か」を追加（リーグ戦は null のまま）
alter table matches
  add column if not exists tier_key text;

-- 3) 既存のトーナメント試合があれば、すべてA級として扱う
update matches set tier_key = 'A'
 where stage = 'bracket' and tier_key is null;

-- 4) 検索用インデックスの張り替え
drop index if exists matches_stage_idx;
create index if not exists matches_stage_idx
  on matches(tournament_id, stage, tier_key, round, bracket_index);

-- 5) リアルタイム配信の対象は schema.sql で設定済み（変更なし）
