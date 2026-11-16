import { useEffect } from 'react'
import { useI18n } from './index'

declare global { interface Window { google?: any; googleTranslateElementInit?: () => void } }

const SRC = 'en'
function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value};path=/`
  document.cookie = `${name}=${value};path=/;domain=${location.hostname}`
}

function applyLang(lang: string) {
  const target = lang === 'en' ? '' : `/${SRC}/${lang}`
  setCookie('googtrans', target || `/${SRC}/${SRC}`)
  // try combo
  const combo = document.querySelector<HTMLSelectElement>('select.goog-te-combo')
  if (combo) {
    combo.value = lang
    combo.dispatchEvent(new Event('change'))
  }
  // ensure top offset reset
  document.body.style.top = '0px'
}

export default function GoogleTranslate() {
  const { lang } = useI18n()

  useEffect(() => {
    if (document.getElementById('google-translate-script')) return
    window.googleTranslateElementInit = () => {
      try {
        new window.google.translate.TranslateElement({ pageLanguage: SRC, includedLanguages: 'en,ta,hi,ml,zh-CN,ms', autoDisplay: false }, 'google_translate_element')
      } catch {}
      setTimeout(() => applyLang((localStorage.getItem('meraki.lang.v1') as any) || 'en'), 300)
    }
    const s = document.createElement('script')
    s.id = 'google-translate-script'
    s.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
    s.async = true
    document.body.appendChild(s)
  }, [])

  useEffect(() => {
    document.documentElement.lang = SRC
    applyLang(lang === 'zh' ? 'zh-CN' : lang)
  }, [lang])

  return <div id="google_translate_element" style={{ display: 'none' }} aria-hidden="true" />
}
