import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { DEFAULT_LOCALE, i18nResources, type LocaleValue } from "@songverse/core";

/**
 * Creates a fresh i18next instance for the given locale. Deliberately not a
 * module-level singleton: this app is server-rendered, and a shared
 * instance mutated per-request (via changeLanguage) would leak one
 * request's language into another's concurrent render. A new instance per
 * render is cheap since all resources are bundled, not fetched.
 */
export function createI18n(locale: LocaleValue): i18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources: i18nResources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}
