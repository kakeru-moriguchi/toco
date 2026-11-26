import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST } from '../../src/app/api/admin/matches/route';
import { createSessionToken } from '../../src/lib/auth';
import { getState } from '../../src/lib/data';
import { findCourtConflict, findDependencyConflict, parseTime } from '../../src/lib/schedule';
import { finalsTimetable, qualifyingCard, qualifyingTimetable } from '../fixtures/tocoTimetable';
import type { Match } from '../../src/lib/types';
import type { rehearsalDb } from './rehearsalDb';

export async function verifyTocoTimetable(local: Awaited<ReturnType<typeof rehearsalDb>>, tournamentId: string, divisions: string[]) {
  const states = await Promise.all(divisions.map((id)=>getState(tournamentId,id)));
  const token = await createSessionToken();
  const request = (index: number,updates: unknown[]) => POST(new NextRequest('http://127.0.0.1/api/admin/matches', {
    method:'POST',headers:{'Content-Type':'application/json','X-Tournament-Id':tournamentId,'X-Division-Id':divisions[index],Cookie:`rb_admin=${token}`},
    body:JSON.stringify({action:'bulk_schedule',updates}),
  }));
  const qualifying: (Match & {card: string})[] = qualifyingTimetable.map((planned)=>{
    const {divisionIndex,leagueIndex,a,b} = qualifyingCard(planned.card);
    const state=states[divisionIndex];
    const league=state.leagues.filter((row)=>row.tier_key===null).sort((x,y)=>x.sort_order-y.sort_order)[leagueIndex];
    const teams=state.teams.filter((team)=>team.league_id===league.id).sort((x,y)=>x.sort_order-y.sort_order);
    const match=state.matches.find((m)=>m.stage==='league' && m.league_id===league.id && [m.team_a_id,m.team_b_id].includes(teams[a].id) && [m.team_a_id,m.team_b_id].includes(teams[b].id));
    assert.ok(match,`対戦が見つかりません: ${planned.card}`);
    return {...match,...planned};
  });
  assert.equal(qualifying.length,70);
  assert.equal(new Set(qualifying.map((m)=>m.id)).size,70,'総当たりの重複・欠落がない');
  for(const league of 'ABCDEFG') assert.equal(qualifying.filter((m)=>m.card.startsWith(league)).length,10);
  assert.equal(findCourtConflict(qualifying,new Set(qualifying.map((m)=>m.id))),null);

  // 既存の固定コート構成から全体共有の時刻表に切り替える、使い捨てDB内だけの準備。
  await local.db.query("update matches set scheduled_at='',court='' where tournament_id=$1",[tournamentId]);
  for(const [index,divisionId] of divisions.entries()) {
    const others=await local.db.query<Match>('select * from matches where tournament_id=$1 and division_id<>$2 order by id',[tournamentId,divisionId]);
    const updates=qualifying.filter((m)=>m.division_id===divisionId).map(({id,court,scheduled_at,duration_minutes})=>({id,court,scheduled_at,duration_minutes}));
    const response=await request(index,updates);
    assert.equal(response.status,200,JSON.stringify(await response.json()));
    assert.deepEqual((await local.db.query('select * from matches where tournament_id=$1 and division_id<>$2 order by id',[tournamentId,divisionId])).rows,others.rows);
    const saved=(await getState(tournamentId,divisionId)).matches;
    for(const row of updates) {
      const match=saved.find((m)=>m.id===row.id)!;
      assert.equal(match.scheduled_at,row.scheduled_at);
      assert.equal(match.court,row.court);
      assert.equal(match.duration_minutes,row.duration_minutes);
    }
  }
  const initial=qualifying.find((m)=>m.division_id===divisions[0])!;
  const foreign=qualifying.find((m)=>m.division_id===divisions[1])!;
  assert.equal((await request(0,[{id:foreign.id,scheduled_at:'18:00'}])).status,400);
  // 新しく指定したコートも、全館休憩を回避する必要がある。
  const blocked=await request(0,[{id:initial.id,court:'検証追加コート',scheduled_at:'13:10',duration_minutes:30}]);
  assert.equal(blocked.status,400);
  assert.match((await blocked.json()).error,/13:00|13:10/);

  const used = new Set<string>();
  const finals = finalsTimetable.flatMap((planned)=>{
    const state=states[planned.divisionIndex];
    const main=state.matches.filter((m)=>m.stage==='bracket' && m.tier_key===planned.tierKey && !m.is_consolation && !m.is_third_place);
    const finalRound=Math.max(...main.map((m)=>m.round ?? 0));
    const targetRound=finalRound-(planned.kind==='semifinal' ? 1 : planned.kind==='quarterfinal' ? 2 : 0);
    const choices=planned.kind==='consolation'
      ? state.matches.filter((m)=>m.is_consolation && m.tier_key===planned.tierKey)
      : main.filter((m)=>m.round===targetRound);
    const match=choices.sort((a,b)=>(a.bracket_index ?? 0)-(b.bracket_index ?? 0) || a.match_no-b.match_no)[planned.index];
    if(!match) { assert.equal(planned.kind,'consolation','本戦の欠落は許可しない'); return []; }
    assert.equal(used.has(match.id),false); used.add(match.id);
    return [{...match,...planned}];
  });
  assert.equal(finals.length,30);
  assert.equal(finals.filter((m)=>m.duration_minutes===null).length,6);
  assert.equal(finals.some((m)=>m.scheduled_at==='16:00' && m.court==='8'),false,'8面は予備');
  assert.equal(finals.filter((m)=>m.tier_key==='lower' && m.kind==='final').length,1);

  // 未確定の6枠を勝手に15分にしない。45分の仮置きなら重複・前後関係を検出する。
  const unresolved=new Set(finals.filter((m)=>m.duration_minutes===null).map((m)=>m.id));
  const proposed=[...qualifying,...finals.map((m)=>({...m,duration_minutes:m.duration_minutes ?? 45}))];
  assert.ok(findCourtConflict(proposed,new Set(proposed.map((m)=>m.id))));
  assert.ok(findDependencyConflict(proposed,new Set(proposed.map((m)=>m.id))));
  for(const index of [0,1]) {
    const before=(await getState(tournamentId,divisions[index])).matches;
    const updates=finals.filter((m)=>m.division_id===divisions[index]).map(({id,court,scheduled_at,duration_minutes})=>({id,court,scheduled_at,duration_minutes:duration_minutes ?? 45}));
    const rejected=await request(index,updates);
    assert.equal(rejected.status,400,'45分のままではPDFの決勝時刻を保存してはいけない');
    assert.match((await rejected.json()).error,/15:45|16:00/);
    assert.deepEqual((await getState(tournamentId,divisions[index])).matches,before,'検証失敗時に一部だけ書き換えない');
  }

  // 確定済みの枠だけを保存。未確定枠は空欄のまま残し、完了扱いにしない。
  for(const index of [0,1]) {
    const updates=finals.filter((m)=>m.division_id===divisions[index] && !unresolved.has(m.id)).map(({id,court,scheduled_at,duration_minutes})=>({id,court,scheduled_at,duration_minutes}));
    const response=await request(index,updates);
    assert.equal(response.status,200,JSON.stringify(await response.json()));
  }
  const {rows: saved}=await local.db.query<Match>('select * from matches where tournament_id=$1 and not consolation_void',[tournamentId]);
  assert.equal(saved.filter((m)=>m.scheduled_at).length,94);
  assert.ok(saved.filter((m)=>unresolved.has(m.id)).every((m)=>m.scheduled_at===''));
  assert.equal(findCourtConflict(saved,new Set(saved.map((m)=>m.id))),null);
  assert.equal(findDependencyConflict(saved,new Set(saved.map((m)=>m.id))),null);
  assert.ok(saved.filter((m)=>m.scheduled_at).every((m)=>parseTime(m.scheduled_at)+(m.duration_minutes ?? 0)<=16*60+45));
}
