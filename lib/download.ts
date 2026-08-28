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
