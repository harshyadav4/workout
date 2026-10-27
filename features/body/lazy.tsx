"use client";

import dynamic from "next/dynamic";

/**
 * The body map's two drawings, loaded when first drawn rather than with the
 * page. The back alone is 130 KB of paths, and with a plain import the
 * bundler copied the pair into Today's, Plan's and Progress's own chunks —
 * 57 KB (gzip) on each first load, three times over in the installed app.
 * One lazy chunk is fetched once and shared. The server still renders the
 * drawing into the HTML, so nothing jumps; the client just hydrates it a
 * beat later.
 */
export const FrontBody = dynamic(() => import("@/features/body/front"));
export const BackBody = dynamic(() => import("@/features/body/back"));
