import { DragEvent, FormEvent, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import BoardPage from './components/BoardPage'
import ChargingStationMapPage from './components/ChargingStationMapPage'
import MyPage from './components/MyPage'

type Mode = 'login' | 'signup'

const menuItems = ['홈', '게시판', '대시보드', '전국전동휠체어급속충전기 위치', '마이 페이지']
const chargingStationMenu = '전국전동휠체어급속충전기 위치'
const myPageMenu = '마이 페이지'

function HomePage({ session }: { session: Session }) {
  const [question, setQuestion] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [answer, setAnswer] = useState('질문을 입력하면 이곳에 AI의 답변이 표시됩니다.')
  const [asking, setAsking] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const displayName = session.user.user_metadata.display_name as string | undefined

  const selectFile = (selectedFile?: File) => {
    if (selectedFile) setFile(selectedFile)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    selectFile(event.dataTransfer.files[0])
  }

  const askQuestion = async (event: FormEvent) => {
    event.preventDefault()
    if (!question.trim()) return
    setAsking(true)
    setAnswer('AI가 답변을 작성하고 있습니다...')

    const body = new FormData()
    body.append('question', question.trim())
    if (file) body.append('file', file)

    const { data, error } = await supabase.functions.invoke<{ answer?: string; error?: string }>('ask-ai', { body })

    if (error) {
      let detail = error.message
      try {
        const context = (error as { context?: Response }).context
        if (context) {
          const payload = await context.json() as { error?: string }
          if (payload.error) detail = payload.error
        }
      } catch {
        // 응답 본문을 읽을 수 없으면 기본 오류 메시지를 사용합니다.
      }
      setAnswer(`오류가 발생했습니다: ${detail}`)
    } else {
      setAnswer(data?.answer ?? data?.error ?? 'AI 응답이 비어 있습니다.')
    }
    setAsking(false)
  }

  return (
    <main className="home-grid">
      <section className="question-panel">
        <div className="panel-inner">
          <p className="home-eyebrow">WELCOME HOME</p>
          <h1>{displayName ? `${displayName}님, 환영합니다.` : '환영합니다.'}</h1>
          <h2>AI에게 무엇을 요청할까요?</h2>

          <form className="question-form" onSubmit={askQuestion}>
            <label htmlFor="question">질문 내용</label>
            <textarea
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="궁금한 내용이나 필요한 작업을 자세히 입력해 주세요."
              rows={7}
              required
            />

            <div
              className={`drop-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => event.key === 'Enter' && fileInputRef.current?.click()}
            >
              <span className="upload-icon">↑</span>
              {file ? (
                <><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)} KB · 클릭하여 변경</small></>
              ) : (
                <><strong>파일을 여기에 끌어다 놓으세요</strong><small>또는 클릭하여 파일 선택</small></>
              )}
              <input ref={fileInputRef} type="file" hidden onChange={(event) => selectFile(event.target.files?.[0])} />
            </div>

            <button className="ask-button" type="submit" disabled={asking}>
              {asking ? '답변 생성 중...' : '질문하기'} <span>{asking ? '···' : '→'}</span>
            </button>
          </form>
        </div>
      </section>

      <section className="answer-panel">
        <div className="answer-heading">
          <span className="answer-dot" />
          <h2>AI 대답:</h2>
        </div>
        <div className="answer-content">{answer}</div>
      </section>
    </main>
  )
}

function AuthenticatedApp({ session }: { session: Session }) {
  const [notice, setNotice] = useState('')
  const [activeMenu, setActiveMenu] = useState('홈')

  const selectMenu = (item: string) => {
    if (item === '홈' || item === '게시판' || item === chargingStationMenu || item === myPageMenu) {
      setActiveMenu(item)
      setNotice('')
    } else {
      setNotice(`${item} 페이지는 준비 중입니다.`)
      window.setTimeout(() => setNotice(''), 1800)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="logo" href="#home" aria-label="홈"><span>S</span> Smart AI</a>
        <nav aria-label="주 메뉴">
          {menuItems.map((item) => (
            <button key={item} className={item === activeMenu ? 'active' : ''} onClick={() => selectMenu(item)}>{item}</button>
          ))}
        </nav>
        <div className="account-area">
          <span>{session.user.email}</span>
          <button onClick={() => supabase.auth.signOut()}>로그아웃</button>
        </div>
      </header>
      {notice && <div className="toast" role="status">{notice}</div>}
      {activeMenu === '게시판'
        ? <BoardPage session={session} />
        : activeMenu === chargingStationMenu
          ? <ChargingStationMapPage />
          : activeMenu === myPageMenu
            ? <MyPage session={session} />
          : <HomePage session={session} />}
    </div>
  )
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCheckingSession(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setCheckingSession(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    const result = mode === 'signup'
      ? await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim() } } })
      : await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (result.error) return setMessage(result.error.message)
    if (mode === 'signup' && !result.data.session) {
      setMessage('가입 확인 메일을 보냈습니다. 이메일의 링크를 눌러 가입을 완료해 주세요.')
    }
    setPassword('')
  }

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode)
    setMessage('')
    setPassword('')
  }

  if (checkingSession) return <main className="auth-page"><div className="loader" aria-label="로그인 상태 확인 중" /></main>
  if (session) return <AuthenticatedApp session={session} />

  return (
    <main className="auth-page">
      <section className="card">
        <div className="brand">S</div>
        <p className="eyebrow">WELCOME</p>
        <h1>{mode === 'login' ? '다시 만나 반가워요' : '새 계정을 만들어요'}</h1>
        <p className="description">{mode === 'login' ? '계정에 로그인하고 서비스를 계속 이용하세요.' : '몇 가지 정보만 입력하면 바로 시작할 수 있어요.'}</p>
        <div className="tabs" role="tablist">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => changeMode('login')}>로그인</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => changeMode('signup')}>회원가입</button>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && <label>이름<input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" required autoComplete="name" /></label>}
          <label>이메일<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email" /></label>
          <label>비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8자 이상 입력하세요" minLength={8} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
          {message && <p className="message" role="alert">{message}</p>}
          <button className="primary-button" type="submit" disabled={loading}>{loading ? '처리 중...' : mode === 'login' ? '로그인' : '계정 만들기'}</button>
        </form>
      </section>
    </main>
  )
}

export default App
