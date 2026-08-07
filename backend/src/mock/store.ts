export type Row = Record<string, unknown>

export class MockStore {
  tables: Record<string, Row[]>
  authUsers: { id: string; email: string; password: string }[]

  constructor(tables: Record<string, Row[]>, authUsers: { id: string; email: string; password: string }[]) {
    this.tables = tables
    this.authUsers = authUsers
  }

  rows(table: string): Row[] {
    if (!this.tables[table]) this.tables[table] = []
    return this.tables[table]
  }

  setRows(table: string, rows: Row[]) {
    this.tables[table] = rows
  }
}
