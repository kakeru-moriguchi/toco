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
