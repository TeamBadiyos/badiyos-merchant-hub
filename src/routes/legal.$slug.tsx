import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";

import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

const TITLES: Record<string, string> = {
  "privacy-policy": "Privacy Policy",
  terms: "Terms & Conditions",
};

export const Route = createFileRoute("/legal/$slug")({
  head: ({ params }) => {
    const label = TITLES[params.slug] ?? "Legal";
    return {
      meta: [
        { title: `${label} — badiyos Merchant Portal` },
        {
          name: "description",
          content: `Read the ${label.toLowerCase()} that applies to shops selling on the badiyos platform in Latur.`,
        },
        { property: "og:title", content: `${label} — badiyos Merchant Portal` },
        {
          property: "og:description",
          content: `Read the ${label.toLowerCase()} for badiyos merchants.`,
        },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: LegalPage,
});

type LegalPageRow = {
  slug: string;
  title: string;
  content: string;
  effective_date: string | null;
  last_updated_at: string;
};

function LegalPage() {
  const { slug } = Route.useParams();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const router = useRouter();

  const page = useQuery({
    queryKey: ["legal-page", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_pages")
        .select("slug,title,content,effective_date,last_updated_at")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return (data as LegalPageRow | null) ?? null;
    },
  });

  const goBack = () => {
    if (router.history.canGoBack()) router.history.back();
    else void navigate({ to: "/settings" });
  };

  const dateFmt = new Intl.DateTimeFormat(lang === "mr" ? "mr-IN" : "en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    numberingSystem: "latn",
  });

  return (
    <div className="h-full overflow-hidden bg-background">
      <div className="safe-x mx-auto flex h-full w-full max-w-[520px] flex-col border-border bg-background sm:border-x">
        <header className="bg-brand-gradient safe-top z-20 shrink-0 px-6 pb-6 text-primary-foreground">
          <div className="flex items-center gap-3 pt-6">
            <button
              onClick={goBack}
              aria-label={t("back")}
              className="-ml-2 rounded-xl p-2 transition-colors hover:bg-primary-foreground/15"
            >
              <ArrowLeft className="size-6" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold uppercase opacity-80">{t("legal")}</p>
              <h1 className="truncate text-base font-bold">
                {page.data?.title ?? TITLES[slug] ?? t("legal")}
              </h1>
            </div>
          </div>
        </header>

        <main className="app-scroll flex-1">
          <div className="px-6 pt-6 pb-24">
            {page.isPending && (
              <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                <Loader2 className="size-6 animate-spin text-primary" />
                <p className="text-sm font-semibold">{t("loading")}</p>
              </div>
            )}

            {!page.isPending && (page.isError || !page.data) && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center shadow-card">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-soft">
                  <AlertTriangle className="size-7 text-primary" />
                </div>
                <h2 className="mt-4 text-base font-bold text-foreground">
                  {page.isError ? t("legalErrorTitle") : t("legalMissingTitle")}
                </h2>
                <p className="mx-auto mt-2 max-w-[34ch] text-sm text-muted-foreground">
                  {page.isError ? t("legalErrorSub") : t("legalMissingSub")}
                </p>
                {page.isError && (
                  <Button
                    onClick={() => void page.refetch()}
                    className="mt-6 rounded-2xl font-bold"
                  >
                    {t("retry")}
                  </Button>
                )}
              </div>
            )}

            {page.data && (
              <article>
                <div className="rounded-2xl bg-muted/70 p-4">
                  {page.data.effective_date && (
                    <p className="num text-xs font-bold text-foreground">
                      {t("legalEffective")}: {dateFmt.format(new Date(page.data.effective_date))}
                    </p>
                  )}
                  <p className="num mt-1 text-xs text-muted-foreground">
                    {t("legalUpdated")}: {dateFmt.format(new Date(page.data.last_updated_at))}
                  </p>
                </div>
                <div className="mt-5">
                  <Markdown content={page.data.content} />
                </div>
              </article>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}