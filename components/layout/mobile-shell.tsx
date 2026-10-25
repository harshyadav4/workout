import { BottomNav } from "@/components/layout/bottom-nav";

/**
 * The page frame. A title in the display face, an optional line under it, and
 * the dock. `header` replaces the title block wholesale — Home uses it for the
 * date and a greeting, which need the store and so live in a client component.
 */
export function MobileShell({
  title,
  subtitle,
  header,
  children
}: {
  title: string;
  subtitle?: string;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-8 pt-6 app-safe-bottom">
      <header className="mb-5 px-1">
        {header ?? (
          <>
            <h1 className="font-display text-[34px] font-extrabold leading-none tracking-tight">
              {title}
            </h1>
            {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
          </>
        )}
      </header>
      <main className="space-y-4">{children}</main>
      <BottomNav />
    </div>
  );
}
