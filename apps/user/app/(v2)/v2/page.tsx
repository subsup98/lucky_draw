"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trophy, ChevronRight, Bell, MessageCircle, User, LogIn } from "lucide-react";
import { api, ApiError } from "@/app/lib/api";
import type { KujiSummary } from "@/app/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "../components/theme-toggle";
import { BannerCarousel, type CarouselBanner } from "../components/banner-carousel";
import { SideBanner } from "../components/side-banner";
import { PopupBanner } from "../components/popup-banner";
import { usePreviewBanner } from "../lib/preview-banner";

const CONTENT_DEFAULTS = {
  "v2.kuji.heading": "진행 중인 쿠지",
  "v2.kuji.subtitle": "A상부터 라스트원까지, 모든 등수가 준비되어 있어요.",
  "v2.footer.text": "© {year} lucky_draw · v2 preview",
};

export default function HomePageV2() {
  const [kujis, setKujis] = useState<KujiSummary[] | null>(null);
  const [heroes, setHeroes] = useState<CarouselBanner[]>([]);
  const [sides, setSides] = useState<CarouselBanner[]>([]);
  const [popups, setPopups] = useState<CarouselBanner[]>([]);
  const [content, setContent] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const previewHero = usePreviewBanner("MAIN_HERO");
  const previewSide = usePreviewBanner("MAIN_SIDE");
  const previewPopup = usePreviewBanner("POPUP");

  const t = (key: keyof typeof CONTENT_DEFAULTS): string =>
    content[key] ?? CONTENT_DEFAULTS[key];

  useEffect(() => {
    api<KujiSummary[]>("/api/kujis")
      .then(setKujis)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "failed"));
    api<CarouselBanner[]>("/api/banners?placement=MAIN_HERO")
      .then(setHeroes)
      .catch(() => setHeroes([]));
    api<CarouselBanner[]>("/api/banners?placement=MAIN_SIDE")
      .then(setSides)
      .catch(() => setSides([]));
    api<CarouselBanner[]>("/api/banners?placement=POPUP")
      .then(setPopups)
      .catch(() => setPopups([]));
    api<Record<string, unknown>>("/api/site-config/public")
      .then((cfg) => {
        const next: Record<string, string> = {};
        for (const k of Object.keys(cfg)) {
          if (typeof cfg[k] === "string") next[k] = cfg[k] as string;
        }
        setContent(next);
      })
      .catch(() => {});
  }, []);

  const heroBanners: CarouselBanner[] = previewHero
    ? [previewHero, ...heroes.filter((b) => b.id !== previewHero.id)]
    : heroes;
  const sideBanner = previewSide ?? sides[0] ?? null;
  const popupBanner = previewPopup ?? popups[0] ?? null;

  return (
    <div className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 10%, hsl(var(--kuji-red)) 0, transparent 35%), radial-gradient(circle at 80% 60%, hsl(var(--kuji-gold)) 0, transparent 40%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <header className="flex items-center justify-between mb-8">
          <Link href="/v2" className="flex items-center gap-2 group">
            <div className="relative">
              <div className="absolute inset-0 bg-primary blur-md opacity-50 group-hover:opacity-70 transition" />
              {/* 로고 이미지 자리 — 추후 img 로 교체. 현재는 그라디언트만. */}
              <div className="relative h-10 w-10 rounded-lg bg-gradient-to-br from-[hsl(var(--kuji-red))] to-primary shadow-lg" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xs text-muted-foreground tracking-[0.2em]">LUCKY</span>
              <span className="text-lg font-black tracking-tight">DRAW</span>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/v2/notices"><Bell className="h-4 w-4" />공지</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/v2/inquiries"><MessageCircle className="h-4 w-4" />문의</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/v2/me"><User className="h-4 w-4" /><span className="hidden sm:inline">마이</span></Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/v2/login"><LogIn className="h-4 w-4" /><span className="hidden sm:inline">로그인</span></Link>
            </Button>
            <ThemeToggle />
          </nav>
        </header>

        <div className="mb-6">
          {heroBanners.length > 0 && <BannerCarousel banners={heroBanners} />}
        </div>

        {sideBanner && (
          <div className="mb-10">
            <SideBanner banner={sideBanner} />
          </div>
        )}

        {popupBanner && <PopupBanner banner={popupBanner} isPreview={!!previewPopup} />}

        <section id="kuji-list">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                <Trophy className="h-6 w-6 text-[hsl(var(--kuji-gold))]" /> {t("v2.kuji.heading")}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t("v2.kuji.subtitle")}
              </p>
            </div>
          </div>

          {err && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="p-4 text-sm text-destructive">불러오기 실패: {err}</CardContent>
            </Card>
          )}

          {!kujis && !err && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="h-40 rounded-none" />
                  <CardContent className="p-5 space-y-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {kujis && kujis.length === 0 && (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                현재 진행 중인 쿠지가 없습니다.
              </CardContent>
            </Card>
          )}

          {kujis && kujis.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {kujis.map((k) => {
                const sold = k.totalTickets - k.remainingTickets;
                const pct = k.totalTickets > 0 ? Math.min(100, (sold / k.totalTickets) * 100) : 0;
                const isHot = pct >= 70 && k.isOnSale;
                return (
                  <li key={k.id}>
                    <Link href={`/v2/kujis/${k.id}`} className="group block h-full">
                      <Card className="h-full overflow-hidden transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/40">
                        <div className="relative h-40 overflow-hidden">
                          {k.coverImageUrl ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={k.coverImageUrl}
                                alt={k.title}
                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                            </>
                          ) : (
                            <>
                              <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--kuji-red))]/90 via-primary to-[hsl(var(--kuji-ink))]" />
                              <div
                                className="absolute inset-0 opacity-30"
                                style={{
                                  backgroundImage:
                                    "radial-gradient(circle at 30% 30%, hsl(var(--kuji-gold)) 0, transparent 50%)",
                                }}
                              />
                            </>
                          )}
                          <div className="absolute top-3 left-3 flex gap-1.5">
                            {k.isOnSale ? (
                              <Badge variant="gold">판매중</Badge>
                            ) : (
                              <Badge variant="secondary">종료</Badge>
                            )}
                            {isHot && <Badge variant="default">🔥 HOT</Badge>}
                          </div>
                        </div>

                        <CardContent className="p-5">
                          <h3 className="font-bold text-lg leading-tight mb-1 group-hover:text-primary transition">
                            {k.title}
                          </h3>
                          {k.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                              {k.description}
                            </p>
                          )}

                          <div className="mb-4">
                            <div className="flex justify-between text-xs mb-1.5">
                              <span className="text-muted-foreground">남은 티켓</span>
                              <span className="font-mono font-semibold">
                                {k.remainingTickets} / {k.totalTickets}
                              </span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-[hsl(var(--kuji-red))] to-[hsl(var(--kuji-gold))] transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex items-end justify-between">
                            <div>
                              <div className="text-xs text-muted-foreground">장당</div>
                              <div className="font-black text-xl">
                                {k.pricePerTicket.toLocaleString()}<span className="text-sm font-semibold text-muted-foreground ml-0.5">원</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 text-sm font-semibold text-primary group-hover:gap-2 transition-all">
                              뽑으러 가기 <ChevronRight className="h-4 w-4" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <footer className="mt-16 pt-8 border-t text-center text-xs text-muted-foreground">
          {t("v2.footer.text").replace("{year}", String(new Date().getFullYear()))}
        </footer>
      </div>
    </div>
  );
}
