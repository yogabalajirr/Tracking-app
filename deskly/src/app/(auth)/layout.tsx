import Link from "next/link";
import { Headset } from "lucide-react";
import { ThemeToggle } from "@/components/theme";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <Headset className="size-4" />
          </span>
          Deskly
        </Link>
        <ThemeToggle />
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="px-6 py-4 text-center text-xs text-muted-foreground">
        Support ticketing for small teams.
      </footer>
    </div>
  );
}
