import { supabase } from './lib/supabase'

type PlannerState = { place: string; level: string; minutes: number; days: number; habits: string[] }
type Snapshot = { state: PlannerState; checks: Record<string, boolean>; date: string }
type CloudRow = Snapshot & { user_id: string; updated_at?: string }

const status = () => document.getElementById('cloud-status')
let activeUserId: string | null = null
let saveTimer = 0

function setStatus(message: string, link = false) {
  const node = status()
  if (!node) return
  node.textContent = ''
  if (link) {
    const anchor = document.createElement('a')
    anchor.href = '/'
    anchor.textContent = '로그인하면 여러 기기에서 이어 쓸 수 있어요'
    node.append(anchor)
  } else node.textContent = message
}

function announceRestore(snapshot: Snapshot) {
  window.dispatchEvent(new CustomEvent('move-well-restore', { detail: snapshot }))
}

async function loadUser(userId: string) {
  activeUserId = userId
  window.moveWellCloudUser = true
  localStorage.removeItem('move-well-v1')
  announceRestore({ state: { place: 'home', level: 'beginner', minutes: 30, days: 3, habits: [] }, checks: {}, date: new Date().toISOString().slice(0, 10) })
  setStatus('계정 기록을 불러오는 중…')
  const { data, error } = await supabase.from('move_well_states').select('place,level,minutes,days,habits,checks,check_date').eq('user_id', userId).maybeSingle()
  if (activeUserId !== userId) return
  if (error) {
    setStatus('클라우드 저장 설정이 필요해요. 관리자에게 Supabase 마이그레이션 적용을 요청하세요.')
    return
  }
  if (data) {
    const snapshot: Snapshot = { state: { place: data.place, level: data.level, minutes: data.minutes, days: data.days, habits: data.habits ?? [] }, checks: data.checks ?? {}, date: data.check_date }
    announceRestore(snapshot)
    setStatus('로그인한 계정에 안전하게 저장돼요')
  } else {
    setStatus('이 계정에 운동 계획과 체크 기록을 저장해요')
  }
}

window.addEventListener('move-well-save', (event) => {
  const detail = (event as CustomEvent<Snapshot>).detail
  if (!detail) return
  if (!activeUserId) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(async () => {
    const userId = activeUserId
    if (!userId) return
    setStatus('계정에 저장 중…')
    const row: CloudRow = { user_id: userId, ...detail, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('move_well_states').upsert(row, { onConflict: 'user_id' })
    if (activeUserId !== userId) return
    setStatus(error ? '저장에 실패했어요. 연결 상태를 확인해 주세요.' : '로그인한 계정에 안전하게 저장돼요')
  }, 500)
})

supabase.auth.onAuthStateChange((_event, session) => {
  const userId = session?.user.id ?? null
  if (userId === activeUserId) return
  window.clearTimeout(saveTimer)
  activeUserId = userId
  if (userId) void loadUser(userId)
  else {
    window.moveWellCloudUser = false
    localStorage.removeItem('move-well-v1')
    announceRestore({ state: { place: 'home', level: 'beginner', minutes: 30, days: 3, habits: [] }, checks: {}, date: new Date().toISOString().slice(0, 10) })
    setStatus('이 브라우저에 저장 중')
    setStatus('', true)
  }
})

void supabase.auth.getSession().then(({ data }) => {
  if (data.session?.user.id && data.session.user.id !== activeUserId) void loadUser(data.session.user.id)
  else if (!data.session) { setStatus('', true) }
})

declare global { interface Window { moveWellCloudUser?: boolean } }
