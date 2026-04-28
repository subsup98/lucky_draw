import { ThemeProvider } from "./components/theme-provider";

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <div className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </div>
    </ThemeProvider>
  );
}
