import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type BoardView = 'list' | 'write' | 'detail'
type SearchField = 'title' | 'author_name'

interface Post {
  id: number
  author_id: string
  author_name: string
  title: string
  content: string
  is_secret: boolean
  like_count: number
  view_count: number
  created_at: string
  updated_at: string
}

interface Attachment {
  id: string
  post_id: number
  storage_path: string
  original_name: string
  mime_type: string | null
  file_size: number
  url?: string
}

const PAGE_SIZE = 10
const PAGE_GROUP_SIZE = 5
const MAX_FILES = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', '7z', 'rar']

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function validateFiles(files: File[]) {
  if (files.length > MAX_FILES) return `첨부파일은 최대 ${MAX_FILES}개까지 가능합니다.`
  for (const file of files) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTENSIONS.includes(extension)) return `${file.name}: 허용되지 않는 파일 형식입니다.`
    if (file.size > MAX_FILE_SIZE) return `${file.name}: 파일 크기는 10MB 이하여야 합니다.`
  }
  return ''
}

async function uploadAttachments(postId: number, userId: string, files: File[]) {
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9가-힣._-]/g, '_')
    const path = `${userId}/${postId}/${crypto.randomUUID()}-${safeName}`
    const { error: uploadError } = await supabase.storage.from('board-files').upload(path, file)
    if (uploadError) throw uploadError
    const { error: rowError } = await supabase.from('post_attachments').insert({
      post_id: postId,
      storage_path: path,
      original_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
    })
    if (rowError) {
      await supabase.storage.from('board-files').remove([path])
      throw rowError
    }
  }
}

export default function BoardPage({ session }: { session: Session }) {
  const [view, setView] = useState<BoardView>('list')
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [searchField, setSearchField] = useState<SearchField>('title')
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [password, setPassword] = useState('')
  const [isSecret, setIsSecret] = useState(false)
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [attachmentsToRemove, setAttachmentsToRemove] = useState<Attachment[]>([])
  const [liked, setLiked] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const loadPosts = useCallback(async () => {
    setLoading(true)
    setError('')
    let query = supabase
      .from('posts')
      .select('id,author_id,author_name,title,content,is_secret,like_count,view_count,created_at,updated_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
    if (searchTerm) query = query.ilike(searchField, `%${searchTerm}%`)
    const { data, count, error: queryError } = await query
    if (queryError) setError(queryError.message)
    else {
      setPosts((data ?? []) as Post[])
      setTotalCount(count ?? 0)
    }
    setLoading(false)
  }, [page, searchField, searchTerm])

  useEffect(() => { void loadPosts() }, [loadPosts])

  const resetForm = () => {
    setTitle('')
    setContent('')
    setPassword('')
    setIsSecret(false)
    setNewFiles([])
    setAttachmentsToRemove([])
    setError('')
  }

  const openWrite = () => {
    resetForm()
    setView('write')
  }

  const openDetail = async (post: Post) => {
    setLoading(true)
    setError('')
    const { data: viewCount, error: viewError } = await supabase.rpc('record_post_view', { p_post_id: post.id })
    if (viewError) {
      setError(viewError.message)
      setLoading(false)
      return
    }
    const updatedPost = { ...post, view_count: viewCount as number }
    setSelectedPost(updatedPost)
    setView('detail')
    setEditing(false)
    setDeleteMode(false)

    const [{ data: files }, { data: like }] = await Promise.all([
      supabase.from('post_attachments').select('*').eq('post_id', post.id).order('created_at'),
      supabase.from('post_likes').select('post_id').eq('post_id', post.id).eq('user_id', session.user.id).maybeSingle(),
    ])
    const fileRows = (files ?? []) as Attachment[]
    const withUrls = await Promise.all(fileRows.map(async (item) => {
      const { data } = await supabase.storage.from('board-files').createSignedUrl(item.storage_path, 3600)
      return { ...item, url: data?.signedUrl }
    }))
    setAttachments(withUrls)
    setLiked(Boolean(like))
    setLoading(false)
  }

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    const combined = [...newFiles, ...files]
    const validationError = validateFiles(combined)
    if (validationError) setError(validationError)
    else {
      setNewFiles(combined)
      setError('')
    }
    event.target.value = ''
  }

  const createPost = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateFiles(newFiles)
    if (validationError) return setError(validationError)
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('create_post', {
      p_title: title, p_content: content, p_password: password, p_is_secret: isSecret,
    })
    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }
    try {
      await uploadAttachments(data as number, session.user.id, newFiles)
      setView('list')
      setPage(1)
      resetForm()
      await loadPosts()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '파일 업로드에 실패했습니다.')
    }
    setLoading(false)
  }

  const startEdit = () => {
    if (!selectedPost) return
    setTitle(selectedPost.title)
    setContent(selectedPost.content)
    setIsSecret(selectedPost.is_secret)
    setPassword('')
    setNewFiles([])
    setAttachmentsToRemove([])
    setEditing(true)
    setDeleteMode(false)
    setError('')
  }

  const updatePost = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedPost) return
    const validationError = validateFiles(newFiles)
    if (validationError) return setError(validationError)
    setLoading(true)
    const { error: rpcError } = await supabase.rpc('update_post', {
      p_post_id: selectedPost.id, p_title: title, p_content: content,
      p_password: password, p_is_secret: isSecret,
    })
    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }
    try {
      if (attachmentsToRemove.length) {
        const paths = attachmentsToRemove.map((item) => item.storage_path)
        const ids = attachmentsToRemove.map((item) => item.id)
        const { error: storageError } = await supabase.storage.from('board-files').remove(paths)
        if (storageError) throw storageError
        const { error: rowsError } = await supabase.from('post_attachments').delete().in('id', ids)
        if (rowsError) throw rowsError
      }
      await uploadAttachments(selectedPost.id, session.user.id, newFiles)
      const refreshed = { ...selectedPost, title, content, is_secret: isSecret, updated_at: new Date().toISOString() }
      setSelectedPost(refreshed)
      setEditing(false)
      setPassword('')
      setNewFiles([])
      setAttachmentsToRemove([])
      await openDetail(refreshed)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '파일 업로드에 실패했습니다.')
    }
    setLoading(false)
  }

  const removeAttachment = async (attachment: Attachment) => {
    if (!window.confirm(`${attachment.original_name} 파일을 삭제할까요?`)) return
    setAttachmentsToRemove((items) => [...items, attachment])
    setAttachments((items) => items.filter((item) => item.id !== attachment.id))
  }

  const deletePost = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedPost || !window.confirm('게시글을 삭제하면 복구할 수 없습니다. 삭제할까요?')) return
    setLoading(true)
    const pathsToDelete = attachments.map((item) => item.storage_path)
    const { error: rpcError } = await supabase.rpc('delete_post', { p_post_id: selectedPost.id, p_password: password })
    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }
    if (attachments.length) {
      const { error: storageError } = await supabase.storage.from('board-files').remove(pathsToDelete)
      if (storageError) {
        setError(storageError.message)
        setLoading(false)
        return
      }
    }
    setView('list')
    setSelectedPost(null)
    setPassword('')
    await loadPosts()
    setLoading(false)
  }

  const toggleLike = async () => {
    if (!selectedPost) return
    const nextLiked = !liked
    const query = nextLiked
      ? supabase.from('post_likes').insert({ post_id: selectedPost.id, user_id: session.user.id })
      : supabase.from('post_likes').delete().eq('post_id', selectedPost.id).eq('user_id', session.user.id)
    const { error: likeError } = await query
    if (likeError) return setError(likeError.message)
    setLiked(nextLiked)
    setSelectedPost({ ...selectedPost, like_count: Math.max(0, selectedPost.like_count + (nextLiked ? 1 : -1)) })
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    setPage(1)
    setSearchTerm(searchInput.trim())
  }

  if (view === 'write') {
    return (
      <main className="board-page"><div className="board-container">
        <button className="back-button" onClick={() => setView('list')}>← 목록으로</button>
        <div className="board-heading"><div><p>NEW POST</p><h1>새 글 작성</h1></div></div>
        <PostForm {...{ title, setTitle, content, setContent, password, setPassword, isSecret, setIsSecret, newFiles, setNewFiles, handleFiles, error, loading }} onSubmit={createPost} submitLabel="게시글 등록" />
      </div></main>
    )
  }

  if (view === 'detail' && selectedPost) {
    const isAuthor = selectedPost.author_id === session.user.id
    return (
      <main className="board-page"><div className="board-container">
        <button className="back-button" onClick={() => { setView('list'); setEditing(false); void loadPosts() }}>← 목록으로</button>
        {editing ? (
          <><div className="board-heading"><div><p>EDIT POST</p><h1>게시글 수정</h1></div></div>
          <PostForm {...{ title, setTitle, content, setContent, password, setPassword, isSecret, setIsSecret, newFiles, setNewFiles, handleFiles, error, loading }} onSubmit={updatePost} submitLabel="수정 완료" attachments={attachments} onRemoveAttachment={removeAttachment} onCancel={() => void openDetail(selectedPost)} /></>
        ) : (
          <article className="post-detail">
            <div className="detail-top">
              <div className="detail-badges">{selectedPost.is_secret && <span>🔒 비밀글</span>}</div>
              <h1>{selectedPost.title}</h1>
              <div className="post-meta"><span>{selectedPost.author_name}</span><span>{formatDate(selectedPost.created_at)}</span><span>조회수 {selectedPost.view_count.toLocaleString('ko-KR')}</span><span>좋아요 {selectedPost.like_count}</span></div>
            </div>
            <div className="post-content">{selectedPost.content}</div>
            {attachments.length > 0 && <div className="attachment-list"><h3>첨부파일</h3>{attachments.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer"><span>📎 {item.original_name}</span><small>{formatSize(item.file_size)}</small></a>)}</div>}
            {error && <p className="board-error">{error}</p>}
            <div className="detail-actions">
              <button className={`like-button ${liked ? 'liked' : ''}`} onClick={toggleLike}>{liked ? '♥' : '♡'} 좋아요 {selectedPost.like_count}</button>
              {isAuthor && <><button onClick={startEdit}>수정</button><button className="danger-button" onClick={() => { setDeleteMode(true); setEditing(false); setPassword('') }}>삭제</button></>}
            </div>
            {deleteMode && <form className="delete-box" onSubmit={deletePost}><label>게시글 비밀번호<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} required autoFocus /></label><p>삭제하려면 게시글 작성 시 설정한 비밀번호를 입력하세요.</p><div><button type="button" onClick={() => setDeleteMode(false)}>취소</button><button className="danger-button" type="submit" disabled={loading}>영구 삭제</button></div></form>}
          </article>
        )}
      </div></main>
    )
  }

  const groupStart = Math.floor((page - 1) / PAGE_GROUP_SIZE) * PAGE_GROUP_SIZE + 1
  const visiblePages = Array.from({ length: Math.min(PAGE_GROUP_SIZE, totalPages - groupStart + 1) }, (_, index) => groupStart + index)

  return (
    <main className="board-page"><div className="board-container">
      <div className="board-heading"><div><p>COMMUNITY</p><h1>게시판</h1><span>자유롭게 이야기를 나눠보세요.</span></div><button className="write-button" onClick={openWrite}>＋ 글쓰기</button></div>
      <form className="board-search" onSubmit={submitSearch}>
        <select value={searchField} onChange={(e) => setSearchField(e.target.value as SearchField)}><option value="title">제목</option><option value="author_name">작성자</option></select>
        <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="검색어를 입력하세요" />
        <button type="submit">검색</button>
      </form>
      {error && <p className="board-error">{error}</p>}
      <div className="post-table">
        <div className="post-row post-head"><span>번호</span><span>제목</span><span>작성자</span><span>조회수</span><span>좋아요</span><span>작성일</span></div>
        {loading ? <div className="board-empty">게시글을 불러오는 중...</div> : posts.length === 0 ? <div className="board-empty">등록된 게시글이 없습니다.</div> : posts.map((post) => (
          <button className="post-row" key={post.id} onClick={() => openDetail(post)}>
            <span>{post.id}</span><span className="post-title">{post.is_secret && '🔒 '}{post.title}</span><span>{post.author_name}</span><span>{post.view_count.toLocaleString('ko-KR')}</span><span>♡ {post.like_count}</span><span>{new Date(post.created_at).toLocaleDateString('ko-KR')}</span>
          </button>
        ))}
      </div>
      <div className="pagination"><button onClick={() => setPage(1)} disabled={page === 1}>&lt;&lt;</button>{visiblePages.map((item) => <button key={item} className={item === page ? 'active' : ''} onClick={() => setPage(item)}>{item}</button>)}<button onClick={() => setPage(totalPages)} disabled={page === totalPages}>&gt;&gt;</button></div>
    </div></main>
  )
}

interface PostFormProps {
  title: string; setTitle: (value: string) => void
  content: string; setContent: (value: string) => void
  password: string; setPassword: (value: string) => void
  isSecret: boolean; setIsSecret: (value: boolean) => void
  newFiles: File[]; setNewFiles: (files: File[]) => void
  handleFiles: (event: ChangeEvent<HTMLInputElement>) => void
  error: string; loading: boolean; submitLabel: string
  onSubmit: (event: FormEvent) => void
  attachments?: Attachment[]
  onRemoveAttachment?: (attachment: Attachment) => void
  onCancel?: () => void
}

function PostForm(props: PostFormProps) {
  return <form className="post-form" onSubmit={props.onSubmit}>
    <label>제목<input value={props.title} onChange={(e) => props.setTitle(e.target.value)} maxLength={200} required placeholder="제목을 입력하세요" /></label>
    <label>게시글 비밀번호<input type="password" value={props.password} onChange={(e) => props.setPassword(e.target.value)} minLength={4} required placeholder="수정·삭제 시 사용할 비밀번호 (4자 이상)" /></label>
    <label>내용<textarea value={props.content} onChange={(e) => props.setContent(e.target.value)} rows={14} required placeholder="내용을 입력하세요" /></label>
    <label className="secret-check"><input type="checkbox" checked={props.isSecret} onChange={(e) => props.setIsSecret(e.target.checked)} /> 비밀글로 작성</label>
    {props.attachments && props.attachments.length > 0 && <div className="edit-files"><strong>기존 첨부파일</strong>{props.attachments.map((item) => <div key={item.id}><span>📎 {item.original_name} ({formatSize(item.file_size)})</span><button type="button" onClick={() => props.onRemoveAttachment?.(item)}>삭제</button></div>)}</div>}
    <label className="file-picker">첨부파일 <span>이미지, PDF, 문서, 압축파일 · 파일당 10MB · 최대 5개</span><input type="file" multiple accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')} onChange={props.handleFiles} /></label>
    {props.newFiles.length > 0 && <div className="selected-files">{props.newFiles.map((file, index) => <div key={`${file.name}-${index}`}><span>{file.name} ({formatSize(file.size)})</span><button type="button" onClick={() => props.setNewFiles(props.newFiles.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>}
    {props.error && <p className="board-error">{props.error}</p>}
    <div className="form-actions">{props.onCancel && <button type="button" onClick={props.onCancel}>취소</button>}<button className="write-button" type="submit" disabled={props.loading}>{props.loading ? '처리 중...' : props.submitLabel}</button></div>
  </form>
}
