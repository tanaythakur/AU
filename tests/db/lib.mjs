import EmbeddedPostgres from 'embedded-postgres'
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const here = path.dirname(fileURLToPath(import.meta.url))
export const root = path.resolve(here, '..', '..')
export const PORT = Number(process.env.PGTEST_PORT || 54330)
const cfg = { host: 'localhost', port: PORT, user: 'postgres', password: 'pw' }

export async function startDb({ dir = path.join(here, '..', '.pgdata') } = {}) {
  fs.rmSync(dir, { recursive: true, force: true })
  const server = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'pw', port: PORT, persistent: false, onLog: () => {}, onError: () => {} })
  await server.initialise()
  await server.start()
  const admin = new pg.Client({ ...cfg, database: 'postgres' })
  await admin.connect()
  await admin.query('create database academy')
  await admin.end()
  return server
}

export const client = async () => { const c = new pg.Client({ ...cfg, database: 'academy' }); await c.connect(); return c }
export const pool = (max = 12) => new pg.Pool({ ...cfg, database: 'academy', max })

export async function applySql(c, file) {
  const sql = fs.readFileSync(file, 'utf8')
  try { await c.query(sql) } catch (e) { e.message = `${path.basename(file)}: ${e.message}${e.position ? ` (at char ${e.position})` : ''}`; throw e }
}
export async function applyAll(c) {
  await applySql(c, path.join(here, 'supabase_shim.sql'))
  const dir = path.join(root, 'supabase', 'migrations')
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await applySql(c, path.join(dir, f))
}

/** Run fn(client) as an API user inside a transaction (rolled back unless commit=true). userId null => anon. */
export async function asUser(c, userId, fn, { commit = false, email = 'admin@academy.test', role } = {}) {
  await c.query('begin')
  try {
    await c.query(`set local role ${role || (userId ? 'authenticated' : 'anon')}`)
    const claims = JSON.stringify(userId ? { sub: userId, role: 'authenticated', email } : { role: 'anon' })
    await c.query("select set_config('request.jwt.claims', $1, true)", [claims])
    const out = await fn(c)
    await c.query(commit ? 'commit' : 'rollback')
    return out
  } catch (e) {
    await c.query('rollback').catch(() => {})
    throw e
  }
}
