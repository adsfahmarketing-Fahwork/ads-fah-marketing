export type Cell = string | number | null | undefined
export interface Section { key: string; title: string; columns: string[]; rows: Cell[][] }

/** CSV ปลอดภัยต่อ Excel: ใส่ BOM ให้ภาษาไทยอ่านได้ และกัน CSV/Formula injection */
export function toCsv(sections: Section[]): string {
  const esc = (c: Cell): string => {
    let s = c === null || c === undefined ? '' : String(c)
    if (typeof c === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines: string[] = []
  sections.forEach((sec, i) => {
    if (i) lines.push('')
    if (sections.length > 1) lines.push(esc(sec.title))
    lines.push(sec.columns.map(esc).join(','))
    for (const r of sec.rows) lines.push(r.map(esc).join(','))
  })
  return '﻿' + lines.join('\r\n') + '\r\n'
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const downloadCsv = (sections: Section[], name: string) => save(new Blob([toCsv(sections)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`)

export async function downloadXlsx(sections: Section[], name: string) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const sheets = sections.map((s) => ({
    sheet: s.title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31),
    stickyRowsCount: 1,
    columns: s.columns.map(() => ({ width: 22 })),
    data: [
      s.columns.map((c) => ({ value: c, fontWeight: 'bold' as const })),
      ...s.rows.map((r) => r.map((c) => (c === null || c === undefined ? null : typeof c === 'number' ? c : String(c)))),
    ],
  }))
  const blob = await writeExcelFile(sheets as never).toBlob()
  save(blob, `${name}.xlsx`)
}
