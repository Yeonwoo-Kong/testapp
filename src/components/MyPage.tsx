import { FormEvent, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

const PAGE_SIZE = 5
const PAGE_GROUP_SIZE = 5

interface SecretPost {
  id: number
  title: string
  view_count: number
  like_count: number
  created_at: string
}

interface KpiValues {
  likedPosts: number
  secretPosts: number
  posts: number
  monthlyPosts: number
}

const initialKpis: KpiValues = {
  likedPosts: 0,
  secretPosts: 0,
  posts: 0,
  monthlyPosts: 0,
}

export default function MyPage({ session }: { session: Session }) {
  const [kpis, setKpis] = useState(initialKpis)
  const [secretPosts, setSecretPosts] = useState<SecretPost[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [kpiLoading, setKpiLoading] = useState(true)
  const [listLoading, setListLoading] = useState(true)
  const [error, setError] = useState('')

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  useEffect(() => {
    let cancelled = false
    const loadKpis = async () => {
      setKpiLoading(true)
      const monthStart = new Date()
      monthStart.setDate(1)
      monthStart.setHours(0, 0, 0, 0)

      const [likedResult, secretResult, postResult, monthlyResult] = await Promise.all([
        supabase.from('post_likes').select('*', { count: 'exact', head: true }).eq('user_id', session.user.id),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', session.user.id).eq('is_secret', true),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', session.user.id),
        supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', session.user.id).gte('created_at', monthStart.toISOString()),
      ])

      if (cancelled) return
      const queryError = likedResult.error ?? secretResult.error ?? postResult.error ?? monthlyResult.error
      if (queryError) setError(queryError.message)
      else {
        setKpis({
          likedPosts: likedResult.count ?? 0,
          secretPosts: secretResult.count ?? 0,
          posts: postResult.count ?? 0,
          monthlyPosts: monthlyResult.count ?? 0,
        })
      }
      setKpiLoading(false)
    }
    void loadKpis()
    return () => { cancelled = true }
  }, [session.user.id])

  const loadSecretPosts = useCallback(async () => {
    setListLoading(true)
    setError('')
    let query = supabase
      .from('posts')
      .select('id,title,view_count,like_count,created_at', { count: 'exact' })
      .eq('author_id', session.user.id)
      .eq('is_secret', true)
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

    if (searchTerm) query = query.ilike('title', `%${searchTerm}%`)
    const { data, count, error: queryError } = await query

    if (queryError) setError(queryError.message)
    else {
      const nextTotalCount = count ?? 0
      const nextTotalPages = Math.max(1, Math.ceil(nextTotalCount / PAGE_SIZE))
      if (page > nextTotalPages) {
        setPage(nextTotalPages)
        setListLoading(false)
        return
      }
      setSecretPosts((data ?? []) as SecretPost[])
      setTotalCount(nextTotalCount)
    }
    setListLoading(false)
  }, [page, searchTerm, session.user.id])

  useEffect(() => { void loadSecretPosts() }, [loadSecretPosts])

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    setPage(1)
    setSearchTerm(searchInput.trim())
  }

  const groupStart = Math.floor((page - 1) / PAGE_GROUP_SIZE) * PAGE_GROUP_SIZE + 1
  const visiblePages = Array.from(
    { length: Math.min(PAGE_GROUP_SIZE, totalPages - groupStart + 1) },
    (_, index) => groupStart + index,
  )

  const kpiCards = [
    { label: '좋아요', value: kpis.likedPosts, caption: '내가 좋아요 한 게시글' },
    { label: '비밀글', value: kpis.secretPosts, caption: '내가 작성한 비밀글' },
    { label: '게시글', value: kpis.posts, caption: '내가 작성한 전체 글' },
    { label: '이번 달에 작성한 글', value: kpis.monthlyPosts, caption: '이번 달 작성한 게시글' },
  ]

  return (
    <main className="my-page">
      <section className="my-kpi-section" aria-label="내 활동 요약">
        <div className="my-kpi-grid">
          {kpiCards.map((card) => (
            <article className="my-kpi-card" key={card.label}>
              <span>{card.label}</span>
              <div><strong>{kpiLoading ? '-' : card.value.toLocaleString('ko-KR')}</strong><b>건</b></div>
              <small>{card.caption}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="my-secret-section">
        <div className="my-secret-container">
          <div className="my-secret-heading">
            <div><p>MY PRIVATE POSTS</p><h1>나의 비밀글</h1></div>
            <span>총 {totalCount.toLocaleString('ko-KR')}건</span>
          </div>

          <form className="my-secret-search" onSubmit={submitSearch}>
            <label htmlFor="secret-title-search">제목으로 검색</label>
            <div>
              <input id="secret-title-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="검색할 제목을 입력하세요" />
              <button type="submit">검색</button>
            </div>
          </form>

          {error && <p className="board-error" role="alert">{error}</p>}
          <div className="my-secret-table">
            <div className="my-secret-row my-secret-head"><span>번호</span><span>제목</span><span>조회수</span><span>좋아요</span><span>작성일</span></div>
            {listLoading ? (
              <div className="my-secret-empty">비밀글을 불러오는 중...</div>
            ) : secretPosts.length === 0 ? (
              <div className="my-secret-empty">조건에 맞는 비밀글이 없습니다.</div>
            ) : secretPosts.map((post, index) => (
              <div className="my-secret-row" key={post.id}>
                <span>{totalCount - (page - 1) * PAGE_SIZE - index}</span>
                <span className="my-secret-title">🔒 {post.title}</span>
                <span>{post.view_count.toLocaleString('ko-KR')}</span>
                <span>{post.like_count.toLocaleString('ko-KR')}</span>
                <span>{new Date(post.created_at).toLocaleDateString('ko-KR')}</span>
              </div>
            ))}
          </div>

          <nav className="my-pagination" aria-label="나의 비밀글 페이지">
            <button type="button" onClick={() => setPage(1)} disabled={page === 1} aria-label="첫 페이지">&lt;&lt;</button>
            {visiblePages.map((item) => (
              <button type="button" key={item} className={item === page ? 'active' : ''} onClick={() => setPage(item)} aria-current={item === page ? 'page' : undefined}>{item}</button>
            ))}
            <button type="button" onClick={() => setPage(totalPages)} disabled={page === totalPages} aria-label="마지막 페이지">&gt;&gt;</button>
          </nav>
        </div>
      </section>
    </main>
  )
}
