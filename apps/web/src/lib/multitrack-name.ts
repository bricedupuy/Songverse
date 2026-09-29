import { useTranslation } from "react-i18next";

/** A multitrack's name (issue #123): its own, "Original stems" for the song's first, else "Multitrack 2"… */
export function useMultitrackName() {
  const { t } = useTranslation();
  return (multitrack: { id: string | null; name: string | null }, index: number) =>
    multitrack.name ?? (multitrack.id === null ? t("stems.originalStems") : t("stems.multitrackNumber", { number: index + 1 }));
}
