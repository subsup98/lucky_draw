"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./theme-toggle";

export function V2Header({
  back,
  backLabel = "뒤로",
}: {
  back?: string;
  backLabel?: string;
}) {
  return (
    <header className="sticky top-0 z-30 -mx-4 md:-mx-6 mb-6 flex items-center justify-between gap-3 border-b border-border/50 bg-background/80 px-4 md:px-6 py-3 backdrop-blur-md">
      <div className="flex items-center gap-2 min-w-0">
        {back && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={back}>
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
          </Button>
        )}
        <Link href="/v2" className="flex items-center gap-2 group min-w-0">
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-primary blur-md opacity-50 group-hover:opacity-70 transition" />
            <div className="relative flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-[hsl(var(--kuji-red))] to-primary text-primary-foreground font-black text-sm shadow">
              籤
            </div>
          </div>
          <span className="font-black tracking-tight truncate">LUCKY DRAW</span>
        </Link>
      </div>
      <ThemeToggle />
    </header>
  );
}
