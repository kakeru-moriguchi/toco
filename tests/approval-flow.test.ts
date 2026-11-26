import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

// PostgREST代替はローカルHTTPのみ。実際のサーバー側結果処理・PINハッシュを通す。
test('winner submission, loser rejection, resubmission and concurrent approval preserve official results', async () => {
  const tables: Record<string, Record<string, unknown>[]> = {
    tournaments: [{ id: 't', sets_to_win: 1, bracket_tiers: [] }],
    divisions: [{ id: 'd', tournament_id: 't', is_active: true, created_at: '2026-01-01' }],
    matches: [{ id: 'm', tournament_id: 't', division_id: 'd', stage: 'league', team_a_id: 'a', team_b_id: 'b', status: 'pending', approval_status: 'none', sets: [], score_a: null, score_b: null, winner_team_id: null, updated_at: '2026-01-01T00:00:00Z' }],
    team_result_credentials: [], match_events: [],
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const table = url.pathname.split('/').at(-1) ?? '';
    if (!tables[table]) { res.writeHead(404); res.end('{}'); return; }
    let rows = tables[table].filter((row) => [...url.searchParams].every(([key, value]) => {
      if (['select','order','limit'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('neq.')) return String(row[key]) !== value.slice(4);
      return true;
    }));
    if (req.method === 'PATCH' || req.method === 'POST') {
      let body = '';
      for await (const chunk of req) body += chunk;
      const patch = JSON.parse(body);
      if (req.method === 'PATCH') rows.forEach((row) => Object.assign(row, patch));
      else { tables[table].push(patch); rows = [patch]; }
    }
    const single = String(req.headers.accept).includes('vnd.pgrst.object');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(single ? rows[0] : rows));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'local-test-only';
  try {
    const { hashTeamPin } = await import('../src/lib/teamResultAuth');
    const { submitResultForApproval, rejectPendingResult, approvePendingResult } = await import('../src/lib/data');
    tables.team_result_credentials.push({ team_id: 'a', pin_hash: hashTeamPin('138625') }, { team_id: 'b', pin_hash: hashTeamPin('741963') });
    const input = { matchId: 'm', teamId: 'a', pin: '138625', sets: [{ a: 11, b: 5 }] };
    await assert.rejects(submitResultForApproval({ ...input, teamId: 'third-party' }), /勝利チーム/);
    await assert.rejects(submitResultForApproval({ ...input, pin: '000000' }), /PINが違い/);
    await submitResultForApproval(input);
    assert.equal(tables.matches[0].score_a, null);
    assert.equal(tables.matches[0].approval_status, 'pending');
    await assert.rejects(approvePendingResult('m', 'a', '138625'), /敗戦チーム/);
    await assert.rejects(rejectPendingResult('m', 'third-party', '741963', '訂正'), /敗戦チーム/);
    await rejectPendingResult('m', 'b', '741963', '相手の点数は7点です');
    assert.equal(tables.matches[0].approval_status, 'rejected');
    assert.equal(tables.matches[0].score_a, null);
    await submitResultForApproval({ ...input, sets: [{ a: 11, b: 7 }] });
    const approvals = await Promise.allSettled([approvePendingResult('m', 'b', '741963'), approvePendingResult('m', 'b', '741963')]);
    assert.equal(approvals.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(tables.matches[0].score_b, 7);
    assert.equal(tables.matches[0].status, 'done');
    assert.equal(tables.matches[0].approved_by_team_id, 'b');
    await assert.rejects(submitResultForApproval(input), /承認済み/);
    assert.equal(tables.match_events.filter((event) => event.action === 'approve').length, 1);
    assert.deepEqual(tables.match_events.map((event) => event.action), ['report_pending','reject','report_pending','approve']);
  } finally {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
