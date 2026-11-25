import { LANGUAGES, useI18n } from './index'

export default function LanguageSelector({ className = 'm-lang' }: { className?: string }) {
  const { t, lang, setLang } = useI18n()
  return <label className={className}>
    <span>{t('language')}</span>
    <select aria-label={t('language')} value={lang} onChange={(event) => setLang(event.target.value as typeof lang)}>
      {LANGUAGES.map(({ code, native }) => <option key={code} value={code}>{native}</option>)}
    </select>
  </label>
}
