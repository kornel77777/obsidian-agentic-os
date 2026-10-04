// Reload the page when its own code changes on disk (dashboard updates go live without a server restart).
const FILES = ["/index.html", "/term.html", "/app.js", "/style.css", "/orb.js", "/layout.js", "/terminal.js", "/md-safe.js", "/term-page.js"];

async function fingerprint() {
  const texts = await Promise.all(FILES.map((f) => fetch(f, { cache: "no-store" }).then((r) => r.text())));
  let h = 0;
  for (const t of texts) for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return h;
}

export function watchCode(canReload, everyMs = 15000) {
  let first = null;
  let pending = false;
  setInterval(async () => {
    try {
      const fp = await fingerprint();
      if (first === null) first = fp;
      else if (fp !== first) pending = true;
      if (pending && canReload()) location.reload();
    } catch {
      /* server restarting */
    }
  }, everyMs);
}
