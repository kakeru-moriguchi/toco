import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const tables = new Set(['tournaments','divisions','leagues','teams','matches','match_events','team_result_credentials']);
const ident = (name: string) => {
  if (!/^[a-z_]+$/.test(name)) throw new Error('Unsupported identifier');
  return `"${name}"`;
};

/** 実PostgreSQLエンジン + テスト専用PostgREST互換HTTP。外部DBには接続しない。 */
export async function rehearsalDb(port = 0) {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create publication supabase_realtime;');
  const schema = await readFile(new URL('../../supabase/schema.sql', import.meta.url), 'utf8');
  await db.exec(schema.replace('create extension if not exists "pgcrypto";', '-- UUID generation is built into PostgreSQL.'));
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = body ? JSON.parse(body) : {};
      if (url.pathname === '/rest/v1/rpc/create_consolation_matches') {
        const { rows } = await db.query<{ result: number }>('select public.create_consolation_matches($1::uuid,$2::uuid,$3::text,$4::jsonb) as result', [payload.p_tournament_id,payload.p_division_id,payload.p_tier_key,JSON.stringify(payload.p_rows)]);
        res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify(rows[0].result)); return;
      }
      const table = url.pathname.split('/').at(-1) ?? '';
      if (!tables.has(table)) throw new Error(`Unsupported test table ${table}`);
      const params: unknown[] = [];
      const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
      const conditions: string[] = [];
      for (const [key, raw] of url.searchParams) {
        if (['select','order','limit','on_conflict','columns'].includes(key)) continue;
        if (key === 'or') {
          const clauses = raw.replace(/^\(|\)$/g,'').split(',').map((part) => {
            const [column, op, value] = part.split('.');
            if (op !== 'eq') throw new Error('Unsupported OR');
            return `${ident(column)}=${bind(value)}`;
          });
          conditions.push(`(${clauses.join(' or ')})`); continue;
        }
        if (raw === 'is.null') conditions.push(`${ident(key)} is null`);
        else if (raw === 'not.is.null') conditions.push(`${ident(key)} is not null`);
        else if (raw.startsWith('in.(')) conditions.push(`${ident(key)} in (${raw.slice(4,-1).split(',').map((value) => bind(value.replace(/^"|"$/g,''))).join(',')})`);
        else if (raw.startsWith('eq.')) conditions.push(`${ident(key)}=${bind(raw.slice(3))}`);
        else if (raw.startsWith('neq.')) conditions.push(`${ident(key)}<>${bind(raw.slice(4))}`);
        else throw new Error(`Unsupported filter ${key}=${raw}`);
      }
      const where = conditions.length ? ` where ${conditions.join(' and ')}` : '';
      let rows: Record<string,unknown>[] = [];
      if (req.method === 'POST') {
        for (const item of Array.isArray(payload) ? payload : [payload]) {
          const keys = Object.keys(item).map(ident).join(',');
          const conflict = url.searchParams.get('on_conflict');
          const upsert = conflict ? ` on conflict (${ident(conflict)}) do update set ${Object.keys(item).filter((key) => key !== conflict).map((key) => `${ident(key)}=excluded.${ident(key)}`).join(',')}` : '';
          const result = await db.query<Record<string,unknown>>(`insert into ${ident(table)} (${keys}) select ${keys} from jsonb_populate_record(null::${ident(table)},$1::jsonb) ${upsert} returning *`,[JSON.stringify(item)]);
          rows.push(...result.rows);
        }
      } else if (req.method === 'PATCH') {
        const patch = bind(JSON.stringify(payload));
        const assignments = Object.keys(payload).map((key) => `${ident(key)}=(select ${ident(key)} from jsonb_populate_record(null::${ident(table)},${patch}::jsonb))`);
        rows = (await db.query<Record<string,unknown>>(`update ${ident(table)} set ${assignments.join(',')} ${where} returning *`,params)).rows;
      } else if (req.method === 'DELETE') {
        rows = (await db.query<Record<string,unknown>>(`delete from ${ident(table)}${where} returning *`,params)).rows;
      } else {
        const order = url.searchParams.get('order')?.split(',').map((part) => {
          const [column, direction] = part.split('.');
          return `${ident(column)} ${direction === 'desc' ? 'desc' : 'asc'}`;
        });
        const limit = url.searchParams.get('limit');
        rows = (await db.query<Record<string,unknown>>(`select * from ${ident(table)}${where}${order ? ` order by ${order.join(',')}` : ''}${limit ? ` limit ${Number(limit)}` : ''}`,params)).rows;
      }
      const selection = url.searchParams.get('select') ?? '*';
      if (selection.includes('divisions(*)')) {
        for (const row of rows) row.divisions = (await db.query('select * from divisions where tournament_id=$1',[row.id])).rows;
      } else if (selection !== '*') {
        const columns = selection.split(','); rows = rows.map((row) => Object.fromEntries(columns.map((key) => [key,row[key]])));
      }
      const single = String(req.headers.accept).includes('vnd.pgrst.object');
      if (single && rows.length !== 1) { res.writeHead(406,{'Content-Type':'application/json'}); res.end(JSON.stringify({code:'PGRST116',message:'Expected one row',details:`${rows.length} rows`})); return; }
      res.writeHead(200,{'Content-Type':'application/json','Content-Range':`0-${Math.max(0,rows.length-1)}/${rows.length}`});
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(single ? rows[0] : rows));
    } catch (error) {
      res.writeHead(400,{'Content-Type':'application/json'});
      res.end(JSON.stringify({ message: error instanceof Error ? error.message : String(error) }));
    }
  });
  await new Promise<void>((resolve) => server.listen(port,'127.0.0.1',resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local server not started');
  return { db, url:`http://127.0.0.1:${address.port}`, async close() { await new Promise<void>((resolve,reject) => server.close((e) => e ? reject(e) : resolve())); await db.close(); } };
}
