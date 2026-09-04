-- ============================================================
--  追加マイグレーション 002: 決勝ラウンドの柔軟化
-- ------------------------------------------------------------
--  ・級の対象を「上位から / 下位から / 残り全部」で指定できるようにする
--    （リーグごとにチーム数が違っても正しく振り分けられる）
--  ・級ごとに「トーナメント」か「総当たり」かを選べるようにする
--
--  Supabase の SQL Editor でこのファイルの内容を実行してください。
--  ・既存のチーム・試合・結果は削除されません
--  ・何度実行しても同じ状態になります
-- ============================================================

-- 1) 総当たり形式の級は、内部でリーグを1つ作って扱う。
--    予選のリーグと区別するため、どの級のリーグかを持たせる（予選は null）。
alter table leagues
  add column if not exists tier_key text;

create index if not exists leagues_tier_idx on leagues(tournament_id, tier_key);

-- 2) 既存の級設定に、新しい項目（mode / format / bottom_count）を補う。
--    今まで作った級はすべて「上位から・トーナメント」だったので、その値を入れる。
update tournaments
   set bracket_tiers = (
     select jsonb_agg(
       t || jsonb_build_object(
         'mode',         coalesce(t->>'mode', 'top'),
         'format',       coalesce(t->>'format', 'bracket'),
         'bottom_count', coalesce((t->>'bottom_count')::int, 1)
       )
     )
     from jsonb_array_elements(bracket_tiers) as t
   )
 where bracket_tiers is not null
   and jsonb_typeof(bracket_tiers) = 'array'
   and jsonb_array_length(bracket_tiers) > 0;
