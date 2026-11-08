/*
 * LOCAL TEST GATEWAY (not PostgREST, not GoTrue).
 * Speaks just enough of the Supabase HTTP API for supabase-js: password login, refresh, and table/RPC calls.
 * Every database call runs in real PostgreSQL as the `anon` or `authenticated` role with the caller's JWT claims,
 * so grants, Row Level Security and the SECURITY DEFINER functions behave exactly as they would behind Supabase.
 * What it does NOT reproduce: PostgREST's exact parsing/error shapes, Storage, or real GoTrue behaviour.
 * Those must be confirmed against the live project (see scripts/verify-live.mjs).
 */
import http from 'node:http'
import crypto from 'node:crypto'

const b64 = (b) => Buffer.from(b).toString('base64url')
export const signJwt = (payload, secret) => {
  const h = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const p = b64(JSON.stringify(payload))
  return `${h}.${p}.${crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')}`
}
function verifyJwt(token, secret) {
  const [h, p, s] = token.split('.')
  if (!s || crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url') !== s) throw Object.assign(new Error('invalid JWT'), { code: 'PGRST301' })
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw Object.assign(new Error('JWT expired'), { code: 'PGRST301' })
  return payload
}
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { status: 400, code: 'PGRST100' }); return `"${s}"` }

export async function startGateway({ pool, port, secret, users }) {
  const state = { ttl: 3600, refreshOk: true, refresh: new Map(), log: [] }
  const issue = (u) => {
    const now = Math.floor(Date.now() / 1000)
    const access = signJwt({ aud: 'authenticated', sub: u.id, role: 'authenticated', email: u.email, iat: now, exp: now + state.ttl }, secret)
    const refresh = crypto.randomUUID()
    state.refresh.set(refresh, u)
    return { access_token: access, token_type: 'bearer', expires_in: state.ttl, expires_at: now + state.ttl, refresh_token: refresh,
      user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }
  }

  const send = (res, status, body, extra = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra })
    res.end(body === undefined || body === null || status === 204 ? undefined : JSON.stringify(body))
  }
  const readBody = (req) => new Promise((resolve) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => { const t = Buffer.concat(c).toString(); try { resolve(t ? JSON.parse(t) : {}) } catch { resolve({}) } }) })

  /* ---- filters: col=eq.value, in.(a,b), is.null, gt/gte/lt/lte/neq ---- */
  function where(params, args) {
    const parts = []
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue
      const m = /^(not\.)?(eq|neq|gt|gte|lt|lte|is|in|like|ilike)\.(.*)$/.exec(v)
      if (!m) continue
      const [, not, op, val] = m
      const col = ident(k)
      let sql
      if (op === 'is') sql = `${col} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`
      else if (op === 'in') { const vals = val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')); args.push(vals); sql = `${col} = any($${args.length}::text[]::${'text'}[])`; sql = `${col}::text = any($${args.length})` }
      else { args.push(val); const o = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' }[op]; sql = `${col}::text ${o} $${args.length}`; if (['gt', 'gte', 'lt', 'lte'].includes(op)) sql = `${col} ${o} $${args.length}` ; if (op === 'eq' || op === 'neq') sql = `${col}::text ${o} $${args.length}` }
      parts.push(not ? `not (${sql})` : sql)
    }
    return parts.length ? ` where ${parts.join(' and ')}` : ''
  }

  async function inRole(role, claims, fn) {
    const c = await pool.connect()
    try {
      await c.query('begin')
      await c.query(`set local role ${role}`)
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)])
      const out = await fn(c)
      await c.query('commit')
      return out
    } catch (e) { await c.query('rollback').catch(() => {}); throw e } finally { c.release() }
  }
  const pgStatus = (e, role) => (e.status ? e.status : e.code === '42501' ? (role === 'anon' ? 401 : 403) : ['23503', '23505'].includes(e.code) ? 409 : e.code === 'PGRST116' ? 406 : 400)

  async function rest(req, res, url) {
    const params = [...url.searchParams.entries()]
    let role = 'anon', claims = { role: 'anon' }
    const auth = req.headers.authorization?.replace(/^Bearer /, '')
    if (auth) {
      try { const p = verifyJwt(auth, secret); if (p.role === 'authenticated') { role = 'authenticated'; claims = p } } catch (e) { return send(res, 401, { code: 'PGRST301', message: e.message, details: null, hint: null }) }
    }
    const path = url.pathname.replace(/^\/rest\/v1\//, '')
    try {
      if (path.startsWith('rpc/')) {
        const fn = path.slice(4)
        const body = await readBody(req)
        const keys = Object.keys(body)
        const sig = await pool.query("select proretset, prorettype::regtype::text rt from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1 limit 1", [fn])
        const out = await inRole(role, claims, (c) => c.query(`select * from public.${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`, keys.map((k) => (body[k] !== null && typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]))))
        if (sig.rows[0]?.rt === 'void') return send(res, 204)
        if (sig.rows[0]?.proretset) return send(res, 200, out.rows)
        return send(res, 200, out.rows[0][fn] ?? out.rows[0][Object.keys(out.rows[0])[0]])
      }
      const table = ident(path)
      if (req.method === 'GET') {
        const args = []
        let sql = `select * from public.${table}${where(params, args)}`
        const order = params.find(([k]) => k === 'order')?.[1]
        if (order) sql += ' order by ' + order.split(',').map((o) => { const [c, d] = o.split('.'); return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}` }).join(', ')
        const limit = params.find(([k]) => k === 'limit')?.[1]; const offset = params.find(([k]) => k === 'offset')?.[1]
        if (limit) sql += ` limit ${Number(limit)}`
        if (offset) sql += ` offset ${Number(offset)}`
        const out = await inRole(role, claims, (c) => c.query(sql, args))
        return send(res, 200, out.rows)
      }
      if (req.method === 'POST') {
        const body = await readBody(req)
        const rows = Array.isArray(body) ? body : [body]
        const cols = [...new Set(rows.flatMap(Object.keys))]
        const args = []
        const values = rows.map((r) => `(${cols.map((c) => { args.push(r[c] === undefined ? null : r[c]); return `$${args.length}` }).join(', ')})`).join(', ')
        const out = await inRole(role, claims, (c) => c.query(`insert into public.${table} (${cols.map(ident).join(', ')}) values ${values} returning *`, args))
        return /return=representation/.test(req.headers.prefer || '') ? send(res, 201, out.rows) : send(res, 201)
      }
      if (req.method === 'PATCH') {
        const body = await readBody(req)
        const cols = Object.keys(body); const args = cols.map((c) => body[c])
        const sets = cols.map((c, i) => `${ident(c)} = $${i + 1}`).join(', ')
        const out = await inRole(role, claims, (c) => c.query(`update public.${table} set ${sets}${where(params, args)} returning *`, args))
        return /return=representation/.test(req.headers.prefer || '') ? send(res, 200, out.rows) : send(res, 204)
      }
      if (req.method === 'DELETE') {
        const args = []
        const out = await inRole(role, claims, (c) => c.query(`delete from public.${table}${where(params, args)} returning *`, args))
        return /return=representation/.test(req.headers.prefer || '') ? send(res, 200, out.rows) : send(res, 204)
      }
      return send(res, 405, { message: 'method not allowed' })
    } catch (e) {
      state.log.push({ path, code: e.code, message: e.message })
      return send(res, pgStatus(e, role), { code: e.code || 'PGRST000', message: e.message, details: e.detail || null, hint: e.hint || null })
    }
  }

  async function authApi(req, res, url) {
    const p = url.pathname.replace(/^\/auth\/v1/, '')
    if (p === '/token') {
      const body = await readBody(req)
      const grant = url.searchParams.get('grant_type')
      if (grant === 'password') {
        const u = users.find((x) => x.email === String(body.email).toLowerCase())
        if (!u || u.password !== body.password) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
        return send(res, 200, issue(u))
      }
      if (grant === 'refresh_token') {
        const u = state.refresh.get(body.refresh_token)
        if (!u || !state.refreshOk) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' })
        return send(res, 200, issue(u))
      }
    }
    if (p === '/user') {
      try { const t = verifyJwt((req.headers.authorization || '').replace(/^Bearer /, ''), secret); const u = users.find((x) => x.id === t.sub); return send(res, 200, issue(u).user) } catch { return send(res, 401, { code: 401, msg: 'invalid JWT' }) }
    }
    if (p === '/logout') return send(res, 204)
    if (p === '/settings') return send(res, 200, { disable_signup: true, external: { email: true } })
    return send(res, 404, { msg: 'not found' })
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    if (req.method === 'OPTIONS') return send(res, 204, undefined, { 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'access-control-max-age': '600' })
    if (url.pathname.startsWith('/__test/')) { // test controls
      if (url.pathname === '/__test/ttl') state.ttl = Number(url.searchParams.get('s'))
      if (url.pathname === '/__test/refresh') state.refreshOk = url.searchParams.get('ok') === '1'
      return send(res, 200, { ok: true, state: { ttl: state.ttl, refreshOk: state.refreshOk } })
    }
    if (url.pathname.startsWith('/auth/v1/')) return authApi(req, res, url)
    if (url.pathname.startsWith('/rest/v1/')) return rest(req, res, url)
    return send(res, 404, { message: 'not found' })
  })
  await new Promise((r) => server.listen(port, r))
  return { server, state, close: () => new Promise((r) => server.close(r)) }
}
