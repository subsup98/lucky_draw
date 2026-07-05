"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const MoonIcon = Moon as React.ComponentType<{ className?: string }>;
const SunIcon = Sun as React.ComponentType<{ className?: string }>;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = mounted && theme === "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="테마 전환"
    >
      {mounted ? (
        isDark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />
      ) : (
        <MoonIcon className="h-4 w-4 opacity-0" />
      )}
    </Button>
  );
}
