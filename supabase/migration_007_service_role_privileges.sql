-- ============================================================
--  追加マイグレーション 007: 管理API用DB権限
-- ------------------------------------------------------------
--  ・service_role に大会運営テーブルの管理権限を付与する
--  ・既存データ、RLSポリシー、テーブル構造は変更しない
--  ・何度実行しても同じ状態になる
-- ============================================================

grant usage on schema public to service_role;

grant all privileges on table
  public.tournaments,
  public.divisions,
  public.leagues,
  public.teams,
  public.matches,
  public.match_events
to service_role;
