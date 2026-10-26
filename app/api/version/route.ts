/**
 * The build this server runs. The app compares it with the build it was loaded
 * from (NEXT_PUBLIC_BUILD_ID, set in next.config) and offers a reload when they
 * differ — see features/pwa/update-bar.tsx. "dev" in development: never offered.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_ID || "dev";
  return Response.json({ version }, { headers: { "Cache-Control": "no-store" } });
}
