import assert from 'node:assert/strict';
import test from 'node:test';
import { rehearsalDb } from './helpers/rehearsalDb';
import type { Match } from '../src/lib/types';

test('PDF tournament rehearsal against local PostgreSQL: 35 teams, 70 qualifying matches, finals and consolation', { timeout: 180000 }, async (context) => {
  const local = await rehearsalDb();
  process.env.NEXT_PUBLIC_SUPABASE_URL = local.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'rehearsal-only';
  try {
    const { hashTeamPin } = await import('../src/lib/teamResultAuth');
    const { getState, ensureLeagues, regenerateLeagueMatches, submitResultForApproval, rejectPendingResult, approvePendingResult, generateBracket, saveResult, syncConsolation, autoAssignSchedule } = await import('../src/lib/data');
    const { computeAllStandings } = await import('../src/lib/standings');
    const { findCourtConflict, findDependencyConflict, parseTime } = await import('../src/lib/schedule');
    const { consolationCandidates } = await import('../src/lib/consolation');
    const { rows: tournaments } = await local.db.query<{id:string}>(`insert into tournaments(name,start_time,minutes_per_match,courts,schedule_blocks) values ('検証専用大会','09:00',30,array['1','2','3','4','5','6','7','8'],'[{"label":"レクリエーション","start_time":"13:00","end_time":"13:30"}]') returning id`);
    const tournamentId = tournaments[0].id;
    const rankTiers = Array.from({length:5},(_,i)=>({key:`rank${i+1}`,name:`${i+1}位トーナメント`,mode:'top',from_rank:i+1,to_rank:i+1,bottom_count:1,format:'bracket',third_place:false}));
    const openTiers = [{key:'upper',name:'上位',mode:'top',from_rank:1,to_rank:2,bottom_count:1,format:'bracket',third_place:false},{key:'lower',name:'下位',mode:'rest',from_rank:3,to_rank:5,bottom_count:1,format:'bracket',third_place:false}];
    const specs = [{name:'初中級',leagues:4,teams:20,courts:['1','2','3','4'],tiers:rankTiers,finals:true},{name:'中上級',leagues:2,teams:10,courts:['5','6'],tiers:openTiers,finals:true},{name:'50+',leagues:1,teams:5,courts:['7','8'],tiers:[],finals:false}];
    const divisions: string[] = [];
    const pins = new Map<string,string>();
    for (const [index,spec] of specs.entries()) {
      const { rows } = await local.db.query<{id:string}>('insert into divisions(tournament_id,name,league_count,courts,bracket_tiers,finals_enabled,consolation_enabled,sets_to_win,qualifying_minutes_per_match,finals_minutes_per_match,start_time,finals_start_time,qualifying_match_order,sort_order) values ($1,$2,$3,$4,$5::jsonb,$6,$6,1,30,45,\'09:00\',\'13:30\',\'toco_5_team\',$7) returning id',[tournamentId,spec.name,spec.leagues,spec.courts,JSON.stringify(spec.tiers),spec.finals,index]);
      const divisionId = rows[0].id; divisions.push(divisionId);
      const leagues = await ensureLeagues(tournamentId,divisionId,spec.leagues);
      for (let i=0;i<spec.teams;i++) {
        const {rows: teams} = await local.db.query<{id:string}>('insert into teams(tournament_id,division_id,league_id,name,sort_order) values($1,$2,$3,$4,$5) returning id',[tournamentId,divisionId,leagues[Math.floor(i/5)].id,`${spec.name}チーム${i+1}`,i]);
        const teamId = teams[0].id; const pin = String(100000+index*100+i); pins.set(teamId,pin);
        await local.db.query('insert into team_result_credentials(team_id,pin_hash) values($1,$2)',[teamId,hashTeamPin(pin)]);
      }
      await regenerateLeagueMatches(tournamentId,divisionId);
      assert.equal((await getState(tournamentId,divisionId)).matches.length,spec.leagues*10);
    }
    const {rows: all} = await local.db.query<Match>('select * from matches where tournament_id=$1',[tournamentId]);
    assert.equal(all.length,70);
    assert.equal(findCourtConflict(all,new Set(all.map((m)=>m.id))),null);
    const { NextRequest } = await import('next/server');
    const { PATCH } = await import('../src/app/api/admin/tournament/route');
    const { createSessionToken } = await import('../src/lib/auth');
    process.env.ADMIN_SESSION_SECRET='rehearsal-only-secret';
    const token=await createSessionToken();
    const untouched=await getState(tournamentId,divisions[1]);
    const settingsRequest=(cookie: string)=>new NextRequest('http://127.0.0.1/api/admin/tournament',{method:'PATCH',headers:{'Content-Type':'application/json','X-Tournament-Id':tournamentId,'X-Division-Id':divisions[0],Cookie:cookie},body:JSON.stringify({league_count:5,point_target:15})});
    assert.equal((await PATCH(settingsRequest(''))).status,401);
    assert.equal((await PATCH(settingsRequest(`rb_admin=${token}`))).status,200);
    assert.equal((await getState(tournamentId,divisions[0])).tournament.league_count,5);
    const afterSetting=await getState(tournamentId,divisions[1]);
    assert.deepEqual(afterSetting.division,untouched.division);
    assert.deepEqual(afterSetting.matches,untouched.matches);
    assert.deepEqual(afterSetting.teams,untouched.teams);
    assert.equal(afterSetting.tournament.league_count,untouched.tournament.league_count);
    assert.equal(afterSetting.tournament.point_target,untouched.tournament.point_target);
    // 対戦のない追加リーグだけを戻し、原本の大会設定でリハーサルを継続する。
    await local.db.query('update divisions set league_count=4 where id=$1',[divisions[0]]);
    await ensureLeagues(tournamentId,divisions[0],4);
    const {rows: privileges}=await local.db.query<{pin_read:boolean;rpc_execute:boolean}>("select has_table_privilege('anon','team_result_credentials','SELECT') as pin_read,has_function_privilege('anon','create_consolation_matches(uuid,uuid,text,jsonb)','EXECUTE') as rpc_execute");
    assert.deepEqual(privileges[0],{pin_read:false,rpc_execute:false});
    for (const [index,divisionId] of divisions.entries()) {
      const state = await getState(tournamentId,divisionId);
      const beforeOther = await getState(tournamentId,divisions[(index+1)%3]);
      for (const [i,match] of state.matches.entries()) {
        const a=match.team_a_id!, b=match.team_b_id!;
        await submitResultForApproval({matchId:match.id,teamId:a,pin:pins.get(a)!,sets:[{a:11,b:5}]});
        if(i===0) {
          const pending=await getState(tournamentId,divisionId);
          const standings=computeAllStandings(pending.leagues.map((l)=>l.id),pending.teams,pending.matches,pending.tournament.tiebreakers);
          assert.equal(Object.values(standings).flat().reduce((sum,row)=>sum+row.played,0),0);
          await assert.rejects(approvePendingResult(match.id,a,pins.get(a)!),/敗戦チーム/);
          await rejectPendingResult(match.id,b,pins.get(b)!,'5点ではなく7点');
          await submitResultForApproval({matchId:match.id,teamId:a,pin:pins.get(a)!,sets:[{a:11,b:7}]});
        }
        await approvePendingResult(match.id,b,pins.get(b)!);
      }
      assert.deepEqual((await getState(tournamentId,divisions[(index+1)%3])).matches,beforeOther.matches);
    }
    for(const [index,divisionId] of divisions.entries()) {
      if(!specs[index].finals) { await assert.rejects(generateBracket(tournamentId,divisionId),/決勝ラウンドは作成しません/); continue; }
      await generateBracket(tournamentId,divisionId);
      let safety=0;
      while(true) {
        const state=await getState(tournamentId,divisionId);
        const ready=state.matches.find((m)=>m.stage==='bracket' && m.status!=='done' && m.team_a_id && m.team_b_id);
        if(!ready) {
          const oddTier=specs[index].tiers.find((tier) => {
            const candidates=consolationCandidates(state.matches,tier.key);
            return candidates.needsManualPairing && candidates.available.length>=2;
          });
          if(oddTier) {
            const {available}=consolationCandidates(state.matches,oddTier.key);
            assert.equal(state.matches.filter((m)=>m.is_consolation && m.tier_key===oddTier.key).length,0);
            await syncConsolation(tournamentId,divisionId,{tierKey:oddTier.key,teamAId:available[0],teamBId:available[1]});
            continue;
          }
          assert.equal(state.matches.filter((m)=>m.stage==='bracket' && m.status!=='done').length,0); break;
        }
        assert.ok(++safety<80);
        const a=ready.team_a_id!, b=ready.team_b_id!;
        const seedLoses=index===1 && ready.tier_key==='lower' && !ready.is_consolation && ready.round===2 && ready.bracket_index===0;
        const winner=seedLoses ? b : a, loser=seedLoses ? a : b;
        await submitResultForApproval({matchId:ready.id,teamId:winner,pin:pins.get(winner)!,sets:[seedLoses ? {a:6,b:11} : {a:11,b:6}]});
        await approvePendingResult(ready.id,loser,pins.get(loser)!);
      }
      const completed=await getState(tournamentId,divisionId);
      if(index===0) {
        assert.equal(completed.matches.filter((m)=>m.stage==='bracket' && !m.is_consolation).length,15);
        assert.equal(completed.matches.filter((m)=>m.is_consolation).length,5);
      } else {
        assert.equal(completed.matches.filter((m)=>m.stage==='bracket' && !m.is_consolation).length,8);
        const odd=consolationCandidates(completed.matches,'lower');
        assert.equal(odd.needsManualPairing,true);
        assert.equal(odd.available.length,1);
      }
      const count=completed.matches.length;
      await syncConsolation(tournamentId,divisionId);
      assert.equal((await getState(tournamentId,divisionId)).matches.length,count);
      for(const tier of specs[index].tiers) {
        const candidates=consolationCandidates(completed.matches,tier.key);
        const consolation=completed.matches.filter((m)=>m.is_consolation && m.tier_key===tier.key);
        const entrants=consolation.flatMap((m)=>[m.team_a_id!,m.team_b_id!]);
        assert.equal(new Set(entrants).size,entrants.length);
        assert.ok(entrants.every((id)=>candidates.eligible.includes(id)));
      }
      const first=completed.matches.find((m)=>m.stage==='bracket' && !m.is_consolation)!;
      if(completed.matches.some((m)=>m.is_consolation && m.tier_key===first.tier_key)) await assert.rejects(saveResult({matchId:first.id,actor:'admin',sets:[{a:11,b:0}]}),/取り消して/);
    }
    const {rows: scheduled} = await local.db.query<Match>('select * from matches where tournament_id=$1 and not consolation_void',[tournamentId]);
    assert.equal(findCourtConflict(scheduled,new Set(scheduled.map((m)=>m.id))),null);
    assert.equal(findDependencyConflict(scheduled,new Set(scheduled.map((m)=>m.id))),null);
    // この固定コート構成では18:45までに収まる。敗者戦を全大会の末尾に連結する退行を防ぐ。
    assert.ok(scheduled.every((m)=>parseTime(m.scheduled_at)+(m.duration_minutes ?? 0)<=18*60+45));
    for(const divisionId of divisions.slice(0,2)) {
      const state=await getState(tournamentId,divisionId);
      await autoAssignSchedule(tournamentId,divisionId,'finals',{startTime:'15:00',minutesPerMatch:45,courts:state.division.courts!});
    }
    const {rows: regenerated}=await local.db.query<Match>('select * from matches where tournament_id=$1 and not consolation_void',[tournamentId]);
    assert.equal(findCourtConflict(regenerated,new Set(regenerated.map((m)=>m.id))),null);
    assert.equal(findDependencyConflict(regenerated,new Set(regenerated.map((m)=>m.id))),null);
    const {rows: timing}=await local.db.query("select d.name,m.stage,count(*)::int as matches,min(m.scheduled_at) as first_start,max(to_char(('2000-01-01 '||m.scheduled_at)::timestamp + m.duration_minutes * interval '1 minute','HH24:MI')) as last_end from matches m join divisions d on d.id=m.division_id where m.tournament_id=$1 and m.scheduled_at<>'' and not m.consolation_void group by d.name,m.stage order by d.name,m.stage",[tournamentId]);
    context.diagnostic(JSON.stringify(timing));
  } finally { await local.close(); }
});
