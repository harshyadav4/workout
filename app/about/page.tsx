import { Check } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { EXTRAS, FAQS, FEATURES } from "@/app/about/content";
import { Button } from "@/components/ui/button";
import { OG_ALT, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, absoluteUrl } from "@/lib/site";

/**
 * The public page: the one search engines and AI answer engines index. The
 * app's own pages are noindex (app/(app)/layout.tsx). A server component with
 * no store and no client state, so it renders static and fast.
 * Words and FAQ live in ./content.ts; the JSON-LD below reads the same array.
 */

const TITLE = "Free workout tracker with a muscle map";

export const metadata: Metadata = {
  title: TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en",
    url: "/about",
    title: `${TITLE} · ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
    // Setting openGraph here drops the card inherited from
    // app/opengraph-image.tsx, so it is named again.
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: OG_ALT, type: "image/png" }]
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} · ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
    images: [{ url: "/opengraph-image", alt: OG_ALT }]
  },
  robots: { index: true, follow: true }
};

export const dynamic = "force-static";

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        description: SITE_DESCRIPTION,
        inLanguage: "en"
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#app`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        description: SITE_DESCRIPTION,
        applicationCategory: "HealthApplication",
        operatingSystem: "Any (web browser); installable PWA",
        browserRequirements: "Requires JavaScript. Works in any modern browser.",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: [...FEATURES.map((f) => f.title), ...EXTRAS, "Works offline", "No account needed"],
        screenshot: FEATURES.map((f) => absoluteUrl(f.image))
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/about#faq`,
        url: absoluteUrl("/about"),
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: { "@type": "Answer", text: f.answer }
        }))
      }
    ]
  };
}

function Ctas() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link href="/">Open the app</Link>
      </Button>
      <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
        <Link href="/?tour=1">Take the tour</Link>
      </Button>
    </div>
  );
}

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)] sm:px-6">
      <script
        type="application/ld+json"
        // "<" escaped so no answer text can close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()).replace(/</g, "\\u003c") }}
      />

      <header className="flex items-center justify-between">
        <Link href="/about" className="font-display text-xl font-extrabold tracking-tight">
          {SITE_NAME}
        </Link>
        <Link
          href="/"
          className="text-sm font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open the app
        </Link>
      </header>

      <section className="mt-10 sm:mt-16">
        <h1 className="font-display text-[34px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[52px]">
          {SITE_NAME} is a free workout tracker <span className="text-brand">with a muscle map</span>.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Log each set in one tap and see the muscles you work. It runs in your browser, installs as
          an app, works offline in the gym and needs no account.
        </p>
        <div className="mt-6">
          <Ctas />
        </div>
      </section>

      <div className="mt-14 space-y-14 sm:mt-20 sm:space-y-20">
        {FEATURES.map((f, i) => (
          <section
            key={f.id}
            id={f.id}
            aria-labelledby={`${f.id}-title`}
            className="grid items-center gap-8 md:grid-cols-2 md:gap-12"
          >
            <div className={i % 2 === 1 ? "md:order-2" : undefined}>
              <h2 id={`${f.id}-title`} className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {f.title}
              </h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">{f.lead}</p>
              <ul className="mt-4 space-y-2.5">
                {f.points.map((p) => (
                  <li key={p} className="flex gap-2.5 text-[15px]">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-center">
              <Image
                src={f.image}
                alt={f.alt}
                width={390}
                height={844}
                sizes="(min-width: 768px) 300px, 260px"
                className="h-auto w-[260px] rounded-[28px] border border-border bg-card shadow-plaque md:w-[300px]"
              />
            </div>
          </section>
        ))}
      </div>

      <section aria-labelledby="extras-title" className="plaque mt-14 rounded-3xl p-5 sm:mt-20 sm:p-8">
        <h2 id="extras-title" className="font-display text-xl font-bold tracking-tight">
          Also in {SITE_NAME}
        </h2>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {EXTRAS.map((e) => (
            <li key={e} className="flex gap-2.5 text-[15px]">
              <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
              <span>{e}</span>
            </li>
          ))}
        </ul>
      </section>

      <section id="faq" aria-labelledby="faq-title" className="mt-14 sm:mt-20">
        <h2 id="faq-title" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Questions and answers
        </h2>
        <div className="mt-6 divide-y divide-border border-y border-border">
          {FAQS.map((f) => (
            <div key={f.question} className="py-5">
              <h3 className="font-display text-lg font-semibold tracking-tight">{f.question}</h3>
              <p className="mt-2 max-w-3xl leading-relaxed text-muted-foreground">{f.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-14 flex flex-col items-start gap-4 border-t border-border pt-8 sm:mt-20 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {SITE_NAME} · {SITE_TAGLINE}
        </p>
        <Button asChild size="lg" className="w-full sm:w-auto">
          <Link href="/">Open the app</Link>
        </Button>
      </footer>
    </main>
  );
}
