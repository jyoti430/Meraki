import type { Allocation, CropPlan } from './engine'
import { fmtDay, toDate } from './format'

export type Channel = 'WhatsApp' | 'SMS'
export type Language = 'English' | 'Hindi' | 'Marathi'
export const languages: { id: Language; label: string }[] = [
  { id: 'English', label: 'English' },
  { id: 'Hindi', label: 'हिन्दी' },
  { id: 'Marathi', label: 'मराठी' },
]
export const FPO_NAME = 'Shivganga FPO'

export const languageFor = (preferred: string): Language => (preferred === 'Marathi' ? 'Marathi' : preferred === 'Hindi' || preferred === 'Urdu' ? 'Hindi' : 'English')

const cropNames: Record<string, { Hindi: string; Marathi: string }> = {
  Okra: { Hindi: 'भिंडी', Marathi: 'भेंडी' },
  'Green chilli': { Hindi: 'हरी मिर्च', Marathi: 'हिरवी मिरची' },
  Drumstick: { Hindi: 'सहजन', Marathi: 'शेवगा' },
  'Baby corn': { Hindi: 'बेबी कॉर्न', Marathi: 'बेबी कॉर्न' },
  'Bitter gourd': { Hindi: 'करेला', Marathi: 'कारले' },
  Tomato: { Hindi: 'टमाटर', Marathi: 'टोमॅटो' },
  Onion: { Hindi: 'प्याज', Marathi: 'कांदा' },
  Mango: { Hindi: 'आम', Marathi: 'आंबा' },
}

const numDate = (iso: string) => { const d = toDate(iso); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}` }
const acres = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })

const L = {
  English: { hi: (n: string) => `Namaskar ${n}! 👋`, intro: (crops: string, upd: boolean) => `${upd ? 'UPDATED plan: ' : ''}This season, please plant ${crops} as per the ${FPO_NAME} plan.`, area: 'Area', acre: 'acre', window: 'Planting window', seed: 'Seed', rec: '(recommended)', harvest: 'Harvest from', reply: 'Reply with:', r1: '1 – Confirm', r2: '2 – Cannot plant this season', r3: '3 – Any issue / need support (land, water, timing)', and: ' and ' },
  Hindi: { hi: (n: string) => `नमस्ते ${n} जी! 👋`, intro: (crops: string, upd: boolean) => `${upd ? 'योजना में बदलाव: ' : ''}इस सीज़न ${FPO_NAME} की योजना के अनुसार ${crops} लगाएँ।`, area: 'क्षेत्र', acre: 'एकड़', window: 'बुवाई का समय', seed: 'बीज', rec: '(सुझाया गया)', harvest: 'तुड़ाई', reply: 'जवाब दें:', r1: '1 – हाँ, लगाऊँगा/लगाऊँगी', r2: '2 – इस सीज़न नहीं', r3: '3 – कोई समस्या (ज़मीन / पानी / समय)', and: ' और ' },
  Marathi: { hi: (n: string) => `नमस्कार ${n}! 👋`, intro: (crops: string, upd: boolean) => `${upd ? 'नियोजनात बदल: ' : ''}या हंगामात ${FPO_NAME} च्या नियोजनानुसार ${crops} लागवड करा.`, area: 'क्षेत्र', acre: 'एकर', window: 'लागवडीचा काळ', seed: 'बियाणे', rec: '(शिफारस)', harvest: 'काढणी', reply: 'उत्तर द्या:', r1: '1 – होय, लागवड करेन', r2: '2 – या हंगामात नाही', r3: '3 – अडचण (जमीन / पाणी / वेळ)', and: ' आणि ' },
}

export function composeInstruction(firstName: string, allocations: Allocation[], plans: CropPlan[], language: Language, channel: Channel, isUpdate: boolean): string {
  const t = L[language]
  const rich = channel === 'WhatsApp'
  const tick = rich ? '✅ ' : '- '
  const date = (iso: string) => (language === 'English' ? fmtDay(iso) : numDate(iso))
  const cropName = (c: string) => (language === 'English' ? c : cropNames[c]?.[language] ?? c)
  const names = [...new Set(allocations.map((a) => cropName(a.crop)))].join(t.and)
  const blocks = allocations.map((a) => {
    const plan = plans.find((p) => p.crop.name === a.crop)!
    const variety = plan.varieties[0] ?? plan.crop.defaultVariety
    return [
      allocations.length > 1 ? `${rich ? '🌱 ' : ''}${cropName(a.crop)} – ${a.plotName}` : '',
      `${tick}${t.area}: ${acres(a.acres)} ${t.acre}${allocations.length > 1 ? '' : ` (${a.plotName})`}`,
      `${tick}${t.window}: ${date(plan.sowFrom)} – ${date(plan.sowBy)}`,
      `${tick}${t.seed}: ${variety} ${t.rec}`,
      `${tick}${t.harvest}: ${date(plan.harvestStart)}`,
    ].filter(Boolean).join('\n')
  })
  return [`${rich ? t.hi(firstName) : t.hi(firstName).replace(' 👋', '')}`, t.intro(names, isUpdate), '', blocks.join('\n\n'), '', t.reply, t.r1, t.r2, t.r3].join('\n')
}

export const replyText: Record<'confirmed' | 'declined' | 'land' | 'water' | 'timing' | 'other', string> = {
  confirmed: '1',
  declined: '2',
  land: '3 – less land available',
  water: '3 – water problem',
  timing: '3 – cannot sow in time',
  other: '3 – other problem',
}

/** SMS segment count: 160 chars (GSM-7) or 70 chars (Unicode, e.g. Devanagari) per segment. */
export function smsSegments(text: string) {
  const unicode = /[^\u0000-\u007f]/.test(text)
  const per = unicode ? 70 : 160
  return { unicode, chars: text.length, segments: Math.max(1, Math.ceil(text.length / per)) }
}
