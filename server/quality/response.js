// Normalize response text without any native Sub2API dependency.
export function extractResponse(payload) {
  const text =
    typeof payload?.output_text === 'string'
      ? payload.output_text
      : Array.isArray(payload?.output)
        ? payload.output
            .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
            .filter((item) => item?.type === 'output_text' && typeof item.text === 'string')
            .map((item) => item.text)
            .join('')
        : Array.isArray(payload?.content)
          ? payload.content
              .filter((item) => item?.type === 'text' && typeof item.text === 'string')
              .map((item) => item.text)
              .join('')
          : typeof payload?.choices?.[0]?.message?.content === 'string'
            ? payload.choices[0].message.content
            : Array.isArray(payload?.choices?.[0]?.message?.content)
              ? payload.choices[0].message.content.map((item) => item?.text || '').join('')
              : ''
  const finish = payload?.choices?.[0]?.finish_reason || payload?.stop_reason
  const incomplete =
    ['length', 'max_tokens', 'content_filter'].includes(finish) ||
    ['incomplete', 'failed', 'cancelled', 'in_progress', 'queued'].includes(payload?.status) ||
    Boolean(payload?.error)
  return { text, incomplete }
}
