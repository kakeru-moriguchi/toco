import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { rehearsalDb } from './helpers/rehearsalDb';

test('combination reset requires confirmation, preserves registration and isolates divisions and tournaments', {timeout:60000},async()=>{
  const local=await rehearsalDb();
  process.env.NEXT_PUBLIC_SUPABASE_URL=local.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY='rehearsal-only';
  process.env.ADMIN_SESSION_SECRET='local-reset-test-only';
  try {
    const {POST}=await import('../src/app/api/admin/actions/route');
    const {createSessionToken}=await import('../src/lib/auth');
    const token=await createSessionToken();
    const divisions: {id:string;tournament_id:string}[]=[];
    const tiers=JSON.stringify([{key:'A',name:'決勝',mode:'top',from_rank:1,to_rank:2,bottom_count:1,format:'bracket',third_place:false}]);
    for(let ti=0;ti<2;ti++) {
      const {rows:[tournament]}=await local.db.query<{id:string}>("insert into tournaments(name,phase) values($1,'bracket') returning id",[`検証大会${ti}`]);
      for(let di=0;di<2;di++) {
        const {rows:[division]}=await local.db.query<{id:string;tournament_id:string}>("insert into divisions(tournament_id,name,league_count,bracket_tiers,sets_to_win) values($1,$2,1,$3::jsonb,1) returning id,tournament_id",[tournament.id,`部門${di}`,tiers]);
        divisions.push(division);
        const {rows:[qualifying]}=await local.db.query<{id:string}>('insert into leagues(tournament_id,division_id,name,sort_order) values($1,$2,\'予選\',0) returning id',[tournament.id,division.id]);
        const {rows:[tier]}=await local.db.query<{id:string}>('insert into leagues(tournament_id,division_id,name,sort_order,tier_key) values($1,$2,\'決勝の総当たり\',1000,\'R\') returning id',[tournament.id,division.id]);
        const {rows:teams}=await local.db.query<{id:string}>('insert into teams(tournament_id,division_id,league_id,name,sort_order) values($1,$2,$3,\'チーム1\',0),($1,$2,$3,\'チーム2\',1) returning id',[tournament.id,division.id,qualifying.id]);
        for(const team of teams) await local.db.query('insert into team_result_credentials(team_id,pin_hash) values($1,\'local-fixture-pin-hash\')',[team.id]);
        for(const spec of [
          {stage:'league',league:qualifying.id,tier:null,done:true,consolation:false,void:false},
          {stage:'league',league:qualifying.id,tier:null,done:false,consolation:false,void:false},
          {stage:'bracket',league:null,tier:'A',done:true,consolation:false,void:false},
          {stage:'bracket',league:null,tier:'A',done:false,consolation:true,void:true},
          {stage:'league',league:tier.id,tier:'R',done:true,consolation:false,void:false},
        ]) {
          const {rows:[match]}=await local.db.query<{id:string}>('insert into matches(tournament_id,division_id,stage,league_id,tier_key,team_a_id,team_b_id,status,approval_status,is_consolation,consolation_void) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id',[tournament.id,division.id,spec.stage,spec.league,spec.tier,teams[0].id,teams[1].id,spec.done?'done':'pending',spec.done?'approved':'pending',spec.consolation,spec.void]);
          await local.db.query("insert into match_events(tournament_id,division_id,match_id,action) values($1,$2,$3,'fixture')",[tournament.id,division.id,match.id]);
        }
      }
    }
    const target=divisions[0];
    const snapshot=async()=>{
      const result:Record<string,unknown>={};
      for(const table of ['tournaments','divisions','teams','team_result_credentials']) result[table]=(await local.db.query(`select * from ${table} order by ${table==='team_result_credentials'?'team_id':'id'}`)).rows;
      for(const table of ['matches','leagues','match_events']) result[table]=(await local.db.query(`select * from ${table} where division_id<>$1 order by id`,[target.id])).rows;
      return result;
    };
    const preserved=await snapshot();
    const send=(action:string,confirm:unknown=target.id,cookie=`rb_admin=${token}`,withScope=true)=>POST(new NextRequest('http://127.0.0.1/api/admin/actions',{
      method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...(withScope?{'X-Tournament-Id':target.tournament_id,'X-Division-Id':target.id}:{})},body:JSON.stringify({action,confirm}),
    }));
    assert.equal((await send('reset_bracket',target.id,'')).status,401);
    assert.equal((await send('reset_bracket',false)).status,400);
    assert.equal((await send('reset_bracket',divisions[1].id)).status,400);
    assert.equal((await send('reset_bracket',target.id,`rb_admin=${token}`,false)).status,400);
    const blocked=await send('reset_league');
    assert.equal(blocked.status,400);
    assert.match((await blocked.json()).error,/先に.*決勝/);
    assert.equal((await local.db.query('select id from matches where division_id=$1',[target.id])).rows.length,5);
    assert.deepEqual(await snapshot(),preserved);

    const qualifyingBefore=(await local.db.query("select * from matches where division_id=$1 and stage='league' and tier_key is null order by id",[target.id])).rows;
    const response=await send('reset_bracket');
    assert.equal(response.status,200,JSON.stringify(await response.json()));
    assert.deepEqual((await local.db.query('select * from matches where division_id=$1 order by id',[target.id])).rows,qualifyingBefore);
    assert.equal((await local.db.query('select id from leagues where division_id=$1 and tier_key is not null',[target.id])).rows.length,0);
    assert.equal((await local.db.query('select id from match_events where division_id=$1',[target.id])).rows.length,2);
    assert.deepEqual(await snapshot(),preserved);
    assert.equal((await send('reset_bracket')).status,200,'未作成への再実行も安全');
    assert.equal((await send('reset_league')).status,200);
    assert.equal((await local.db.query('select id from matches where division_id=$1',[target.id])).rows.length,0);
    assert.equal((await local.db.query('select id from match_events where division_id=$1',[target.id])).rows.length,0);
    assert.equal((await local.db.query('select id from leagues where division_id=$1',[target.id])).rows.length,1);
    assert.deepEqual(await snapshot(),preserved);
    assert.equal((await send('reset_league')).status,200);

    // 未作成に戻ったあと、既存の作成処理をそのまま再利用できる。
    assert.equal((await send('generate_league')).status,200);
    const {rows:fresh}=await local.db.query<{id:string;status:string;approval_status:string;score_a:number|null}>('select * from matches where division_id=$1',[target.id]);
    assert.equal(fresh.length,1);
    assert.equal(fresh[0].status,'pending'); assert.equal(fresh[0].approval_status,'none'); assert.equal(fresh[0].score_a,null);
    await local.db.query("update matches set status='done',approval_status='approved',winner_team_id=team_a_id,sets='[{\"a\":11,\"b\":5}]',score_a=11,score_b=5 where id=$1",[fresh[0].id]);
    const generated=await send('generate_bracket');
    assert.equal(generated.status,200,JSON.stringify(await generated.json()));
    assert.equal((await local.db.query("select id from matches where division_id=$1 and stage='bracket'",[target.id])).rows.length,1);
    for(const table of ['matches','leagues','match_events']) assert.deepEqual((await local.db.query(`select * from ${table} where division_id<>$1 order by id`,[target.id])).rows,preserved[table]);
  } finally {await local.close();}
});
