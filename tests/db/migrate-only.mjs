import { startDb, client, applyAll } from './lib.mjs'
const server = await startDb()
const c = await client()
try { await applyAll(c); console.log('ALL MIGRATIONS APPLIED OK') } catch (e) { console.log('MIGRATION ERROR:', e.message) }
await c.end(); await server.stop()
