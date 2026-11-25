import type { Allocation, CropPlan } from './engine'
import { fmtDay, toDate } from './format'

export type Channel = 'WhatsApp' | 'SMS'
export type Language = 'English' | 'Hindi' | 'Marathi' | 'Tamil' | 'Malayalam'
export const languages: { id: Language; label: string }[] = [
  { id: 'English', label: 'English' },
  { id: 'Hindi', label: 'हिन्दी' },
  { id: 'Marathi', label: 'मराठी' },
  { id: 'Tamil', label: 'தமிழ்' },
  { id: 'Malayalam', label: 'മലയാളം' },
]
export const FPO_NAME = 'Shivganga FPO'

export function resolveMessageLanguage(preferred: string): { language: Language; needsCoordinatorConfirmation: boolean } {
  const value = preferred.trim().toLocaleLowerCase()
  if (value === 'marathi' || value === 'mr' || value === 'मराठी') return { language: 'Marathi', needsCoordinatorConfirmation: false }
  if (value === 'hindi' || value === 'hi' || value === 'हिन्दी' || value === 'हिंदी') return { language: 'Hindi', needsCoordinatorConfirmation: false }
  if (value === 'tamil' || value === 'ta' || value === 'தமிழ்' || value === 'தமிழ') return { language: 'Tamil', needsCoordinatorConfirmation: false }
  if (value === 'malayalam' || value === 'ml' || value === 'മലയാളം') return { language: 'Malayalam', needsCoordinatorConfirmation: false }
  if (!value || value === 'english' || value === 'en') return { language: 'English', needsCoordinatorConfirmation: false }
  // Keep the stored preference intact and make the English-template fallback visible to the coordinator.
  return { language: 'English', needsCoordinatorConfirmation: true }
}

export const languageFor = (preferred: string): Language => resolveMessageLanguage(preferred).language

const cropNames: Record<string, Partial<Record<Language, string>>> = {
  Okra: { Hindi: 'भिंडी', Marathi: 'भेंडी', Tamil: 'வெண்டைக்காய்', Malayalam: 'വെണ്ടയ്ക്ക' },
  'Green chilli': { Hindi: 'हरी मिर्च', Marathi: 'हिरवी मिरची', Tamil: 'பச்சை மிளகாய்', Malayalam: 'പച്ചമുളക്' },
  Drumstick: { Hindi: 'सहजन', Marathi: 'शेवगा', Tamil: 'முருங்கைக்காய்', Malayalam: 'മുരിങ്ങക്കായ്' },
  'Baby corn': { Hindi: 'बेबी कॉर्न', Marathi: 'बेबी कॉर्न', Tamil: 'பேபி கார்ன்', Malayalam: 'ബേബി കോൺ' },
  'Bitter gourd': { Hindi: 'करेला', Marathi: 'कारले', Tamil: 'பாகற்காய்', Malayalam: 'പാവയ്ക്ക' },
  Tomato: { Hindi: 'टमाटर', Marathi: 'टोमॅटो', Tamil: 'தக்காளி', Malayalam: 'തക്കാളി' },
  Onion: { Hindi: 'प्याज', Marathi: 'कांदा', Tamil: 'வெங்காயம்', Malayalam: 'ഉള്ളി' },
  Mango: { Hindi: 'आम', Marathi: 'आंबा', Tamil: 'மாம்பழம்', Malayalam: 'മാങ്ങ' },
}

const numDate = (iso: string) => { const d = toDate(iso); return `${d.getUTCDate()}/${d.getUTCMonth() + 1}` }
const acres = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 })

const L = {
  English: { hi: (n: string) => `Namaskar ${n}! 👋`, intro: (crops: string, upd: boolean) => `${upd ? 'UPDATED plan: ' : ''}Proposal only: consider ${crops} for the ${FPO_NAME} plan. Confirm your choice and buyer demand before planting.`, area: 'Area', acre: 'acre', window: 'Planting window', seed: 'Seed', rec: '(recommended)', harvest: 'Harvest from', reply: 'Reply with:', r1: '1 – Confirm', r2: '2 – Cannot plant this season', r3: '3 – Any issue / need support (land, water, timing)', and: ' and ' },
  Hindi: { hi: (n: string) => `नमस्ते ${n} जी! 👋`, intro: (crops: string, upd: boolean) => `${upd ? 'योजना में बदलाव: ' : ''}यह ${FPO_NAME} की योजना में ${crops} के लिए केवल एक प्रस्ताव है। बुवाई से पहले किसान और खरीदार की पुष्टि ज़रूरी है।`, area: 'क्षेत्र', acre: 'एकड़', window: 'बुवाई का समय', seed: 'बीज', rec: '(सुझाया गया)', harvest: 'तुड़ाई', reply: 'जवाब दें:', r1: '1 – हाँ, लगाऊँगा/लगाऊँगी', r2: '2 – इस सीज़न नहीं', r3: '3 – कोई समस्या (ज़मीन / पानी / समय)', and: ' और ' },
  Marathi: { hi: (n: string) => `नमस्कार ${n}! 👋`, intro: (crops: string, upd: boolean) => `${upd ? 'नियोजनात बदल: ' : ''}${FPO_NAME} च्या नियोजनातील ${crops} साठी हा फक्त प्रस्ताव आहे. लागवडीपूर्वी शेतकरी आणि खरेदीदाराची पुष्टी आवश्यक आहे.`, area: 'क्षेत्र', acre: 'एकर', window: 'लागवडीचा काळ', seed: 'बियाणे', rec: '(शिफारस)', harvest: 'काढणी', reply: 'उत्तर द्या:', r1: '1 – होय, लागवड करेन', r2: '2 – या हंगामात नाही', r3: '3 – अडचण (जमीन / पाणी / वेळ)', and: ' आणि ' },
  Tamil: { hi: (n: string) => `வணக்கம் ${n}! 👋`, intro: (crops: string, upd: boolean) => `${upd ? 'திருத்தப்பட்ட திட்டம்: ' : ''}${FPO_NAME} திட்டத்தில் ${crops} பயிரிடுவது ஒரு முன்மொழிவு மட்டுமே. நடவு செய்வதற்கு முன் உங்கள் ஒப்புதலையும் வாங்குநரின் உறுதியான தேவையையும் உறுதிசெய்யவும்.`, area: 'பரப்பு', acre: 'ஏக்கர்', window: 'விதைப்பு காலம்', seed: 'விதை', rec: '(பரிந்துரை)', harvest: 'அறுவடை தொடக்கம்', reply: 'பதிலளிக்கவும்:', r1: '1 – உறுதிசெய்', r2: '2 – இந்தப் பருவத்தில் பயிரிட முடியாது', r3: '3 – சிக்கல் / உதவி தேவை (நிலம், நீர், காலம்)', and: ' மற்றும் ' },
  Malayalam: { hi: (n: string) => `നമസ്കാരം ${n}! 👋`, intro: (crops: string, upd: boolean) => `${upd ? 'പുതുക്കിയ പദ്ധതി: ' : ''}${FPO_NAME} പദ്ധതിയിലെ ${crops} കൃഷി ചെയ്യാനുള്ള ഒരു നിർദ്ദേശം മാത്രമാണിത്. നടുന്നതിന് മുമ്പ് നിങ്ങളുടെ സമ്മതവും വാങ്ങുന്നയാളുടെ ഉറപ്പുള്ള ആവശ്യവും സ്ഥിരീകരിക്കുക.`, area: 'വിസ്തീർണം', acre: 'ഏക്കർ', window: 'വിതയ്ക്കൽ സമയം', seed: 'വിത്ത്', rec: '(ശുപാർശ)', harvest: 'വിളവെടുപ്പ് ആരംഭം', reply: 'മറുപടി നൽകുക:', r1: '1 – സ്ഥിരീകരിക്കുന്നു', r2: '2 – ഈ സീസണിൽ കൃഷി ചെയ്യാനാകില്ല', r3: '3 – പ്രശ്നം / സഹായം വേണം (ഭൂമി, വെള്ളം, സമയം)', and: ' കൂടാതെ ' },
} satisfies Record<Language, { hi: (name: string) => string; intro: (crops: string, updated: boolean) => string; area: string; acre: string; window: string; seed: string; rec: string; harvest: string; reply: string; r1: string; r2: string; r3: string; and: string }>

export function composeInstruction(firstName: string, allocations: Allocation[], _plans: CropPlan[], language: Language, channel: Channel, isUpdate: boolean): string {
  const t = L[language]
  const rich = channel === 'WhatsApp'
  const tick = rich ? '✅ ' : '- '
  const date = (iso: string) => (language === 'English' ? fmtDay(iso) : numDate(iso))
  const cropName = (c: string) => (language === 'English' ? c : cropNames[c]?.[language] ?? c)
  const names = [...new Set(allocations.map((a) => cropName(a.crop)))].join(t.and)
  const blocks = allocations.map((a) => {
    // Dates and variety come from the specific buyer order this area is planted for.
    const plan = { sowFrom: a.sowFrom, sowBy: a.sowBy, harvestStart: a.harvestStart }
    const variety = a.variety
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

export function simulatedReplyText(kind: 'confirmed' | 'declined' | 'land' | 'water' | 'timing' | 'other', language: Language): string {
  if (kind === 'confirmed') return '1'
  if (kind === 'declined') return '2'
  const phrases: Record<Exclude<typeof kind, 'confirmed' | 'declined'>, Record<Language, string>> = {
    land: { English: '3 – less land available', Hindi: '3 – कम ज़मीन उपलब्ध है', Marathi: '3 – जमीन कमी उपलब्ध आहे', Tamil: '3 – குறைந்த நிலமே உள்ளது', Malayalam: '3 – ഭൂമി കുറവാണ്' },
    water: { English: '3 – water problem', Hindi: '3 – पानी की समस्या', Marathi: '3 – पाण्याची अडचण', Tamil: '3 – நீர் பிரச்சினை', Malayalam: '3 – വെള്ളത്തിന്റെ പ്രശ്നം' },
    timing: { English: '3 – cannot sow in time', Hindi: '3 – समय पर बुवाई नहीं कर सकते', Marathi: '3 – वेळेत पेरणी शक्य नाही', Tamil: '3 – சரியான நேரத்தில் விதைக்க முடியாது', Malayalam: '3 – സമയത്ത് വിതയ്ക്കാനാകില്ല' },
    other: { English: '3 – other problem', Hindi: '3 – दूसरी समस्या', Marathi: '3 – इतर अडचण', Tamil: '3 – வேறு சிக்கல்', Malayalam: '3 – മറ്റൊരു പ്രശ്നം' },
  }
  return phrases[kind][language]
}

/** SMS segment count: 160 chars (GSM-7) or 70 chars for Unicode scripts. */
export function smsSegments(text: string) {
  const unicode = /[^\u0000-\u007f]/.test(text)
  const per = unicode ? 70 : 160
  return { unicode, chars: text.length, segments: Math.max(1, Math.ceil(text.length / per)) }
}
