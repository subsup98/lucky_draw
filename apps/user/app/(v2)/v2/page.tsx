"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, Ticket, Trophy, ChevronRight, Bell, MessageCircle, User, LogIn } from "lucide-react";
import { api, ApiError } from "@/app/lib/api";
import type { KujiSummary } from "@/app/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "../components/theme-toggle";

export default function HomePageV2() {
  const [kujis, setKujis] = useState<KujiSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<KujiSummary[]>("/api/kujis")
      .then(setKujis)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "failed"));
  }, []);

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
              <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(var(--kuji-red))] to-primary text-primary-foreground font-black text-lg shadow-lg">
                籤
              </div>
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

        <section className="relative mb-10 overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-secondary p-6 md:p-10 shadow-lg">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(110deg, transparent 30%, hsl(var(--kuji-gold) / 0.15) 50%, transparent 70%)",
              backgroundSize: "200% 100%",
              animation: "shimmer 4s linear infinite",
            }}
          />
          <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <Badge variant="gold" className="mb-3">
                <Sparkles className="mr-1 h-3 w-3" /> 매주 신상 입고
              </Badge>
              <h1 className="font-black text-4xl md:text-5xl leading-[1.1] tracking-tight">
                오늘은 <span className="bg-gradient-to-r from-[hsl(var(--kuji-red))] to-[hsl(var(--kuji-gold))] bg-clip-text text-transparent">어떤 행운</span>이<br />
                기다리고 있을까?
              </h1>
              <p className="mt-3 text-muted-foreground md:text-lg">
                꽝 없는 이치방쿠지. 한 장 한 장이 모두 당첨입니다.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="kuji" size="lg" asChild>
                <a href="#kuji-list">
                  <Ticket /> 지금 뽑기
                </a>
              </Button>
            </div>
          </div>

          <div className="absolute -right-2 top-4 hidden md:block">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-[hsl(var(--kuji-red))] text-[hsl(var(--kuji-red))] font-black text-xs animate-stamp-in"
                 style={{ transform: "rotate(-12deg)" }}>
              <div className="text-center leading-tight">
                NO<br />MISS<br />ALL HIT
              </div>
            </div>
          </div>
        </section>

        <section id="kuji-list">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-2xl font-black tracking-tight flex items-center gap-2">
                <Trophy className="h-6 w-6 text-[hsl(var(--kuji-gold))]" /> 진행 중인 쿠지
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                A상부터 라스트원까지, 모든 등수가 준비되어 있어요.
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
                              <div className="absolute bottom-3 right-3 text-primary-foreground/80 font-black text-5xl leading-none opacity-30 group-hover:opacity-50 transition select-none">
                                籤
                              </div>
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
          © {new Date().getFullYear()} lucky_draw · v2 preview
        </footer>
      </div>
    </div>
  );
}
