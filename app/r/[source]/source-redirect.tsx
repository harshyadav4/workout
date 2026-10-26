"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { landingPath } from "@/lib/sources";

export function SourceRedirect({ source }: { source: string }) {
  const router = useRouter();
  const target = landingPath(source);

  useEffect(() => {
    // A client move keeps the page, so the queued page view is still sent.
    router.replace(target);
  }, [router, target]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-sm text-muted-foreground">
      <Link href={target} className="underline-offset-2 hover:underline">
        Opening Arise…
      </Link>
    </main>
  );
}
