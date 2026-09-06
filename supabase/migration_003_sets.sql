-- ============================================================
--  追加マイグレーション 003: セット制（2セット先取など）に対応
-- ------------------------------------------------------------
--  ・試合ごとに各セットのスコアを保存できるようにする
--  ・大会設定で「何セット先取か」を指定できるようにする
--
--  Supabase の SQL Editor でこのファイルの内容を実行してください。
--  ・既存のチーム・試合・結果は削除されません
--  ・何度実行しても同じ状態になります
-- ============================================================

-- 1) 何セット先取か（1 = 1セットのみ / 2 = 3セット中2セット先取）
alter table tournaments
  add column if not exists sets_to_win int not null default 1;

-- 2) 各セットのスコア。[{"a":11,"b":7},{"a":9,"b":11},{"a":11,"b":5}]
alter table matches
  add column if not exists sets jsonb not null default '[]'::jsonb;

-- 3) すでに入力済みの結果を、1セットぶんのスコアとして移し替える
update matches
   set sets = jsonb_build_array(jsonb_build_object('a', score_a, 'b', score_b))
 where score_a is not null
   and score_b is not null
   and (sets is null or jsonb_array_length(sets) = 0);
