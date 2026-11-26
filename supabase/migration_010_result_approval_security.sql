-- ============================================================
--  追加マイグレーション 010: 結果承認のチーム本人確認・差し戻し
-- ============================================================

begin;

create table if not exists team_result_credentials (
  team_id uuid primary key references teams(id) on delete cascade,
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

alter table team_result_credentials enable row level security;
revoke all on table team_result_credentials from anon, authenticated;
grant all privileges on table team_result_credentials to service_role;

alter table matches
  add column if not exists rejection_reason text,
  add column if not exists rejected_by_team_id uuid references teams(id) on delete set null,
  add column if not exists rejected_at timestamptz;

alter table matches drop constraint if exists matches_approval_status_check;
alter table matches add constraint matches_approval_status_check
  check (approval_status in ('none', 'pending', 'approved', 'rejected'));

commit;
