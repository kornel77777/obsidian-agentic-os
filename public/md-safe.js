// Shared by server (vault notes) and browser (Claude run output).
// Vault notes and Claude output can contain text pulled from the web, and this
// page can start Claude runs — so raw HTML is escaped and only http(s)/obsidian
// links survive. Never render untrusted markdown without this.
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function safeMarked(marked) {
  marked.use({
    gfm: true,
    renderer: {
      html({ text }) {
        return esc(text);
      },
      link({ href, title, tokens }) {
        const label = this.parser.parseInline(tokens);
        if (!/^(https?:|obsidian:)/i.test(href || "")) return label;
        return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${esc(title)}"` : ""}>${label}</a>`;
      },
      image({ text }) {
        return esc(text);
      },
    },
  });
  return marked;
}

export { esc };
