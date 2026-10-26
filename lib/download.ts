/**
 * Hand the user a file. The one place a Blob URL is minted, so the one place
 * that has to remember to revoke it.
 */
export function downloadJson(filename: string, payload: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Deferred, not immediate: revoking synchronously after click() cancels the
  // download in Safari before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * On a phone, open the share sheet with the file (Save to Files, Drive, a
 * message to yourself). Where the browser cannot share this file — desktop,
 * or Android Chrome, which refuses some file types — download it as before.
 * Must be called straight from a tap: the share sheet needs the gesture.
 *
 * Resolves "shared", "cancelled" (the user closed the sheet; not an error) or
 * "downloaded". Other share failures fall back to the download.
 */
export async function shareOrDownloadJson(
  filename: string,
  payload: unknown,
  title: string
): Promise<"shared" | "cancelled" | "downloaded"> {
  if (typeof navigator !== "undefined" && typeof navigator.canShare === "function") {
    const file = new File([JSON.stringify(payload, null, 2)], filename, { type: "application/json" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
        return "shared";
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") {
          return "cancelled";
        }
        // NotAllowedError and friends: the download still works.
      }
    }
  }
  downloadJson(filename, payload);
  return "downloaded";
}
