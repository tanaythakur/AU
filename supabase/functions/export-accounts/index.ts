// Supabase Edge Function: export-accounts
// Generates the accounting Excel workbook ON THE SERVER.
//   1. Caller must send a valid Supabase JWT (verify_jwt is on by default for Edge Functions).
//   2. Data comes from public.export_data(), which runs with the CALLER's permissions, so Row Level Security applies
//      and only the admin gets anything (the function raises "Not authorized." for everyone else).
//   3. The export is written to the audit log BEFORE the file is returned; if that fails, nothing is downloaded.
// Deploy:  npx supabase functions deploy export-accounts --project-ref <ref>
// No secrets are needed: SUPABASE_URL and SUPABASE_ANON_KEY are provided to every Edge Function automatically.
import { createClient } from 'npm:@supabase/supabase-js@2'
import ExcelJS from 'npm:exceljs@4.4.0'
import { buildWorkbook, rangeLabel } from '../_shared/workbook.js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const isDate = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })
  const auth = req.headers.get('Authorization')
  if (!auth) return json(401, { error: 'Not signed in.' })

  let body: { from?: string | null; to?: string | null } = {}
  try { body = await req.json() } catch { /* empty body = all time */ }
  if (!isDate(body.from) || !isDate(body.to)) return json(400, { error: 'Dates must look like 2026-11-30.' })
  const from = body.from ?? null
  const to = body.to ?? null
  if (from && to && from > to) return json(400, { error: 'The start date is after the end date.' })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })

  const { data, error } = await supabase.rpc('export_data', { p_from: from, p_to: to })
  if (error) return json(/Not authorized/i.test(error.message) || error.code === '42501' ? 403 : 400, { error: error.message })

  let buffer: ArrayBuffer
  try {
    buffer = await buildWorkbook(ExcelJS, data).xlsx.writeBuffer()
  } catch (e) {
    return json(500, { error: `Could not build the workbook: ${(e as Error).message}` })
  }

  const logged = await supabase.rpc('log_export', { p_summary: `Excel export ${rangeLabel([from, to])} (server)` })
  if (logged.error) return json(500, { error: `Export was not recorded in the audit log, so it was cancelled: ${logged.error.message}` })

  // octet-stream so supabase-js returns a Blob
  return new Response(buffer, {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="accounts_${from ?? 'all'}_${to ?? 'time'}.xlsx"` },
  })
})
