import { serverRequest } from "./adminService";

export const PORTFOLIO_CATEGORIES = [
  "Website",
  "E-commerce",
  "Web App",
  "WordPress",
  "Landing Page",
  "Mobile App",
  "Design",
  "SEO",
  "Bug Fix",
  "Other",
];

export const listPortfolio = async (token) => {
  const data = await serverRequest("/portfolio", { token });
  return Array.isArray(data?.items) ? data.items : [];
};

export const createPortfolioItem = async (token, item) => {
  const data = await serverRequest("/portfolio", {
    token,
    method: "POST",
    body: item,
  });
  return data?.item;
};

export const updatePortfolioItem = async (token, id, updates) => {
  const data = await serverRequest(`/portfolio/${encodeURIComponent(id)}`, {
    token,
    method: "PUT",
    body: updates,
  });
  return data?.item;
};

export const deletePortfolioItem = async (token, id) =>
  serverRequest(`/portfolio/${encodeURIComponent(id)}`, {
    token,
    method: "DELETE",
  });

export const getPublicPortfolio = async (username) =>
  serverRequest(`/portfolio/public/${encodeURIComponent(username)}`);

// Shareable page served by the web app (see App.js). A query string on the
// root page works on static hosts that 404 unknown paths.
export const getPublicPortfolioUrl = (username) => {
  if (!username || typeof window === "undefined" || !window.location) {
    return null;
  }
  return `${window.location.origin}/?portfolio=${encodeURIComponent(username)}`;
};

const NON_PROJECT_HOSTS =
  /(^|\.)(fiverr\.com|fiverr-res\.cloudinary\.com|cloudinary\.com|fiverrcdn\.com|google\.com|googleusercontent\.com|gstatic\.com|youtube\.com|youtu\.be|zoom\.us|loom\.com|wa\.me|whatsapp\.com|facebook\.com|instagram\.com|linkedin\.com|t\.me|bit\.ly)$/i;
const FILE_LINK = /\.(jpe?g|png|gif|webp|bmp|svg|pdf|zip|rar|mp4|mov|docx?|xlsx?|pptx?)(\?|#|$)/i;
const URL_PATTERN =
  /\b((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"')\]]*)?)/gi;

const toSiteUrl = (raw) => {
  const text = String(raw || "").replace(/[.,;:!?]+$/, "");
  if (!text || /@/.test(text)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (NON_PROJECT_HOSTS.test(url.hostname) || FILE_LINK.test(url.pathname)) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
};

/**
 * Websites mentioned in a conversation (links and plain domains), most
 * recent first, one per host — the likely project sites for the portfolio.
 */
export const detectClientWebsites = (messages = [], limit = 6) => {
  const byHost = new Map();
  const ordered = [...messages].reverse();

  for (const message of ordered) {
    const candidates = [];
    const links = Array.isArray(message?.links)
      ? message.links
      : Array.isArray(message?.urls)
        ? message.urls
        : [];
    links.forEach((link) =>
      candidates.push(typeof link === "string" ? link : link?.href || link?.url),
    );
    const text = (message?.text || message?.content || "")
      .toString()
      .replace(/\S+@\S+/g, " ");
    candidates.push(...(text.match(URL_PATTERN) || []));

    for (const candidate of candidates) {
      const url = toSiteUrl(candidate);
      if (!url) continue;
      const host = url.hostname.replace(/^www\./i, "").toLowerCase();
      if (!byHost.has(host)) {
        byHost.set(host, `${url.protocol}//${url.hostname}${url.pathname === "/" ? "" : url.pathname}`);
      }
      if (byHost.size >= limit) break;
    }
    if (byHost.size >= limit) break;
  }

  return [...byHost.values()];
};

export const getWebsiteLabel = (websiteUrl) => {
  if (!websiteUrl) return "";
  try {
    return new URL(websiteUrl).hostname.replace(/^www\./i, "");
  } catch {
    return String(websiteUrl);
  }
};
