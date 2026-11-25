import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en, { type TranslationDictionary } from './locales/en';
import hi from './locales/hi';
import mr from './locales/mr';
import ta from './locales/ta';
import ml from './locales/ml';

export const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];
const STORAGE_KEY = "meraki.lang.v1";
const LOCALE_TAGS: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN", ta: "ta-IN", ml: "ml-IN" };

export function normalizeLang(value: unknown): Lang {
  return typeof value === "string" && LANGUAGES.some((locale) => locale.code === value) ? value as Lang : "en";
}

export interface I18nStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readStoredLanguage(storage: I18nStorage): Lang {
  try {
    const stored = storage.getItem(STORAGE_KEY);
    const supported = normalizeLang(stored);
    if (stored && stored !== supported) storage.setItem(STORAGE_KEY, supported);
    return supported;
  } catch { return "en"; }
}

export function formatNumber(value: number, lang: Lang, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(LOCALE_TAGS[lang], { ...options, numberingSystem: "latn" }).format(value);
}

export function formatDate(value: Date | string | number, lang: Lang, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { timeZone: "Asia/Kolkata", ...(options ?? { day: "numeric", month: "short", year: "numeric" }), numberingSystem: "latn" }).format(date);
}

export function formatINR(value: number, lang: Lang, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(LOCALE_TAGS[lang], { style: "currency", currency: "INR", maximumFractionDigits: 0, ...options, numberingSystem: "latn" }).format(value);
}

export function interpolateTranslation(template: string, vars: Record<string, string | number> = {}, lang: Lang = "en"): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) result = result.split(`{${key}}`).join(typeof value === "number" ? formatNumber(value, lang) : String(value));
  return result;
}


export const translations: Record<Lang, TranslationDictionary> = { en, hi, mr, ta, ml };
export type TKey = keyof TranslationDictionary;
const CROP_LABEL_KEYS: Record<string, TKey> = {
  okra: "crop_name_okra", tomato: "crop_name_tomato", "green chilli": "crop_name_green_chilli",
  "baby corn": "crop_name_baby_corn", "bitter gourd": "crop_name_bitter_gourd", drumstick: "crop_name_drumstick",
  onion: "crop_name_onion", "red onion": "crop_name_red_onion", mango: "crop_name_mango",
};

const SOIL_LABEL_KEYS: Record<string, TKey> = {
  "black soil": "soil_label_black", loamy: "soil_label_loamy", "sandy loam": "soil_label_sandy_loam",
  "red soil": "soil_label_red", clay: "soil_label_clay", laterite: "soil_label_laterite",
};

export function soilLabel(name: string, translate: (key: TKey) => string): string {
  const key = SOIL_LABEL_KEYS[name.trim().toLowerCase()];
  return key ? translate(key) : name;
}

export function cropLabel(name: string, translate: (key: TKey) => string): string {
  const key = CROP_LABEL_KEYS[name.trim().toLowerCase()];
  return key ? translate(key) : name;
}

const STATUS_KEYS: Record<string, TKey> = {
  active: "status_active", draft: "status_draft", open: "status_open", pending: "status_pending", completed: "status_completed",
  awaiting_inspection: "status_awaiting_inspection", in_transit: "status_in_transit",
  confirmed: "status_confirmed", provisional: "status_provisional", cancelled: "status_cancelled",
  expired: "status_expired", awarded: "status_awarded", delivered: "status_delivered", received: "status_received",
  rejected: "status_rejected", held: "status_held", hold: "status_hold", paid: "status_paid",
  unverified: "status_unverified", submitted: "status_submitted", accepted: "status_accepted",
  released: "status_released", resolved: "status_resolved", defaulted: "status_defaulted",
  no_sale: "status_no_sale", part_paid: "status_part_paid",
};

export function statusTranslationKey(value: string): TKey | undefined {
  return STATUS_KEYS[value.trim().toLowerCase().replace(/[ -]+/g, "_")];
}

export const TRANSLATION_EXCEPTIONS = new Set<TKey>([
  "app_name", "fpo", "auth_fpo", "pf_area_placeholder",
]);

export function getTranslationCoverage(lang: Exclude<Lang, "en">) {
  const dictionary = translations[lang] as Record<TKey, string>;
  const untranslated = (Object.keys(en) as TKey[]).filter((key) => dictionary[key] === en[key] && !TRANSLATION_EXCEPTIONS.has(key));
  return { translated: Object.keys(en).length - untranslated.length, total: Object.keys(en).length, untranslated };
}

type I18nCtx = { lang: Lang; setLang: (l: Lang) => void; t: (key: TKey, vars?: Record<string, string | number>) => string };
const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return readStoredLanguage(localStorage); } catch { return "en"; }
  });
  const setLang = (value: Lang) => {
    const supported = normalizeLang(value);
    setLangState(supported);
    try { localStorage.setItem(STORAGE_KEY, supported); } catch { /* storage may be unavailable */ }
  };
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo<I18nCtx>(() => ({
    lang, setLang,
    t: (key, vars) => {
      const dict = translations[lang] as Record<string, string>;
      return interpolateTranslation(dict[key] ?? (translations.en as Record<string, string>)[key] ?? key, vars, lang);
    },
  }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n requires I18nProvider");
  return v;
}

