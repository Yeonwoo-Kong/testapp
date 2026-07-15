const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MODEL = 'gemini-3.1-flash-lite'
const MAX_FILE_SIZE = 10 * 1024 * 1024

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!request.headers.get('Authorization')) {
      return Response.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: corsHeaders })
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      return Response.json({ error: '서버에 Gemini API 키가 설정되지 않았습니다.' }, { status: 500, headers: corsHeaders })
    }

    const form = await request.formData()
    const question = form.get('question')?.toString().trim()
    const uploaded = form.get('file')

    if (!question) {
      return Response.json({ error: '질문을 입력해 주세요.' }, { status: 400, headers: corsHeaders })
    }

    const parts: Array<Record<string, unknown>> = [{ text: question }]

    if (uploaded instanceof File && uploaded.size > 0) {
      if (uploaded.size > MAX_FILE_SIZE) {
        return Response.json({ error: '첨부 파일은 10MB 이하만 사용할 수 있습니다.' }, { status: 413, headers: corsHeaders })
      }
      parts.push({
        inlineData: {
          mimeType: uploaded.type || 'application/octet-stream',
          data: bytesToBase64(new Uint8Array(await uploaded.arrayBuffer())),
        },
      })
    }

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            thinkingConfig: { thinkingLevel: 'minimal' },
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
      },
    )

    const result = await geminiResponse.json()
    if (!geminiResponse.ok) {
      console.error('Gemini API error', result)
      return Response.json(
        { error: result?.error?.message ?? 'Gemini API 요청에 실패했습니다.' },
        { status: geminiResponse.status, headers: corsHeaders },
      )
    }

    const answer = result.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? '')
      .join('')
      .trim()

    if (!answer) {
      return Response.json({ error: 'Gemini가 답변을 생성하지 못했습니다.' }, { status: 502, headers: corsHeaders })
    }

    return Response.json({ answer }, { headers: corsHeaders })
  } catch (error) {
    console.error(error)
    return Response.json(
      { error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' },
      { status: 500, headers: corsHeaders },
    )
  }
})
