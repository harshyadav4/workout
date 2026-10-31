import { BottomNav } from "@/components/layout/bottom-nav";
import { DeletionBanner } from "@/features/profile/data-deletion";

/**
 * The page frame: the sky, the page's content, and the dock.
 *
 * The page name is not shown — the dock already says where you are, and a big
 * "Plan" over the Plan tab cost the top of every screen. It stays as a heading
 * screen readers announce. `header` puts something real there instead — Home
 * uses it for the date, the greeting and the rank, which need the store and so
 * live in a client component.
 */
export function MobileShell({
  title,
  header,
  children
}: {
  title: string;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pb-8 pt-[calc(env(safe-area-inset-top)+var(--titlebar)+1.5rem)] app-safe-bottom">
      <div className="app-sky print:hidden" aria-hidden />
      <div className="app-glow print:hidden" aria-hidden />
      {header ? <header className="mb-5 px-1">{header}</header> : <h1 className="sr-only">{title}</h1>}
      <main className="page-enter space-y-4">
        {/* While old data is archived, every page says so and offers it back. */}
        <DeletionBanner />
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
