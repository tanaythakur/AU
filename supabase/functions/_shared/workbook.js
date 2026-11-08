/*
 * Excel (.xlsx) workbook builder. PURE: it receives plain data (the shape returned by the database function
 * public.export_data) and an ExcelJS constructor, and returns a workbook. No app, browser or Supabase imports,
 * so the same file runs inside the `export-accounts` Edge Function (server) and in tests.
 * Totals are real Excel formulas, with cached results so viewers that do not recalculate still show numbers.
 */
const CURRENCY = '"₹"#,##0.00;[Red]-"₹"#,##0.00'
const DATE = 'dd mmm yyyy'
const PERCENT = '0.0%'
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166534' } }
const SUB_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }

/** yyyy-MM-dd -> Date at UTC midnight so Excel shows the same calendar day in any time zone. */
const d = (iso) => { const [y, m, day] = iso.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, day)) }
const f = (formula, result) => ({ formula, result })
const STATUS = { paid: 'Paid', partial: 'Partial', pending: 'Pending', cancelled: 'Cancelled' }
const METHOD = { upi: 'UPI', cash: 'Cash', bank_transfer: 'Bank transfer', card: 'Card' }
const q = (name) => `'${name}'`

function header(ws, row, labels) {
  const r = ws.getRow(row)
  labels.forEach((l, i) => { r.getCell(i + 1).value = l })
  r.eachCell((c) => { c.fill = HEAD_FILL; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { vertical: 'middle', wrapText: true } })
  r.height = 22
}
function title(ws, text, range) {
  ws.getCell('A1').value = text
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = `Period: ${rangeLabel(range)}`
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' } }
}
const widths = (ws, w) => w.forEach((x, i) => { ws.getColumn(i + 1).width = x })
const money = (ws, cols, from, to) => cols.forEach((c) => { for (let r = from; r <= to; r++) ws.getCell(`${c}${r}`).numFmt = CURRENCY })
const bold = (row) => row.eachCell((c) => { c.font = { bold: true }; c.fill = SUB_FILL })

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const fmtDate = (iso) => `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
export const rangeLabel = (r) => (r && r[0] && r[1] ? `${fmtDate(r[0])} – ${fmtDate(r[1])}` : r && r[0] ? `From ${fmtDate(r[0])}` : r && r[1] ? `Up to ${fmtDate(r[1])}` : 'All time')
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const sumOf = (list, fn) => round2(list.reduce((t, x) => t + fn(x), 0))
function groupSum(list, key, val) {
  const m = new Map()
  list.forEach((x) => m.set(key(x), round2((m.get(key(x)) || 0) + val(x))))
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

/** Database export_data() output -> the shapes the sheets are built from. Every total is derived from the rows. */
export function normalize(data) {
  const cats = data.categories || []
  const isCogs = (c) => !!cats.find((x) => x.name === c)?.cogs
  const inc = (data.income || []).map((x) => ({ ...x, amount: Number(x.amount), received: Number(x.received), balance: Number(x.balance) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code))
  const exp = (data.expenses || []).map((e) => ({
    code: e.code, name: e.title, category: e.category, amount: Number(e.amount), expense_date: e.expense_date, payment_method: e.payment_method,
    vendor: e.vendor, reason: e.description, status: e.status, paid_date: e.paid_date, attachment: e.attachment ? { name: e.attachment } : null, cogs: isCogs(e.category),
  })).sort((a, b) => a.expense_date.localeCompare(b.expense_date) || a.code.localeCompare(b.code))

  let bal = round2(data.ledger?.opening)
  const rows = (data.ledger?.rows || []).map((x) => ({
    date: x.date, tx: x.tx, type: x.type, description: x.description, income: Number(x.income), expense: Number(x.expense),
    method: METHOD[x.method] || '', balance: (bal = round2(bal + Number(x.income) - Number(x.expense))),
  }))
  const led = { opening: round2(data.ledger?.opening), rows, closing: bal, totalIn: sumOf(rows, (x) => x.income), totalOut: sumOf(rows, (x) => x.expense) }
  const by = (t, k) => sumOf(rows.filter((x) => x.type === t), (x) => x[k])
  const received = by('payment', 'income'), otherIncome = by('income', 'income'), expensesPaid = by('expense', 'expense'), refunds = by('refund', 'expense')
  const cf = {
    opening: led.opening, closing: led.closing, received, otherIncome, expensesPaid, refunds,
    inflow: round2(received + otherIncome), outflow: round2(expensesPaid + refunds), net: round2(received + otherIncome - expensesPaid - refunds),
  }
  const revenue = sumOf(inc, (x) => x.amount)
  const cogs = sumOf(exp.filter((e) => e.cogs), (e) => e.amount)
  const opex = sumOf(exp.filter((e) => !e.cogs), (e) => e.amount)
  const pl = {
    revenue, cogs, gross: round2(revenue - cogs), opex, net: round2(revenue - cogs - opex),
    revenueByCategory: groupSum(inc, (x) => x.category, (x) => x.amount),
    cogsByCategory: groupSum(exp.filter((e) => e.cogs), (e) => e.category, (e) => e.amount),
    opexByCategory: groupSum(exp.filter((e) => !e.cogs), (e) => e.category, (e) => e.amount),
  }
  const sum = {
    revenue, totalExpenses: round2(cogs + opex), gross: pl.gross, net: pl.net, cashReceived: cf.inflow, cashPaid: cf.outflow, netCash: cf.net,
    receivables: sumOf(inc, (x) => x.balance), payables: sumOf(exp.filter((e) => e.status === 'pending'), (e) => e.amount),
  }
  const months = (data.months || []).map((m) => ({
    label: m.label, revenue: Number(m.summary.revenue), cogs: Number(m.summary.cogs), gross: Number(m.summary.gross), opex: Number(m.summary.opex),
    net: Number(m.summary.net), cashIn: Number(m.summary.cash_received), cashOut: Number(m.summary.cash_paid), netCash: Number(m.summary.net_cash),
  }))
  return { inc, exp, led, cf, pl, sum, months, cats }
}

export function buildWorkbook(ExcelJS, data) {
  const range = data.range
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Academy Admin'
  wb.created = new Date()
  wb.calcProperties = { fullCalcOnLoad: true } // Excel recalculates every formula when the file opens

  const { inc, exp, led, pl, cf, sum, months, cats: CATS } = normalize(data)

  // sheet order as requested
  const wsSum = wb.addWorksheet('Financial Summary')
  const wsInc = wb.addWorksheet('Income Register')
  const wsExp = wb.addWorksheet('Expense Register')
  const wsPL = wb.addWorksheet('Profit & Loss Statement')
  const wsCF = wb.addWorksheet('Cash Flow Statement')
  const wsCat = wb.addWorksheet('Category-wise Expense')
  const wsMon = wb.addWorksheet('Monthly Summary')
  const wsLed = wb.addWorksheet('Transaction Ledger')

  /* ---- Income Register ---- */
  title(wsInc, 'Income Register', range)
  header(wsInc, 4, ['Transaction ID', 'Income title', 'Category', 'Amount (revenue)', 'Received', 'Balance (pending)', 'Date', 'Payment method', 'Payment status', 'Description', 'Reference / order ID'])
  inc.forEach((x, i) => {
    const r = 5 + i
    wsInc.getRow(r).values = [x.code, x.title, x.category, x.amount, x.received, f(`D${r}-E${r}`, x.balance), d(x.date), METHOD[x.method] || '', STATUS[x.status] || x.status, x.description, x.reference]
    wsInc.getCell(`G${r}`).numFmt = DATE
  })
  const iFirst = 5, iLast = Math.max(5, 4 + inc.length), iTot = iLast + 1
  const incTotals = wsInc.getRow(iTot)
  incTotals.getCell(1).value = 'TOTAL'
  incTotals.getCell(4).value = f(`SUM(D${iFirst}:D${iLast})`, sum.revenue)
  incTotals.getCell(5).value = f(`SUM(E${iFirst}:E${iLast})`, inc.reduce((t, x) => t + x.received, 0))
  incTotals.getCell(6).value = f(`SUM(F${iFirst}:F${iLast})`, sum.receivables)
  bold(incTotals)
  money(wsInc, ['D', 'E', 'F'], iFirst, iTot)
  widths(wsInc, [16, 44, 18, 16, 14, 16, 14, 16, 14, 36, 20])
  wsInc.views = [{ state: 'frozen', ySplit: 4 }]
  wsInc.autoFilter = `A4:K${Math.max(5, iLast)}`

  /* ---- Expense Register ---- */
  title(wsExp, 'Expense Register', range)
  header(wsExp, 4, ['Expense ID', 'Expense title', 'Category', 'Amount', 'Date', 'Payment method', 'Vendor / payee', 'Payment status', 'Paid on', 'Description', 'Bill / receipt'])
  exp.forEach((x, i) => {
    const r = 5 + i
    wsExp.getRow(r).values = [x.code, x.name, x.category, x.amount, d(x.expense_date), METHOD[x.payment_method] || '', x.vendor, x.status === 'paid' ? 'Paid' : 'Pending', x.paid_date ? d(x.paid_date) : '', x.reason, x.attachment?.name || '']
    wsExp.getCell(`E${r}`).numFmt = DATE
    wsExp.getCell(`I${r}`).numFmt = DATE
  })
  const eFirst = 5, eLast = Math.max(5, 4 + exp.length), eTot = eLast + 1
  const expTotals = wsExp.getRow(eTot)
  expTotals.getCell(1).value = 'TOTAL'
  expTotals.getCell(4).value = f(`SUM(D${eFirst}:D${eLast})`, sum.totalExpenses)
  bold(expTotals)
  money(wsExp, ['D'], eFirst, eTot)
  widths(wsExp, [14, 34, 16, 14, 14, 16, 28, 14, 14, 34, 24])
  wsExp.views = [{ state: 'frozen', ySplit: 4 }]
  wsExp.autoFilter = `A4:K${Math.max(5, eLast)}`

  const IR = (col) => `${q('Income Register')}!$${col}$${iFirst}:$${col}$${iLast}`
  const ER = (col) => `${q('Expense Register')}!$${col}$${eFirst}:$${col}$${eLast}`

  /* ---- Profit & Loss ---- */
  title(wsPL, 'Profit & Loss Statement (accrual basis)', range)
  header(wsPL, 4, ['Item', 'Amount', '% of revenue'])
  let r = 5
  const put = (label, value, opts = {}) => {
    const row = wsPL.getRow(r)
    row.getCell(1).value = label
    row.getCell(2).value = value
    row.getCell(2).numFmt = CURRENCY
    if (opts.pct) { row.getCell(3).value = opts.pct; row.getCell(3).numFmt = PERCENT }
    if (opts.bold) bold(row)
    return r++
  }
  const revCats = [...new Set(['Student fees', 'Arena bookings', ...pl.revenueByCategory.map((x) => x.name)])]
  const revRows = revCats.map((c) => put(`  ${c}`, f(`SUMIFS(${IR('D')},${IR('C')},"${c}")`, pl.revenueByCategory.find((x) => x.name === c)?.value || 0)))
  const revTotal = put('Total revenue', f(`SUM(B${revRows[0]}:B${revRows.at(-1)})`, pl.revenue), { bold: true })
  const cogsCats = CATS.filter((c) => c.cogs).map((c) => c.name)
  const cogsRows = cogsCats.map((c) => put(`  ${c}`, f(`SUMIFS(${ER('D')},${ER('C')},"${c}")`, pl.cogsByCategory.find((x) => x.name === c)?.value || 0)))
  const cogsTotal = put('Cost of goods / services sold', f(`SUM(B${cogsRows[0]}:B${cogsRows.at(-1)})`, pl.cogs), { bold: true })
  const grossRow = put('Gross profit', f(`B${revTotal}-B${cogsTotal}`, pl.gross), { bold: true })
  const opexCats = CATS.filter((c) => !c.cogs).map((c) => c.name)
  const opexRows = opexCats.map((c) => put(`  ${c}`, f(`SUMIFS(${ER('D')},${ER('C')},"${c}")`, pl.opexByCategory.find((x) => x.name === c)?.value || 0)))
  const opexTotal = put('Operating expenses', f(`SUM(B${opexRows[0]}:B${opexRows.at(-1)})`, pl.opex), { bold: true })
  const netRow = put('Net profit / (loss)', f(`B${grossRow}-B${opexTotal}`, pl.net), { bold: true })
  ;[...revRows, revTotal, ...cogsRows, cogsTotal, grossRow, ...opexRows, opexTotal, netRow].forEach((rr) => {
    const res = { value: wsPL.getCell(`B${rr}`).value.result }
    wsPL.getCell(`C${rr}`).value = f(`IF($B$${revTotal}=0,0,B${rr}/$B$${revTotal})`, pl.revenue ? res.value / pl.revenue : 0)
    wsPL.getCell(`C${rr}`).numFmt = PERCENT
  })
  widths(wsPL, [38, 18, 14])
  wsPL.getCell(`A${r + 1}`).value = 'Revenue is recognised on the membership start date / booking date / income date (including amounts still pending). Cost of goods = expense categories flagged as Purchases.'
  wsPL.getCell(`A${r + 1}`).font = { italic: true, color: { argb: 'FF64748B' } }

  /* ---- Ledger (needed before cash flow formulas) ---- */
  title(wsLed, 'Transaction Ledger (cash basis: money actually received or paid)', range)
  header(wsLed, 4, ['Date', 'Transaction ID', 'Description', 'Income', 'Expense', 'Payment method', 'Running balance', 'Type'])
  const lo = wsLed.getRow(5)
  lo.getCell(3).value = 'Opening balance'
  lo.getCell(7).value = led.opening
  bold(lo)
  led.rows.forEach((x, i) => {
    const row = 6 + i
    wsLed.getRow(row).values = [d(x.date), x.tx, x.description, x.income || '', x.expense || '', x.method, f(`G${row - 1}+N(D${row})-N(E${row})`, x.balance), x.type]
    wsLed.getCell(`A${row}`).numFmt = DATE
  })
  const lFirst = 6, lLast = Math.max(5, 5 + led.rows.length), lTot = lLast + 1
  const lt = wsLed.getRow(lTot)
  lt.getCell(3).value = 'TOTAL / CLOSING BALANCE'
  lt.getCell(4).value = f(`SUM(D${lFirst}:D${lLast})`, led.totalIn)
  lt.getCell(5).value = f(`SUM(E${lFirst}:E${lLast})`, led.totalOut)
  lt.getCell(7).value = f(`G5+D${lTot}-E${lTot}`, led.closing)
  bold(lt)
  money(wsLed, ['D', 'E', 'G'], 5, lTot)
  widths(wsLed, [14, 18, 48, 15, 15, 16, 18, 10])
  wsLed.views = [{ state: 'frozen', ySplit: 4 }]
  wsLed.autoFilter = `A4:H${Math.max(5, lLast)}`
  const LR = (col) => `${q('Transaction Ledger')}!$${col}$${lFirst}:$${col}$${lLast}`

  /* ---- Cash Flow ---- */
  title(wsCF, 'Cash Flow Statement (actual money received and paid)', range)
  header(wsCF, 4, ['Item', 'Amount'])
  r = 5
  const cput = (label, value, isBold) => {
    const row = wsCF.getRow(r)
    row.getCell(1).value = label
    row.getCell(2).value = value
    row.getCell(2).numFmt = CURRENCY
    if (isBold) bold(row)
    return r++
  }
  const cOpen = cput('Opening cash balance', f(`${q('Transaction Ledger')}!G5`, cf.opening), true)
  const cRecv = cput('  Fees & booking payments received', f(`SUMIFS(${LR('D')},${LR('H')},"payment")`, cf.received))
  const cOth = cput('  Other income received', f(`SUMIFS(${LR('D')},${LR('H')},"income")`, cf.otherIncome))
  const cIn = cput('Total cash inflows', f(`B${cRecv}+B${cOth}`, cf.inflow), true)
  const cExp = cput('  Expenses paid', f(`SUMIFS(${LR('E')},${LR('H')},"expense")`, cf.expensesPaid))
  const cRef = cput('  Refunds paid', f(`SUMIFS(${LR('E')},${LR('H')},"refund")`, cf.refunds))
  const cOut = cput('Total cash outflows', f(`B${cExp}+B${cRef}`, cf.outflow), true)
  const cNet = cput('Net cash flow', f(`B${cIn}-B${cOut}`, cf.net), true)
  const cClose = cput('Closing cash balance', f(`B${cOpen}+B${cNet}`, cf.closing), true)
  r++
  cput('Check: ledger closing balance', f(`${q('Transaction Ledger')}!G${lTot}`, led.closing))
  cput('Difference (must be 0)', f(`B${cClose}-B${r - 1}`, 0))
  r++
  wsCF.getCell(`A${r}`).value = 'Net profit (accrual) is shown separately on the Profit & Loss sheet; pending receivables and payables are not cash.'
  wsCF.getCell(`A${r}`).font = { italic: true, color: { argb: 'FF64748B' } }
  widths(wsCF, [42, 20])

  /* ---- Category-wise expense ---- */
  title(wsCat, 'Category-wise Expense Report', range)
  header(wsCat, 4, ['Category', 'Type', 'Entries', 'Total amount', '% of expenses', 'Paid', 'Pending'])
  const cats = CATS.map((c) => c.name)
  cats.forEach((c, i) => {
    const row = 5 + i
    const list = exp.filter((e) => e.category === c)
    const total = list.reduce((t, e) => t + e.amount, 0)
    wsCat.getRow(row).values = [
      c, CATS[i].cogs ? 'Cost of goods' : 'Operating',
      f(`COUNTIFS(${ER('C')},A${row})`, list.length), f(`SUMIFS(${ER('D')},${ER('C')},A${row})`, total),
      f(`IF($D$${5 + cats.length}=0,0,D${row}/$D$${5 + cats.length})`, sum.totalExpenses ? total / sum.totalExpenses : 0),
      f(`SUMIFS(${ER('D')},${ER('C')},A${row},${ER('H')},"Paid")`, list.filter((e) => e.status === 'paid').reduce((t, e) => t + e.amount, 0)),
      f(`SUMIFS(${ER('D')},${ER('C')},A${row},${ER('H')},"Pending")`, list.filter((e) => e.status === 'pending').reduce((t, e) => t + e.amount, 0)),
    ]
    wsCat.getCell(`E${row}`).numFmt = PERCENT
  })
  const cTot = 5 + cats.length
  const ct = wsCat.getRow(cTot)
  ct.getCell(1).value = 'TOTAL'
  ct.getCell(3).value = f(`SUM(C5:C${cTot - 1})`, exp.length)
  ct.getCell(4).value = f(`SUM(D5:D${cTot - 1})`, sum.totalExpenses)
  ct.getCell(5).value = f(`SUM(E5:E${cTot - 1})`, sum.totalExpenses ? 1 : 0)
  ct.getCell(6).value = f(`SUM(F5:F${cTot - 1})`, exp.filter((e) => e.status === 'paid').reduce((t, e) => t + e.amount, 0))
  ct.getCell(7).value = f(`SUM(G5:G${cTot - 1})`, sum.payables)
  bold(ct)
  wsCat.getCell(`E${cTot}`).numFmt = PERCENT
  money(wsCat, ['D', 'F', 'G'], 5, cTot)
  widths(wsCat, [20, 16, 10, 16, 14, 16, 16])

  /* ---- Monthly summary ---- */
  title(wsMon, 'Monthly Financial Summary', range)
  header(wsMon, 4, ['Month', 'Revenue', 'Cost of goods', 'Gross profit', 'Operating expenses', 'Net profit / (loss)', 'Cash received', 'Cash paid', 'Net cash flow'])
  months.forEach((m, i) => {
    const row = 5 + i
    wsMon.getRow(row).values = [m.label, m.revenue, m.cogs, f(`B${row}-C${row}`, m.gross), m.opex, f(`D${row}-E${row}`, m.net), m.cashIn, m.cashOut, f(`G${row}-H${row}`, m.netCash)]
  })
  const mLast = 4 + months.length, mTot = mLast + 1
  const mt = wsMon.getRow(mTot)
  mt.getCell(1).value = 'TOTAL'
  'BCDEFGHI'.split('').forEach((c) => {
    const key = { B: 'revenue', C: 'cogs', D: 'gross', E: 'opex', F: 'net', G: 'cashIn', H: 'cashOut', I: 'netCash' }[c]
    mt.getCell(c).value = f(`SUM(${c}5:${c}${mLast})`, months.reduce((t, m) => t + m[key], 0))
  })
  bold(mt)
  money(wsMon, 'BCDEFGHI'.split(''), 5, mTot)
  widths(wsMon, [14, 16, 16, 16, 18, 18, 16, 16, 16])
  wsMon.views = [{ state: 'frozen', ySplit: 4 }]

  /* ---- Financial summary ---- */
  title(wsSum, 'Financial Summary', range)
  wsSum.getCell('A3').value = `Generated on ${new Date().toLocaleString('en-IN')}`
  wsSum.getCell('A3').font = { italic: true, color: { argb: 'FF64748B' } }
  header(wsSum, 5, ['Measure', 'Amount', 'Basis'])
  const PLs = q('Profit & Loss Statement'), CFs = q('Cash Flow Statement')
  const rows = [
    ['Total revenue / income', f(`${PLs}!B${revTotal}`, sum.revenue), 'Accrual (billed)'],
    ['Total expenses', f(`${PLs}!B${cogsTotal}+${PLs}!B${opexTotal}`, sum.totalExpenses), 'Accrual (incurred)'],
    ['Gross profit', f(`${PLs}!B${grossRow}`, sum.gross), 'Revenue − cost of goods'],
    ['Net profit / (loss)', f(`${PLs}!B${netRow}`, sum.net), 'Gross profit − operating expenses'],
    ['Total cash received', f(`${CFs}!B${cIn}`, sum.cashReceived), 'Cash (money in)'],
    ['Total cash paid', f(`${CFs}!B${cOut}`, sum.cashPaid), 'Cash (money out, incl. refunds)'],
    ['Net cash flow', f(`${CFs}!B${cNet}`, sum.netCash), 'Cash received − cash paid'],
    ['Pending receivables', f(`SUM(${IR('F')})`, sum.receivables), 'Income not yet collected'],
    ['Pending payables', f(`SUMIFS(${ER('D')},${ER('H')},"Pending")`, sum.payables), 'Expenses not yet paid'],
  ]
  rows.forEach((v, i) => {
    const row = 6 + i
    wsSum.getRow(row).values = v
    wsSum.getCell(`B${row}`).numFmt = CURRENCY
    wsSum.getCell(`A${row}`).font = { bold: true }
  })
  widths(wsSum, [30, 20, 36])
  wsSum.getCell('A16').value = 'All figures come from the live records for the selected period. Totals are formulas linked to the other sheets.'
  wsSum.getCell('A16').font = { italic: true, color: { argb: 'FF64748B' } }
  return wb
}
