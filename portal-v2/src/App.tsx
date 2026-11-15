import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { demoProfile, demoRows } from './data/demo'
import { employeeLoginEmail, isSupabaseConfigured, supabase } from './lib/supabase'
import { minutesToHours } from './lib/timeCalculations'
import type { EmployeeProfile, TimesheetRow } from './types'

type View = 'timesheet' | 'corrections'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [demo, setDemo] = useState(!isSupabaseConfigured)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="splash">Loading WINTECH portal…</div>
  if (!session && !demo) return <Login onDemo={() => setDemo(true)} />
  return <Portal demo={demo} session={session} onExit={() => demo ? setDemo(false) : supabase?.auth.signOut()} />
}

function Login({ onDemo }: { onDemo: () => void }) {
  const [employeeId, setEmployeeId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    const { error: authError } = await supabase!.auth.signInWithPassword({
      email: employeeLoginEmail(employeeId), password,
    })
    if (authError) setError('Hindi tama ang employee ID o password.')
    setBusy(false)
  }

  return <main className="login-page">
    <section className="login-brand">
      <div className="logo-mark">W</div>
      <p className="eyebrow">WINTECH</p>
      <h1>Your time,<br />clearly accounted.</h1>
      <p>Review attendance, confirm your timesheet, and request corrections before cutoff.</p>
      <div className="privacy-note"><span>◆</span><div><strong>Private by design</strong><br />Only you and authorized reviewers can see your records.</div></div>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow dark">EMPLOYEE PORTAL</p>
        <h2>Welcome back</h2>
        <p className="muted">Sign in using your WINTECH employee ID.</p>
        <label>Employee ID<input autoComplete="username" value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="e.g. WT-S-004" required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" required /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <button type="button" className="text-button" onClick={onDemo}>Preview with sample data</button>
      </form>
    </section>
  </main>
}

function Portal({ demo, session, onExit }: { demo: boolean; session: Session | null; onExit: () => void }) {
  const [view, setView] = useState<View>('timesheet')
  const [profile, setProfile] = useState<EmployeeProfile>(demoProfile)
  const [rows, setRows] = useState<TimesheetRow[]>(demoRows)
  const [corrections, setCorrections] = useState<Array<{ id: string; date: string; reason: string; status: string }>>([])
  const [period, setPeriod] = useState<{ id: string; starts_on: string; ends_on: string; cutoff_at: string } | null>(demo ? { id: 'demo', starts_on: '2026-11-01', ends_on: '2026-11-30', cutoff_at: '2026-11-30T14:00:00Z' } : null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (demo || !session || !supabase) return
    Promise.all([
      supabase.from('ts_employee_profiles').select('user_id, employee_number, full_name, role, department:ts_departments(name), work_category:ts_work_categories(name, regular_minutes)').eq('user_id', session.user.id).single(),
      supabase.from('ts_attendance_entries').select('*').order('work_date', { ascending: false }).limit(31),
      supabase.from('ts_correction_requests').select('id, work_date, reason, status').order('created_at', { ascending: false }),
      supabase.from('ts_pay_periods').select('id, starts_on, ends_on, cutoff_at').eq('status', 'open').lte('starts_on', new Date().toISOString().slice(0, 10)).gte('ends_on', new Date().toISOString().slice(0, 10)).limit(1).maybeSingle(),
    ]).then(([p, a, c, pp]) => {
      if (p.data) setProfile(p.data as unknown as EmployeeProfile)
      if (a.data) setRows(a.data.map(x => ({ id: x.id, workDate: x.work_date, amIn: x.am_in, amOut: x.am_out, pmIn: x.pm_in, pmOut: x.pm_out, basicMinutes: x.basic_minutes, overtimeMinutes: x.overtime_minutes, totalMinutes: x.total_minutes, status: x.is_holiday ? 'holiday' : x.is_friday ? 'friday' : (!x.am_in || !x.pm_out ? 'incomplete' : 'complete') })))
      if (c.data) setCorrections(c.data.map(x => ({ id: x.id, date: x.work_date, reason: x.reason, status: x.status })))
      if (pp.data) setPeriod(pp.data)
    })
  }, [demo, session])

  const totals = useMemo(() => rows.reduce((sum, row) => ({ basic: sum.basic + row.basicMinutes, ot: sum.ot + row.overtimeMinutes, total: sum.total + row.totalMinutes }), { basic: 0, ot: 0, total: 0 }), [rows])

  async function confirm() {
    if (demo) { setNotice('Demo only: confirmation was not saved.'); return }
    if (!period || !supabase) { setNotice('No open pay period is available.'); return }
    const { error } = await supabase.from('ts_timesheet_confirmations').upsert({ pay_period_id: period.id }, { onConflict: 'employee_id,pay_period_id', ignoreDuplicates: true })
    setNotice(error ? `Could not confirm: ${error.message}` : 'Timesheet confirmed successfully.')
  }

  return <div className="app-shell">
    <aside>
      <div><div className="sidebar-logo"><span>W</span><strong>WINTECH</strong></div>
        <nav><button className={view === 'timesheet' ? 'active' : ''} onClick={() => setView('timesheet')}>▦ <span>Timesheet</span></button><button className={view === 'corrections' ? 'active' : ''} onClick={() => setView('corrections')}>✎ <span>Corrections</span>{corrections.length > 0 && <b>{corrections.length}</b>}</button></nav>
      </div>
      <button className="signout" onClick={onExit}>↪ <span>Sign out</span></button>
    </aside>
    <main className="portal-main">
      <header><div><p className="eyebrow dark">EMPLOYEE SELF-SERVICE</p><h1>{view === 'timesheet' ? 'My timesheet' : 'Correction requests'}</h1></div><div className="profile"><div><strong>{profile.full_name}</strong><span>{profile.employee_number} · {profile.department?.name}</span></div><div className="avatar">{profile.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}</div></div></header>
      {demo && <div className="demo-banner"><span>Sample data</span> This preview is not connected to Supabase or TimeStation.</div>}
      {view === 'timesheet' ? <>
        <section className="period-bar"><div><span>PAY PERIOD</span><strong>{period ? `${formatShortDate(period.starts_on)} – ${formatShortDate(period.ends_on)}` : 'No open period'}</strong></div><div className="cutoff"><span>CUTOFF</span><strong>{period ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(period.cutoff_at)) : '—'}</strong></div><button aria-label="Previous period">‹</button><button aria-label="Next period">›</button></section>
        <section className="summary-grid"><Summary label="Basic hours" value={minutesToHours(totals.basic)} tone="navy" /><Summary label="Overtime" value={minutesToHours(totals.ot)} tone="orange" /><Summary label="Total hours" value={minutesToHours(totals.total)} tone="green" /></section>
        <section className="table-card"><div className="table-heading"><div><h2>Attendance details</h2><p>{profile.work_category?.name} · {minutesToHours(profile.work_category?.regular_minutes ?? 0)} regular hrs/day</p></div><span className="synced">● TimeStation · sample</span></div>
          <div className="table-scroll"><table><thead><tr><th>Date</th><th>AM In</th><th>AM Out</th><th>PM In</th><th>PM Out</th><th>Basic</th><th>OT</th><th>Total hrs</th><th>Status</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong>{formatDate(row.workDate)}</strong></td><td>{row.amIn ?? '—'}</td><td>{row.amOut ?? '—'}</td><td>{row.pmIn ?? '—'}</td><td>{row.pmOut ?? '—'}</td><td>{minutesToHours(row.basicMinutes)}</td><td className="ot">{minutesToHours(row.overtimeMinutes)}</td><td><strong>{minutesToHours(row.totalMinutes)}</strong></td><td><span className={`status ${row.status}`}>{row.status === 'complete' ? 'Complete' : row.status === 'incomplete' ? 'Needs review' : row.status}</span></td></tr>)}</tbody></table></div>
        </section>
        <section className="confirm-card"><div><h3>Everything looks correct?</h3><p>Confirm before cutoff. Approved corrections will be reflected automatically.</p></div><button className="primary compact" onClick={confirm}>Confirm timesheet</button></section>
        {notice && <div className="toast" role="status">{notice}</div>}
      </> : <Corrections demo={demo} reviewerId={session?.user.id ?? null} canReview={profile.role === 'admin' || profile.role === 'reviewer'} corrections={corrections} setCorrections={setCorrections} />}
    </main>
  </div>
}

function Summary({ label, value, tone }: { label: string; value: string; tone: string }) { return <article className={`summary ${tone}`}><span>{label}</span><strong>{value}</strong><small>hours this period</small></article> }

function Corrections({ demo, reviewerId, canReview, corrections, setCorrections }: { demo: boolean; reviewerId: string | null; canReview: boolean; corrections: Array<{ id: string; date: string; reason: string; status: string }>; setCorrections: React.Dispatch<React.SetStateAction<Array<{ id: string; date: string; reason: string; status: string }>>> }) {
  const [date, setDate] = useState('2026-11-12'); const [reason, setReason] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!reason.trim()) return
    if (!demo && supabase) await supabase.from('ts_correction_requests').insert({ work_date: date, reason, requested_changes: {} })
    setCorrections(current => [{ id: crypto.randomUUID(), date, reason, status: 'pending' }, ...current]); setReason('')
  }
  async function review(id: string, status: 'approved' | 'rejected') {
    if (!demo && supabase && reviewerId) {
      const { error } = await supabase.from('ts_correction_requests').update({ status, reviewer_id: reviewerId, reviewed_at: new Date().toISOString() }).eq('id', id).eq('status', 'pending')
      if (error) return
    }
    setCorrections(current => current.map(item => item.id === id ? { ...item, status } : item))
  }
  return <div className="correction-layout"><form className="correction-form" onSubmit={submit}><h2>Request a correction</h2><p className="muted">Describe the missing or incorrect time. An authorized reviewer must approve every change.</p><label>Work date<input type="date" value={date} onChange={e => setDate(e.target.value)} required /></label><label>What needs correction?<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Example: Missing PM out at 6:00 PM" required /></label><button className="primary">Submit request</button></form><section className="request-list"><h2>{canReview ? 'Requests to review' : 'Request history'}</h2>{corrections.length === 0 ? <p className="empty">No correction requests yet.</p> : corrections.map(item => <article key={item.id}><div><strong>{formatDate(item.date)}</strong><p>{item.reason}</p></div><div className="review-actions"><span className={`status ${item.status}`}>{item.status}</span>{canReview && item.status === 'pending' && <><button onClick={() => review(item.id, 'approved')}>Approve</button><button onClick={() => review(item.id, 'rejected')}>Reject</button></>}</div></article>)}</section></div>
}

function formatDate(value: string) { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) }
function formatShortDate(value: string) { return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) }
