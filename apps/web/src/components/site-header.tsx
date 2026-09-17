import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "#/components/ui/breadcrumb";
import { Separator } from "#/components/ui/separator";
import { SidebarTrigger } from "#/components/ui/sidebar";

interface Crumb {
  label: string;
  to?: string;
}

function useBreadcrumbs(): Crumb[] {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const loaderData = useRouterState({
    select: (s) => s.matches.at(-1)?.loaderData as { version?: { title?: string } } | undefined,
  });

  if (pathname === "/dashboard") return [{ label: t("nav.dashboard") }];
  if (pathname === "/library") return [{ label: t("nav.library") }];
  if (pathname === "/library/new") {
    return [{ label: t("nav.library"), to: "/library" }, { label: t("breadcrumb.addASong") }];
  }
  if (pathname.startsWith("/library/")) {
    return [
      { label: t("nav.library"), to: "/library" },
      { label: loaderData?.version?.title ?? t("breadcrumb.song") },
    ];
  }
  return [{ label: t("nav.library") }];
}

export function SiteHeader() {
  const crumbs = useBreadcrumbs();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b">
      <div className="flex w-full items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5 sm:gap-2.5">
                {i > 0 ? <BreadcrumbSeparator /> : null}
                <BreadcrumbItem>
                  {crumb.to ? (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.to}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
