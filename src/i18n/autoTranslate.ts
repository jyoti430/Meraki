const cache = new Map<string, string>()
const memKey = (lang: string, text: string) => `${lang}\u0000${text}`
function chunk<T>(arr: T[], n: number) { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }
function shouldTranslate(text: string) {
  const s = text.trim()
  if (!s || s.length > 400) return false
  if (/^https?:\/\//i.test(s)) return false
  if (!/[A-Za-z]{2,}/.test(s)) return false
  if (/^[\d\s.,:%/+\-()°₹]+$/.test(s)) return false
  return true
}
async function translateOne(text: string, lang: string): Promise<string> {
  const k = memKey(lang, text)
  if (cache.has(k)) return cache.get(k)!
  const q = encodeURIComponent(text)
  // MyMemory (CORS-friendly, no key)
  try {
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${q}&langpair=en|${encodeURIComponent(lang)}`)
    if (r.ok) {
      const d = await r.json()
      const tr = d?.responseData?.translatedText
      if (typeof tr === 'string' && tr && !/QUERY LENGTH LIMIT/i.test(tr)) { cache.set(k, tr); return tr }
    }
  } catch {}
  // Google unofficial fallback
  try {
    const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(lang)}&dt=t&q=${q}`)
    if (r.ok) {
      const d = await r.json()
      const tr = (d?.[0] || []).map((s: any) => s?.[0] || '').join('')
      if (tr) { cache.set(k, tr); return tr }
    }
  } catch {}
  cache.set(k, text)
  return text
}
export async function translateTexts(texts: string[], lang: string): Promise<string[]> {
  if (lang === 'en') return texts
  const out = texts.slice()
  const missing: { i: number; text: string }[] = []
  texts.forEach((text, i) => {
    if (!shouldTranslate(text)) return
    const k = memKey(lang, text)
    if (cache.has(k)) out[i] = cache.get(k)!
    else missing.push({ i, text })
  })
  for (const group of chunk(missing, 10)) {
    const trs = await Promise.all(group.map(g => translateOne(g.text, lang)))
    group.forEach((g, idx) => { out[g.i] = trs[idx] })
  }
  return out
}
export async function translateDeep<T>(value: T, lang: string): Promise<T> {
  if (lang === 'en' || value == null) return value
  const strings: string[] = []
  const paths: (string | number)[][] = []
  const walk = (v: any, path: (string | number)[]) => {
    if (typeof v === 'string') { if (shouldTranslate(v)) { strings.push(v); paths.push(path) } return }
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, path.concat(i))); return }
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) walk(v[k], path.concat(k)) }
  }
  walk(value, [])
  if (!strings.length) return value
  const translated = await translateTexts(strings, lang)
  const clone = structuredClone(value as any)
  translated.forEach((t, i) => { let cur = clone; const p = paths[i]; for (let j = 0; j < p.length - 1; j++) cur = cur[p[j]]; cur[p[p.length - 1]] = t })
  return clone
}
