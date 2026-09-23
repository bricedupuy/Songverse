import type { InstrumentValue, TechRoleValue } from "@songverse/core";
import { useTranslation } from "react-i18next";
import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";

/** A user's instruments and other roles (dashboard > Roles), instruments first. */
export function RoleBadges({
  instruments,
  techRoles,
  className,
}: {
  instruments: readonly InstrumentValue[];
  techRoles: readonly TechRoleValue[];
  className?: string;
}) {
  const { t } = useTranslation();
  if (instruments.length === 0 && techRoles.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1", className)} aria-label={t("roles.title")}>
      {instruments.map((instrument) => (
        <li key={instrument}>
          <Badge>{t(`roles.instrument.${instrument}`)}</Badge>
        </li>
      ))}
      {techRoles.map((role) => (
        <li key={role}>
          <Badge variant="muted">{t(`roles.techRole.${role}`)}</Badge>
        </li>
      ))}
    </ul>
  );
}
