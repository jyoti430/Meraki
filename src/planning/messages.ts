import type { Allocation, CropPlan } from './engine'
import { SEASON_LABEL } from './engine'
import { fmtDay, toDate } from './format'

export type Channel = 'WhatsApp' | 'SMS'
export type Language = 'English' | 'Hindi' | 'Marathi'
export const languages: { id: Language; label: string }[] = [
  { id: 'English', label: 'English' },
  { id: 'Hindi', label: 'हिन्दी' },
  { id: 'Marathi', label: 'मराठी' },
]
export const FPO_NAME = 'Nirmal Kisan FPO'

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

export function composeInstruction(firstName: string, allocations: Allocation[], plans: CropPlan[], language: Language, channel: Channel, isUpdate: boolean): string {
  const rich = channel === 'WhatsApp'
  const lines = allocations.map((a) => {
    const plan = plans.find((p) => p.crop.name === a.crop)!
    const variety = plan.varieties[0] ?? plan.crop.defaultVariety
    if (language === 'Hindi') return `${rich ? '• ' : '- '}${cropNames[a.crop]?.Hindi ?? a.crop} (${variety}), ${a.plotName}: ${acres(a.acres)} एकड़। बुवाई ${numDate(plan.sowFrom)} से ${numDate(plan.sowBy)} के बीच। तुड़ाई ${numDate(plan.harvestStart)} से।`
    if (language === 'Marathi') return `${rich ? '• ' : '- '}${cropNames[a.crop]?.Marathi ?? a.crop} (${variety}), ${a.plotName}: ${acres(a.acres)} एकर. लागवड ${numDate(plan.sowFrom)} ते ${numDate(plan.sowBy)} दरम्यान. काढणी ${numDate(plan.harvestStart)} पासून.`
    return `${rich ? '• ' : '- '}${a.crop} (${variety}) on ${a.plotName}: ${acres(a.acres)} acre. Sow between ${fmtDay(plan.sowFrom)} and ${fmtDay(plan.sowBy)}. Harvest from ${fmtDay(plan.harvestStart)}.`
  })
  if (language === 'Hindi') return [
    `${rich ? '🌱 ' : ''}नमस्ते ${firstName} जी,`,
    `${FPO_NAME} – ${SEASON_LABEL} ${isUpdate ? 'बुवाई योजना में बदलाव' : 'बुवाई योजना'}:`,
    ...lines,
    'खरीदार की माँग FPO के माध्यम से है। बीज व सलाह के लिए FPO कार्यालय से संपर्क करें।',
    'जवाब दें: 1 = हाँ, बुवाई करूँगा/करूँगी · 2 = इस सीज़न नहीं · 3 = समस्या (ज़मीन / पानी / समय)',
  ].join('\n')
  if (language === 'Marathi') return [
    `${rich ? '🌱 ' : ''}नमस्कार ${firstName},`,
    `${FPO_NAME} – ${SEASON_LABEL} ${isUpdate ? 'लागवड नियोजनात बदल' : 'लागवड नियोजन'}:`,
    ...lines,
    'खरेदीदाराची मागणी FPO मार्फत आहे. बियाणे व सल्ल्यासाठी FPO कार्यालयाशी संपर्क साधा.',
    'उत्तर द्या: 1 = होय, लागवड करेन · 2 = या हंगामात नाही · 3 = अडचण (जमीन / पाणी / वेळ)',
  ].join('\n')
  return [
    `${rich ? '🌱 ' : ''}Namaste ${firstName},`,
    `${FPO_NAME} – ${SEASON_LABEL} ${isUpdate ? 'UPDATED planting plan' : 'planting plan'}:`,
    ...lines,
    'Buyer demand is arranged through the FPO. Contact the FPO office for seed and advice.',
    'Reply: 1 = Yes, I will plant · 2 = Not this season · 3 = Problem (land / water / timing)',
  ].join('\n')
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
