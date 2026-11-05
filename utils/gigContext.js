/**
 * Gig + pricing context for AI replies.
 *
 * The browser extension extracts the seller's gig catalog (packages, prices,
 * delivery, revisions, extras, FAQ) and, on every conversation, the gig the
 * buyer contacted the seller about ("This message relates to:") plus any
 * custom offer cards. These helpers turn that into prompt text so the AI
 * knows which gig the client came from and prices work from the seller's
 * own packages and pricing rules.
 *
 * Pure functions — no React Native imports.
 */

const EMPTY_CONTEXT = Object.freeze({
  block: "",
  relatedGig: null,
  ref: null,
  hasPricingData: false,
});

const clip = (value, max) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const normalizeUsername = (value) =>
  String(value || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();

const normalizeTitle = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/^\s*i will\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const isFromSeller = (msg) => {
  if (!msg) return false;
  if (msg.isFromMe === true || msg.isFromMe === "true") return true;
  const sender = String(msg.sender || "").toLowerCase();
  return sender === "me" || sender === "seller" || sender === "you";
};

/** Stable key for per-gig settings (pricing notes, AI on/off). */
export const getGigKey = (gig) =>
  String(gig?.slug || gig?.gigId || gig?.url || "")
    .trim()
    .toLowerCase();

export const formatMoney = (amount, currency = "USD") => {
  if (amount === null || amount === undefined || amount === "") return "";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "";
  const value = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return !currency || currency === "USD" ? `$${value}` : `${currency} ${value}`;
};

/** Every gig across the stored catalogs (one catalog per seller account). */
export const listCatalogGigs = (catalogs) => {
  const values = Array.isArray(catalogs)
    ? catalogs
    : Object.values(catalogs || {});
  return values.flatMap((catalog) =>
    (Array.isArray(catalog?.gigs) ? catalog.gigs : []).map((gig) => ({
      ...gig,
      owner: gig.owner || catalog.sellerUsername || null,
    })),
  );
};

/** Match a conversation's gig reference (slug, gig id, or title) to a gig. */
export const findGigForRef = (gigs, ref) => {
  if (!ref || !Array.isArray(gigs) || gigs.length === 0) return null;
  const slug = String(ref.slug || "").toLowerCase();
  const gigId = ref.gigId ? String(ref.gigId) : "";
  const title = normalizeTitle(ref.title || ref.gigTitle);
  return (
    (slug && gigs.find((gig) => String(gig.slug || "").toLowerCase() === slug)) ||
    (gigId && gigs.find((gig) => String(gig.gigId || "") === gigId)) ||
    (title && gigs.find((gig) => normalizeTitle(gig.title) === title)) ||
    null
  );
};

/** "relates to" gig references in thread order, de-duplicated. */
export const findConversationGigRefs = (messages = []) => {
  const refs = [];
  const seen = new Set();
  for (const msg of Array.isArray(messages) ? messages : []) {
    const ref = msg?.relatedGig;
    if (!ref || !(ref.slug || ref.title)) continue;
    const key = String(ref.slug || ref.title).toLowerCase();
    if (seen.has(key)) {
      // Move a re-referenced gig to the end so "latest" stays accurate.
      const index = refs.findIndex(
        (item) => String(item.slug || item.title).toLowerCase() === key,
      );
      if (index >= 0) refs.push(...refs.splice(index, 1));
      continue;
    }
    seen.add(key);
    refs.push(ref);
  }
  return refs;
};

export const findCustomOffers = (messages = []) =>
  (Array.isArray(messages) ? messages : [])
    .filter((msg) => msg?.customOffer)
    .map((msg) => ({ ...msg.customOffer, fromSeller: isFromSeller(msg) }));

const describeOffer = (offer) =>
  [
    offer.price || formatMoney(offer.amount, offer.currency),
    offer.gigTitle ? `gig "${clip(offer.gigTitle, 120)}"` : "",
    offer.description ? `"${clip(offer.description, 200)}"` : "",
    ...(Array.isArray(offer.includes) ? offer.includes.slice(0, 6) : []),
    offer.status ? `status: ${offer.status}` : "",
  ]
    .filter(Boolean)
    .join(" — ");

/** Transcript annotation for card content Fiverr shows outside the text. */
export const describeMessageCards = (message) => {
  const notes = [];
  const gig = message?.relatedGig;
  if (gig && (gig.title || gig.slug)) {
    notes.push(`(This message relates to your gig: "${gig.title || gig.slug}")`);
  }
  if (message?.customOffer) {
    notes.push(`(Custom offer card: ${describeOffer(message.customOffer)})`);
  }
  return notes.join("\n");
};

const describeFeature = (feature) => {
  if (!feature?.name) return "";
  if (feature.value) return `${feature.name}: ${feature.value}`;
  if (feature.included === false) return `${feature.name}: not included`;
  return feature.name;
};

const describePackage = (pkg, currency) => {
  const label =
    pkg.name && pkg.tier && pkg.name !== pkg.tier
      ? `${pkg.tier} ("${pkg.name}")`
      : pkg.tier || pkg.name || "Package";
  const facts = [formatMoney(pkg.price, currency) || "price not listed"];
  if (pkg.deliveryDays !== null && pkg.deliveryDays !== undefined) {
    facts.push(`${pkg.deliveryDays}-day delivery`);
  }
  if (pkg.revisions) facts.push(`${pkg.revisions} revision(s)`);
  if (pkg.extraFast && pkg.extraFast.price !== null && pkg.extraFast.price !== undefined) {
    facts.push(
      `extra-fast ${pkg.extraFast.deliveryDays ?? "?"}-day delivery +${formatMoney(pkg.extraFast.price, currency)}`,
    );
  }
  const lines = [`  - ${label}: ${facts.join(" | ")}`];
  if (pkg.description) lines.push(`    About: ${clip(pkg.description, 300)}`);
  const features = (Array.isArray(pkg.features) ? pkg.features : [])
    .map(describeFeature)
    .filter(Boolean);
  if (features.length) lines.push(`    Includes: ${features.join("; ")}`);
  return lines.join("\n");
};

export const formatGigDetails = (gig, pricingNote = "") => {
  const currency = gig.currency || "USD";
  const lines = [`Gig: ${gig.title || gig.slug}`];
  if (gig.url) lines.push(`URL: ${gig.url}`);
  if (gig.category) lines.push(`Category: ${gig.category}`);
  const packages = Array.isArray(gig.packages) ? gig.packages : [];
  if (packages.length) {
    lines.push("Packages:");
    packages.forEach((pkg) => lines.push(describePackage(pkg, currency)));
  } else if (gig.packagesText) {
    lines.push(
      `Packages (text from the gig page): ${clip(gig.packagesText, 1200)}`,
    );
  } else if (gig.startingPrice !== null && gig.startingPrice !== undefined) {
    lines.push(`Starting price: ${formatMoney(gig.startingPrice, currency)}`);
  }
  const extras = Array.isArray(gig.extras) ? gig.extras : [];
  if (extras.length) {
    lines.push(
      `Gig extras (add-ons): ${extras
        .map(
          (extra) =>
            `${extra.title} +${formatMoney(extra.price, currency) || "price not listed"}${
              extra.deliveryDays ? ` (+${extra.deliveryDays} day(s))` : ""
            }`,
        )
        .join("; ")}`,
    );
  }
  if (gig.description) lines.push(`Gig description: ${clip(gig.description, 700)}`);
  const faq = (Array.isArray(gig.faq) ? gig.faq : []).slice(0, 4);
  if (faq.length) {
    lines.push(
      `Gig FAQ: ${faq
        .map((entry) => `Q: ${entry.question} A: ${clip(entry.answer, 200)}`)
        .join(" | ")}`,
    );
  }
  const note = String(pricingNote || "").trim();
  if (note) lines.push(`Seller's pricing rules for this gig: ${note}`);
  return lines.join("\n");
};

export const formatCatalogSummary = (gigs, exclude = null) =>
  (Array.isArray(gigs) ? gigs : [])
    .filter((gig) => gig && gig !== exclude && getGigKey(gig) !== getGigKey(exclude))
    .slice(0, 12)
    .map((gig) => {
      const prices = (Array.isArray(gig.packages) ? gig.packages : [])
        .filter((pkg) => pkg.price !== null && pkg.price !== undefined)
        .map((pkg) => `${pkg.tier || pkg.name} ${formatMoney(pkg.price, gig.currency)}`)
        .join(" / ");
      const priceText =
        prices ||
        (gig.startingPrice !== null && gig.startingPrice !== undefined
          ? `from ${formatMoney(gig.startingPrice, gig.currency)}`
          : "price not listed");
      return `- ${gig.title || gig.slug} — ${priceText}`;
    })
    .join("\n");

export const GIG_PRICING_RULES = [
  "HOW TO PRICE FROM THE GIGS (whenever a price, quote, or offer is needed):",
  "1. Identify the gig: use the related gig above; otherwise pick the gig whose title and description match the buyer's request.",
  "2. List the buyer's concrete requirements from the thread (pages/items/quantity, features, integrations, deadline, revisions).",
  "3. Start from the cheapest package whose included items cover those requirements. Do not upsell beyond what they need.",
  "4. For anything that package does not include, add the listed gig extras first, then apply the seller's pricing rules. Never invent extras, hourly rates, discounts, or prices that are not listed here.",
  "5. Rush requests: use the listed extra-fast delivery price; if none is listed, say the timeline needs confirmation.",
  "6. Never go below the gig's lowest listed package price, and stay consistent with custom offers already sent unless the scope changed.",
  "7. If the scope is too unclear to price, ask for the specific missing details (for example number of pages or features) instead of guessing.",
  "8. In buyer messages, name the package or custom offer, what it includes, the delivery time, and the total. Keep the internal calculation private unless the seller asks for a breakdown.",
].join("\n");

/**
 * Prompt block with the gig the buyer came from, the seller's packages,
 * custom offers in the thread, pricing rules, and how to calculate prices.
 */
export const buildGigPricingContext = ({
  catalogs,
  messages = [],
  pricing = {},
  sellerUsername = "",
} = {}) => {
  const disabled = pricing?.disabledGigs || {};
  const notes = pricing?.gigNotes || {};
  const generalRules = String(pricing?.generalRules || "").trim();
  const allGigs = listCatalogGigs(catalogs).filter(
    (gig) => !disabled[getGigKey(gig)],
  );
  const owner = normalizeUsername(sellerUsername);
  const ownGigs = owner
    ? allGigs.filter((gig) => normalizeUsername(gig.owner) === owner)
    : [];
  const catalogGigs = ownGigs.length ? ownGigs : allGigs;

  const refs = findConversationGigRefs(messages);
  const offers = findCustomOffers(messages);
  const latestRef = refs[refs.length - 1] || null;
  const relatedGig = latestRef ? findGigForRef(allGigs, latestRef) : null;
  const latestOffer = offers[offers.length - 1] || null;
  const offerGig =
    !relatedGig && latestOffer?.gigTitle
      ? findGigForRef(allGigs, { title: latestOffer.gigTitle })
      : null;
  const primaryGig = relatedGig || offerGig;

  if (!latestRef && !catalogGigs.length && !offers.length && !generalRules) {
    return EMPTY_CONTEXT;
  }

  const sections = [
    "SELLER GIGS & PRICING (private reference — use it, never paste this block to the buyer):",
  ];
  if (primaryGig) {
    sections.push(
      relatedGig
        ? 'RELATED GIG — the buyer contacted you from this gig (Fiverr shows "This message relates to" on their message):'
        : "LIKELY GIG — the custom offer in this thread was made on this gig:",
    );
    sections.push(formatGigDetails(primaryGig, notes[getGigKey(primaryGig)]));
  } else if (latestRef) {
    sections.push(
      `RELATED GIG — the buyer contacted you from your gig "${latestRef.title || latestRef.slug}"${
        latestRef.url ? ` (${latestRef.url})` : ""
      }. Its packages are not loaded yet, so do not quote package prices from memory.`,
    );
  } else if (catalogGigs.length) {
    sections.push(
      "No gig is attached to this conversation. Infer which of your gigs fits the buyer's request from the list below; if none fits, treat it as a custom request.",
    );
  }
  if (refs.length > 1) {
    sections.push(
      `The buyer referenced several of your gigs: ${refs
        .map((ref) => `"${ref.title || ref.slug}"`)
        .join(", ")}. The latest one is the main context.`,
    );
  }
  const others = formatCatalogSummary(catalogGigs, primaryGig);
  if (others) {
    sections.push(
      `${primaryGig ? "Your other gigs" : "Your gigs"} (for scope comparison; mention only when relevant):\n${others}`,
    );
  }
  if (offers.length) {
    sections.push(
      `Custom offers already in this thread (stay consistent unless the scope changed):\n${offers
        .map((offer) => `- ${describeOffer(offer)}`)
        .join("\n")}`,
    );
  }
  if (generalRules) {
    sections.push(`Seller's general pricing rules: ${generalRules}`);
  }
  sections.push(GIG_PRICING_RULES);

  const gigHasPrices = (gig) =>
    Boolean(
      gig &&
        ((Array.isArray(gig.packages) &&
          gig.packages.some((pkg) => pkg.price !== null && pkg.price !== undefined)) ||
          gig.packagesText ||
          (gig.startingPrice !== null && gig.startingPrice !== undefined)),
    );
  const hasPricingData = Boolean(
    generalRules ||
      (primaryGig && (gigHasPrices(primaryGig) || notes[getGigKey(primaryGig)])) ||
      (!latestRef && catalogGigs.some(gigHasPrices)),
  );

  return {
    block: sections.join("\n\n"),
    relatedGig: primaryGig,
    ref: latestRef,
    hasPricingData,
  };
};

/** Gig URLs clients have referenced, so a fetch includes them too. */
export const collectReferencedGigUrls = (messagesByConversation) => {
  const urls = new Set();
  const seenArrays = new Set();
  Object.values(messagesByConversation || {}).forEach((list) => {
    if (!Array.isArray(list) || seenArrays.has(list)) return;
    seenArrays.add(list);
    list.forEach((msg) => {
      const url = msg?.relatedGig?.url;
      if (typeof url === "string" && /^https:\/\/(www\.)?fiverr\.com\//i.test(url)) {
        urls.add(url);
      }
    });
  });
  return Array.from(urls).slice(0, 50);
};

export { EMPTY_CONTEXT as EMPTY_GIG_CONTEXT };
