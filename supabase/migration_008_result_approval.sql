-- ============================================================
--  追加マイグレーション 008: 相手チームによる結果承認
-- ------------------------------------------------------------
--  ・参加者が入力した結果は pending_* に仮保存する
--  ・敗者側の承認後だけ正式スコアと順位へ反映する
--  ・既存の確定結果は approved として扱う
-- ============================================================

alter table matches
  add column if not exists approval_status text not null default 'none',
  add column if not exists pending_sets jsonb not null default '[]'::jsonb,
  add column if not exists pending_score_a int,
  add column if not exists pending_score_b int,
  add column if not exists pending_winner_team_id uuid references teams(id) on delete set null,
  add column if not exists submitted_by_team_id uuid references teams(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_by_team_id uuid references teams(id) on delete set null,
  add column if not exists approved_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'matches_approval_status_check'
  ) then
    alter table matches add constraint matches_approval_status_check
      check (approval_status in ('none', 'pending', 'approved'));
  end if;
end $$;

update matches
set approval_status = 'approved',
    approved_at = coalesce(reported_at, updated_at)
where status = 'done'
  and approval_status = 'none';
