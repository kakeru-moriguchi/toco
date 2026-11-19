-- ============================================================
--  追加マイグレーション 004: 複数大会と安全なアーカイブ
-- ------------------------------------------------------------
--  ・既存の大会・チーム・試合・結果は削除しない
--  ・大会の物理削除は行わず、archived_at で一覧から退避する
--  ・何度実行しても同じ状態になる
-- ============================================================

alter table tournaments
  add column if not exists archived_at timestamptz;

create index if not exists tournaments_active_idx
  on tournaments(archived_at, event_date desc, created_at desc);

