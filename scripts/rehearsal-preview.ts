import { spawn } from 'node:child_process';
import { rehearsalDb } from '../tests/helpers/rehearsalDb';

// テスト用DB以外への接続先や本番認証情報を引き継がない。
const local=await rehearsalDb(4179);
process.env.NEXT_PUBLIC_SUPABASE_URL=local.url;
process.env.SUPABASE_SERVICE_ROLE_KEY='rehearsal-only';
process.env.ADMIN_PASSWORD='rehearsal-only';
process.env.ADMIN_SESSION_SECRET='local-rehearsal-session-only';
// 空文字を残し、Next.jsが.env.localの本番キーを補充しないようにする。
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='';
const {hashTeamPin}=await import('../src/lib/teamResultAuth');
const {ensureLeagues,regenerateLeagueMatches,getState,submitResultForApproval}=await import('../src/lib/data');
const {rows}=await local.db.query<{id:string}>("insert into tournaments(name,venue,start_time,minutes_per_match) values('ローカル検証専用・ピックルボール大会','清武体育館を想定した検証','09:00',30) returning id");
const tournamentId=rows[0].id;
for(const [index,spec] of [{name:'初中級部門',leagues:4},{name:'中上級オープン部門',leagues:2},{name:'中上級50歳以上部門',leagues:1}].entries()) {
  const {rows:divisions}=await local.db.query<{id:string}>("insert into divisions(tournament_id,name,league_count,sets_to_win,game_labels,sort_order) values($1,$2,$3,2,array['女子ダブルス','男子ダブルス','ミックスダブルス'],$4) returning id",[tournamentId,spec.name,spec.leagues,index]);
  const divisionId=divisions[0].id;
  const leagues=await ensureLeagues(tournamentId,divisionId,spec.leagues);
  for(let i=0;i<spec.leagues*5;i++) {
    const {rows:teams}=await local.db.query<{id:string}>('insert into teams(tournament_id,division_id,league_id,name,sort_order) values($1,$2,$3,$4,$5) returning id',[tournamentId,divisionId,leagues[Math.floor(i/5)].id,`${spec.name}・長いチーム名の折り返し検証チーム${i+1}`,i]);
    await local.db.query('insert into team_result_credentials(team_id,pin_hash) values($1,$2)',[teams[0].id,hashTeamPin('111111')]);
  }
  await regenerateLeagueMatches(tournamentId,divisionId);
  const state=await getState(tournamentId,divisionId);
  const first=state.matches[0];
  await submitResultForApproval({matchId:first.id,teamId:first.team_a_id!,pin:'111111',sets:[{a:11,b:7},{a:6,b:11},{a:11,b:8}]});
}
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3100'],{env:process.env,stdio:'inherit',windowsHide:true});
console.log('Local rehearsal: http://127.0.0.1:3100 | admin: rehearsal-only | fixture team PIN: 111111');
let closing=false;
async function close() { if(closing)return; closing=true; child.kill(); await local.close(); }
process.on('SIGINT',()=>void close());
process.on('SIGTERM',()=>void close());
child.on('exit',()=>void close());
