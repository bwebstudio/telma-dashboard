import ExcelJS from 'exceljs'
import { getAppUser, isCrmUser } from '@/lib/auth'
import { getDict } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/server'
import {
  applyFilters,
  byUrgency,
  fetchReps,
  fetchVisibleProspects,
  parseFilters,
} from '@/lib/crm/data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Exports exactly the list the user is looking at, with the same filters.
// Row Level Security applies, so a rep can only ever export their own
// prospects: the file cannot leak a colleague's pipeline.
export async function GET(request: Request) {
  const me = await getAppUser()
  if (!me || !isCrmUser(me)) {
    return new Response('forbidden', { status: 403 })
  }

  const url = new URL(request.url)
  const filters = parseFilters(Object.fromEntries(url.searchParams.entries()))
  const { locale, dict } = await getDict()
  const t = dict.crm

  const supabase = await createClient()
  const [rows, reps] = await Promise.all([
    fetchVisibleProspects(supabase),
    fetchReps(supabase),
  ])
  const repName = new Map(reps.map((r) => [r.id, r.full_name]))
  const prospects = applyFilters(rows, filters, me.id).sort(byUrgency)

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Telma'
  const ws = wb.addWorksheet(t.list.title.slice(0, 30))

  ws.columns = [
    { header: t.list.colName, key: 'name', width: 34 },
    { header: t.novo.specialty, key: 'specialty', width: 14 },
    { header: t.novo.country, key: 'country', width: 12 },
    { header: t.list.colZone, key: 'zone', width: 18 },
    { header: t.detail.address, key: 'address', width: 30 },
    { header: t.novo.phone, key: 'phone', width: 18 },
    { header: t.detail.website, key: 'website', width: 24 },
    { header: t.detail.origin, key: 'origin', width: 18 },
    { header: t.novo.originNote, key: 'origin_note', width: 20 },
    { header: t.list.colStage, key: 'stage', width: 20 },
    { header: t.list.colRep, key: 'rep', width: 20 },
    { header: t.list.colNext, key: 'next_text', width: 30 },
    { header: `${t.list.colNext} (${dict.common.date})`, key: 'next_at', width: 20 },
    { header: dict.interno.colActivity, key: 'last', width: 20 },
  ]

  ws.getRow(1).font = { bold: true }
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  for (const p of prospects) {
    ws.addRow({
      name: p.name,
      specialty: t.specialty[p.specialty],
      country: t.country[p.country],
      zone: p.zone ?? '',
      address: p.address ?? '',
      phone: p.phone ?? '',
      website: p.website ?? '',
      origin: t.origin[p.origin],
      origin_note: p.origin_note ?? '',
      stage: t.stage[p.stage],
      rep: p.rep_id ? (repName.get(p.rep_id) ?? '') : t.list.unassigned,
      next_text: p.next_action_text ?? '',
      next_at: p.next_action_at ? new Date(p.next_action_at) : '',
      last: p.last_activity_at ? new Date(p.last_activity_at) : '',
    })
  }

  ws.getColumn('next_at').numFmt = 'yyyy-mm-dd hh:mm'
  ws.getColumn('last').numFmt = 'yyyy-mm-dd hh:mm'
  ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columns.length } }

  const buffer = await wb.xlsx.writeBuffer()
  const stamp = new Date().toISOString().slice(0, 10)

  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="telma-crm-${locale}-${stamp}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
