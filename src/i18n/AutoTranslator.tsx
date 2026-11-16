import { useEffect, useRef } from 'react'
import { translateTexts } from './autoTranslate'
import { useI18n } from './index'

const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','TEXTAREA'])
const ORIGINAL = new WeakMap<Text, string>()

function collectTextNodes(root: Node): Text[] {
  const nodes: Text[] = []
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const p = node.parentElement
      if (!p) return NodeFilter.FILTER_REJECT
      if (SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT
      if (p.closest('[data-no-translate]')) return NodeFilter.FILTER_REJECT
      const v = node.nodeValue || ''
      if (!v.trim()) return NodeFilter.FILTER_REJECT
      if (!/[A-Za-z]{2,}/.test(v)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  } as any)
  let n: Node | null
  while ((n = w.nextNode())) nodes.push(n as Text)
  return nodes
}

export default function AutoTranslator() {
  const { lang } = useI18n()
  const busy = useRef(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const id = ++busy.current
      const root = document.getElementById('root') || document.body
      const nodes = collectTextNodes(root)
      // ensure originals stored
      nodes.forEach(n => { if (!ORIGINAL.has(n)) ORIGINAL.set(n, n.nodeValue || '') })
      if (lang === 'en') {
        nodes.forEach(n => { const o = ORIGINAL.get(n); if (o != null && n.nodeValue !== o) n.nodeValue = o })
        return
      }
      const originals = nodes.map(n => ORIGINAL.get(n) || n.nodeValue || '')
      const translated = await translateTexts(originals, lang)
      if (cancelled || id !== busy.current) return
      nodes.forEach((n, i) => {
        if (translated[i] && n.isConnected) n.nodeValue = translated[i]
      })
    }
    const timer = setTimeout(run, 50)
    const obs = new MutationObserver(() => { clearTimeout((obs as any)._t); (obs as any)._t = setTimeout(run, 300) })
    obs.observe(document.getElementById('root') || document.body, { childList: true, subtree: true, characterData: true })
    return () => { cancelled = true; clearTimeout(timer); clearTimeout((obs as any)._t); obs.disconnect() }
  }, [lang])

  return null
}
