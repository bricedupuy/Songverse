import { ISO_639_1_CODES, getLanguageDisplayName } from "@songverse/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

interface LanguageSelectProps {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  /** Renders a leading "none" option that clears the field - for optional language fields. */
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
}

/**
 * A language should never be free text (see docs) - this is the one
 * place in the app a language field is entered, always storing an ISO
 * 639-1 code while showing the reader's own localized language name
 * (via Intl.DisplayNames, not a hardcoded name table).
 */
export function LanguageSelect({
  id,
  value,
  onChange,
  disabled,
  allowEmpty,
  emptyLabel,
  className,
}: LanguageSelectProps) {
  const { i18n } = useTranslation();

  const options = useMemo(() => {
    return ISO_639_1_CODES.map((code) => ({ code, name: getLanguageDisplayName(code, i18n.language) })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [i18n.language]);

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={
        className ??
        "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
      }
    >
      {allowEmpty ? <option value="">{emptyLabel ?? ""}</option> : null}
      {options.map(({ code, name }) => (
        <option key={code} value={code}>
          {name} ({code})
        </option>
      ))}
    </select>
  );
}
