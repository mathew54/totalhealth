import crypto from 'node:crypto'
import type { MockStore, Row } from './store.js'

type Op =
  | { op: 'eq'; col: string; val: unknown }
  | { op: 'gte'; col: string; val: unknown }
  | { op: 'lte'; col: string; val: unknown }
  | { op: 'in'; col: string; val: unknown[] }

/** Compara dos valores (números o strings) para filtros gte/lte. */
function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const sa = String(a)
  const sb = String(b)
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

export class QueryBuilder {
  private filters: Op[] = []
  private orderCol: string | null = null
  private orderAsc = true
  private rangeSlice: [number, number] | null = null
  private singleMode = false
  private insertData: Row[] | null = null
  private updateData: Row | null = null
  private deleteMode = false
  private selected: string[] | null = null

  constructor(private store: MockStore, private table: string) {}

  select(cols?: string) {
    this.selected = cols && cols.trim() !== '*' ? cols.split(',').map((c) => c.trim()) : null
    return this
  }
  insert(rows: Row | Row[]) {
    this.insertData = Array.isArray(rows) ? rows : [rows]
    return this
  }
  update(partial: Row) {
    this.updateData = partial
    return this
  }
  delete() {
    this.deleteMode = true
    return this
  }
  eq(col: string, val: unknown) {
    this.filters.push({ op: 'eq', col, val })
    return this
  }
  gte(col: string, val: unknown) {
    this.filters.push({ op: 'gte', col, val })
    return this
  }
  lte(col: string, val: unknown) {
    this.filters.push({ op: 'lte', col, val })
    return this
  }
  in(col: string, val: unknown[]) {
    this.filters.push({ op: 'in', col, val })
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col
    this.orderAsc = opts?.ascending ?? true
    return this
  }
  range(from: number, to: number) {
    this.rangeSlice = [from, to]
    return this
  }
  limit(n: number) {
    this.rangeSlice = [0, n - 1]
    return this
  }
  single() {
    this.singleMode = true
    return this
  }

  maybeSingle() {
    this.singleMode = true
    return this
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) => {
      const v = row[f.col]
      switch (f.op) {
        case 'eq':
          return v === f.val || (v == null && f.val == null)
        case 'gte':
          return v != null && compare(f.val, v) <= 0
        case 'lte':
          return v != null && compare(f.val, v) >= 0
        case 'in':
          return Array.isArray(f.val) && f.val.includes(v)
      }
    })
  }

  private project(row: Row): Row {
    if (!this.selected) return row
    const out: Row = {}
    for (const col of this.selected) out[col] = row[col]
    return out
  }

  async then(
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) {
    return this.execute().then(onFulfilled, onRejected)
  }

  private async execute(): Promise<{ data: unknown; error: null }> {
    if (this.insertData) {
      const inserted = this.insertData.map((r) => {
        const row = { ...r }
        if (!row.id) row.id = crypto.randomUUID()
        if (!row.created_at) row.created_at = new Date().toISOString()
        return row
      })
      this.store.rows(this.table).push(...inserted)
      return { data: this.singleMode ? inserted[0] : inserted, error: null }
    }

    if (this.updateData) {
      const targets = this.store.rows(this.table).filter((r) => this.matches(r))
      targets.forEach((r) => Object.assign(r, this.updateData))
      return { data: this.singleMode ? targets[0] ?? null : targets, error: null }
    }

    if (this.deleteMode) {
      const before = this.store.rows(this.table).length
      this.store.setRows(this.table, this.store.rows(this.table).filter((r) => !this.matches(r)))
      return { data: { count: before - this.store.rows(this.table).length }, error: null }
    }

    let rows = this.store.rows(this.table).filter((r) => this.matches(r))
    if (this.orderCol) {
      rows = [...rows].sort((a, b) => {
        const av = a[this.orderCol!]
        const bv = b[this.orderCol!]
        if (av == null && bv == null) return 0
        if (av == null) return 1
        if (bv == null) return -1
        const cmp = av > bv ? 1 : av < bv ? -1 : 0
        return this.orderAsc ? cmp : -cmp
      })
    }
    if (this.rangeSlice) rows = rows.slice(this.rangeSlice[0], this.rangeSlice[1] + 1)
    const out = rows.map((r) => this.project(r))
    return { data: this.singleMode ? out[0] ?? null : out, error: null }
  }
}