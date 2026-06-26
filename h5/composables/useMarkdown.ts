/**
 * Minimal, dependency-free Markdown → HTML renderer for agent replies.
 *
 * Security: HTML is escaped first, then only recognized markdown constructs are
 * re-introduced, so v-html of the output is safe for agent-generated text.
 * Supports: fenced code blocks, inline code, headings, bold, italic, links,
 * blockquotes, ordered/unordered lists, horizontal rules, and paragraphs.
 */

const SENTINEL = '@@MDCODE'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inlineMd(s: string): string {
  // Inline code is captured first so the other transforms leave it untouched.
  const codeStash: string[] = []
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codeStash.push(`<code class="md-code">${escapeHtml(c)}</code>`)
    return `${SENTINEL}${codeStash.length - 1}@@`
  })

  // Links [text](url) — url must be http(s)/mailto to avoid javascript: schemes.
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_, t, u) => {
    return `<a href="${u}" target="_blank" rel="noopener noreferrer">${escapeHtml(t)}</a>`
  })

  // Bold then italic.
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>')

  // Restore stashed inline code.
  s = s.replace(new RegExp(`${SENTINEL}(\\d+)@@`, 'g'), (_, i) => codeStash[Number(i)] ?? '')
  return s
}

export function renderMarkdown(src: string): string {
  if (!src) return ''
  const text = src.replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  const out: string[] = []

  let inCode = false
  let codeLang = ''
  let codeBuf: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let para: string[] = []

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inlineMd(escapeHtml(para.join(' ')))}</p>`)
      para = []
    }
  }
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`)
      listType = null
    }
  }

  for (const line of lines) {
    // Fenced code blocks.
    const fence = line.match(/^```(\w+)?\s*$/)
    if (fence) {
      if (!inCode) {
        flushPara()
        closeList()
        inCode = true
        codeLang = fence[1] || ''
        codeBuf = []
      } else {
        out.push(
          `<pre class="md-pre"><code${codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ''}>${escapeHtml(codeBuf.join('\n'))}</code></pre>`
        )
        inCode = false
      }
      continue
    }
    if (inCode) {
      codeBuf.push(line)
      continue
    }

    // Blank line → paragraph break.
    if (!line.trim()) {
      flushPara()
      closeList()
      continue
    }

    // Horizontal rule.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushPara()
      closeList()
      out.push('<hr class="md-hr" />')
      continue
    }

    // Heading.
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushPara()
      closeList()
      const level = h[1].length
      out.push(`<h${level} class="md-h md-h${level}">${inlineMd(escapeHtml(h[2]))}</h${level}>`)
      continue
    }

    // Blockquote.
    if (/^\s*>\s?/.test(line)) {
      flushPara()
      closeList()
      out.push(`<blockquote class="md-quote">${inlineMd(escapeHtml(line.replace(/^\s*>\s?/, '')))}</blockquote>`)
      continue
    }

    // Unordered list.
    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara()
      if (listType !== 'ul') {
        closeList()
        out.push('<ul class="md-ul">')
        listType = 'ul'
      }
      out.push(`<li>${inlineMd(escapeHtml(line.replace(/^\s*[-*+]\s+/, '')))}</li>`)
      continue
    }

    // Ordered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara()
      if (listType !== 'ol') {
        closeList()
        out.push('<ol class="md-ol">')
        listType = 'ol'
      }
      out.push(`<li>${inlineMd(escapeHtml(line.replace(/^\s*\d+\.\s+/, '')))}</li>`)
      continue
    }

    // Default: accumulate paragraph line.
    para.push(line)
  }

  flushPara()
  closeList()

  if (inCode && codeBuf.length) {
    out.push(`<pre class="md-pre"><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`)
  }

  return out.join('\n')
}

export function useMarkdown() {
  return { render: renderMarkdown }
}
