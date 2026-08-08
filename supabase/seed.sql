-- ============================================================
--  練習用サンプルデータ（16チーム / 4リーグ）
--  本番の大会前に「操作の練習」をしたいときだけ実行してください。
--  実行すると既存のチーム・試合はすべて削除されます。
--  ※ 対戦カードの作成は、この後に管理画面の
--     「対戦・結果」→「リーグ戦の対戦カードを作成する」で行います。
-- ============================================================

do $$
declare
  t_id uuid;
  l_ids uuid[];
  names text[] := array[
    'サンダーズ','レイクブリーズ','ペッパーズ','ノースウインド',
    'グリーンハウス','リバーサイド','スカイフォックス','オレンジ',
    'ドリブンズ','ベイスターズ','ハーバー','クローバー',
    'サンセット','ミッドナイト','フェザーズ','ローリングス'
  ];
  members text[] := array[
    '山田/佐藤','鈴木/高橋','田中/伊藤','渡辺/中村',
    '小林/加藤','吉田/山口','松本/井上','木村/林',
    '斉藤/清水','山崎/森','池田/橋本','阿部/石川',
    '前田/藤田','岡田/後藤','長谷川/村上','近藤/坂本'
  ];
  i int;
begin
  select id into t_id from tournaments order by created_at limit 1;
  if t_id is null then
    insert into tournaments (name) values ('練習用大会') returning id into t_id;
  end if;

  update tournaments
     set name = coalesce(nullif(name, ''), '練習用ピックルボール大会'),
         event_date = coalesce(event_date, current_date),
         venue = coalesce(nullif(venue, ''), '市民体育館'),
         league_count = 4,
         teams_per_league = 4,
         advance_per_league = 2,
         phase = 'setup'
   where id = t_id;

  delete from matches where tournament_id = t_id;
  delete from teams   where tournament_id = t_id;
  delete from leagues where tournament_id = t_id;

  insert into leagues (tournament_id, name, sort_order)
  select t_id, n, ord
    from unnest(array['A','B','C','D'], array[0,1,2,3]) as x(n, ord);

  select array_agg(id order by sort_order) into l_ids
    from leagues where tournament_id = t_id;

  for i in 1..16 loop
    insert into teams (tournament_id, league_id, name, members, sort_order)
    values (
      t_id,
      l_ids[((i - 1) / 4) + 1],   -- 1〜4番目=Aリーグ, 5〜8=Bリーグ …
      names[i],
      members[i],
      ((i - 1) / 4) * 1000 + ((i - 1) % 4)
    );
  end loop;
end $$;
