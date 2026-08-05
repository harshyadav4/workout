import { BottomNav } from "@/components/layout/bottom-nav";

export function MobileShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-md px-4 pb-8 pt-5 app-safe-bottom">
      <header className="mb-5">
        <p className="text-sm text-primary">{subtitle ?? "GymFlow"}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{title}</h1>
      </header>
      <main className="space-y-4">{children}</main>
      <BottomNav />
    </div>
  );
}
