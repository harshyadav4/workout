import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { EXTRAS, FAQS, FEATURES } from "@/app/about/content";
import { Button } from "@/components/ui/button";
import { HorizonArc } from "@/components/ui/progress-arc";
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

/** The one main button is in the hero. Everything else that links stays quiet. */
const LINK =
  "inline-flex h-11 items-center rounded text-[15px] underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const QUIET_LINK = `${LINK} text-muted-foreground hover:text-foreground`;

const HEADING ="font-heading text-[34px] leading-[1.08] [text-wrap:balance] sm:text-[46px]";

/** One plain line under a hairline. No ticks and no boxes: the words are the content. */
function Line({ children }: { children: React.ReactNode }) {
  return <li className="border-t border-sep py-3 text-[15px] leading-snug">{children}</li>;
}

export default function AboutPage() {
  return (
    <main className="select-text mx-auto w-full max-w-5xl px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+var(--titlebar)+1rem)] sm:px-8">
      <script
        type="application/ld+json"
        // "<" escaped so no answer text can close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()).replace(/</g, "\\u003c") }}
      />
      <div className="app-sky print:hidden" aria-hidden />
      <div className="app-glow print:hidden" aria-hidden />

      <header className="flex items-center justify-between">
        <Link
          href="/about"
          className="inline-flex h-11 items-center rounded font-heading text-[28px] leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {SITE_NAME}
        </Link>
        {/* Full text colour: this corner sits on the warm part of the sky. */}
        <Link href="/" className={LINK}>
          Open the app
        </Link>
      </header>

      <section className="mt-12 sm:mt-24">
        {/* The page's one warm thing: the app's horizon, small enough to be a mark and not a picture. */}
        <div className="mb-5 w-36 sm:mb-7 sm:w-44" aria-hidden>
          <HorizonArc litTo={304} height={78} label="" />
        </div>
        <h1 className="max-w-4xl font-heading text-[46px] leading-[1.04] [text-wrap:balance] sm:text-[76px]">
          {SITE_NAME} is a free workout tracker with a muscle map.
        </h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground sm:text-lg">
          Log each set in one tap and see the muscles you work. It runs in your browser, installs as
          an app, works offline in the gym and needs no account.
        </p>
        <div className="mt-7 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-7">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/">Open the app</Link>
          </Button>
          <Link href="/?tour=1" className={`${QUIET_LINK} justify-center`}>
            Take the tour
          </Link>
        </div>
      </section>

      <div className="mt-20 space-y-20 sm:mt-32 sm:space-y-32">
        {FEATURES.map((f, i) => (
          <section
            key={f.id}
            id={f.id}
            aria-labelledby={`${f.id}-title`}
            className="grid items-center gap-9 md:grid-cols-2 md:gap-16"
          >
            <div className={i % 2 === 1 ? "md:order-2" : undefined}>
              <h2 id={`${f.id}-title`} className={HEADING}>
                {f.title}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">{f.lead}</p>
              <ul className="mt-5 border-b border-sep">
                {f.points.map((p) => (
                  <Line key={p}>{p}</Line>
                ))}
              </ul>
            </div>
            <div className="flex justify-center">
              <Image
                src={f.image}
                alt={f.alt}
                width={390}
                height={844}
                sizes="(min-width: 768px) 300px, 270px"
                className="h-auto w-[270px] rounded-[28px] border border-sep md:w-[300px]"
              />
            </div>
          </section>
        ))}
      </div>

      <section aria-labelledby="extras-title" className="mt-20 sm:mt-32">
        <h2 id="extras-title" className={HEADING}>
          Also in {SITE_NAME}
        </h2>
        <ul className="mt-5 grid border-b border-sep sm:grid-cols-2 sm:gap-x-16">
          {EXTRAS.map((e) => (
            <Line key={e}>{e}</Line>
          ))}
        </ul>
      </section>

      <section id="faq" aria-labelledby="faq-title" className="mt-20 sm:mt-32">
        <h2 id="faq-title" className={HEADING}>
          Questions and answers
        </h2>
        <div className="mt-6 divide-y divide-sep border-y border-sep">
          {FAQS.map((f) => (
            <div key={f.question} className="py-5">
              <h3 className="font-heading text-[23px] leading-[1.15]">{f.question}</h3>
              <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{f.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-12 flex flex-col gap-2 sm:mt-20 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {SITE_NAME} · {SITE_TAGLINE}
        </p>
        <div className="flex gap-6">
          <Link href="/" className={QUIET_LINK}>
            Open the app
          </Link>
          <Link href="/?tour=1" className={QUIET_LINK}>
            Take the tour
          </Link>
        </div>
      </footer>
    </main>
  );
}
