import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8').toLowerCase()

describe('database security baseline', () => {
  it('enables RLS on every public application table', () => {
    const tables = [...schema.matchAll(/create table if not exists public\.(\w+)/g)].map(match => match[1])
    expect(tables.length).toBeGreaterThan(8)
    for (const table of tables) expect(schema).toContain(`alter table public.${table} enable row level security`)
  })

  it('removes broad browser grants before adding narrow grants', () => {
    expect(schema).toContain('revoke all on public.ts_departments')
    expect(schema).not.toMatch(/grant all[^;]+to anon/)
  })

  it('contains no salary or employee rate columns', () => {
    expect(schema).not.toMatch(/\b(salary|hourly_rate|daily_rate|pay_rate)\b/)
  })

  it('keeps admin checks outside the exposed public schema', () => {
    expect(schema).toContain('function private.is_admin()')
    expect(schema).toContain('revoke all on function private.is_admin() from public, anon')
  })
})
