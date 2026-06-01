// Shared URL helpers for rendering task titles consistently across the app
// (TaskCard, Dashboard/Today, Completed, Projects, Weekly Review, AI Assistant).
// Keeps "show a friendly site label, still clickable" behavior identical everywhere.

// Friendly site name for a URL: the registrable domain label, no subdomain/TLD.
// e.g. https://app.fireflies.ai/ -> "fireflies", https://github.com/x -> "github".
export function siteLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    return parts.length >= 2 ? parts[parts.length - 2] : host;
  } catch {
    return 'link';
  }
}

const URL_SPLIT = /(https?:\/\/[^\s]+)/g;

// Render a string with inline URLs turned into clickable links shown as the
// friendly site label. Returns a <span role="link"> (not <a>) so it is valid
// inside a <button> (task titles are buttons); it opens via window.open and
// stops propagation so it doesn't also trigger the row's open-detail handler.
export function linkify(text) {
  if (!text) return text;
  return text.split(URL_SPLIT).map((part, i) => {
    if (!/^https?:\/\//i.test(part)) return part;
    const href = part.replace(/[.,;:!?)\]}>'"]+$/, '');
    return (
      <span
        key={i}
        role="link"
        title={href}
        onClick={(e) => { e.stopPropagation(); window.open(href, '_blank', 'noopener,noreferrer'); }}
        className="text-mint-glow underline decoration-mint/40 hover:decoration-mint cursor-pointer [overflow-wrap:anywhere]"
      >
        {siteLabel(href)}
      </span>
    );
  });
}
