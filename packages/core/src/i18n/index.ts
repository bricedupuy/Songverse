import en from "./locales/en.js";
import fr from "./locales/fr.js";

export const i18nResources = {
  en: { translation: en },
  fr: { translation: fr },
} as const;

export * from "./translate.js";
export * from "./accept-language.js";
