import assert from "node:assert/strict";
import test from "node:test";
import * as G from "../utils/gigContext.js";

const catalog = {
  sellerUsername: "programerikram",
  gigs: [
    { slug: "create-wordpress-website-design", gigId: "414892690", url: "https://www.fiverr.com/programerikram/create-wordpress-website-design", title: "I will create wordpress website design", currency: "USD",
      packages: [
        { tier: "Basic", name: "Basic", price: 50, deliveryDays: 3, revisions: "2", features: [{ name: "Number of pages", value: "1" }], extraFast: { price: 20, deliveryDays: 1 } },
        { tier: "Standard", name: "Business", price: 120, deliveryDays: 5, features: [{ name: "E-commerce", included: false }] },
        { tier: "Premium", name: "Premium", price: 180, deliveryDays: 7, revisions: "Unlimited", features: [] },
      ],
      extras: [{ title: "Additional page", price: 25, deliveryDays: 1 }] },
    { slug: "fix-wordpress-errors", url: "https://www.fiverr.com/programerikram/fix-wordpress-errors", title: "I will fix wordpress errors", startingPrice: 15, packages: [] },
  ],
};
const ref = { slug: "create-wordpress-website-design", title: "I will create wordpress website design", url: catalog.gigs[0].url };
const messages = [
  { text: "Hey, can you help me with my website on elementor", isFromMe: false, relatedGig: ref },
  { text: "Here's your custom offer", isFromMe: true, customOffer: { price: "$130", gigTitle: "I will create wordpress website design", includes: ["5 Days Delivery"], status: "pending" } },
];

test("related gig is matched and described with packages, extras, offers, notes and rules", () => {
  const ctx = G.buildGigPricingContext({ catalogs: { programerikram: catalog }, messages, pricing: { generalRules: "Hourly $20", gigNotes: { "create-wordpress-website-design": "Each extra page $25" } }, sellerUsername: "ProgramerIkram" });
  assert.equal(ctx.relatedGig.slug, "create-wordpress-website-design");
  assert.equal(ctx.hasPricingData, true);
  assert.match(ctx.block, /RELATED GIG — the buyer contacted you from this gig/);
  assert.match(ctx.block, /Basic: \$50 \| 3-day delivery \| 2 revision\(s\) \| extra-fast 1-day delivery \+\$20/);
  assert.match(ctx.block, /Standard \("Business"\): \$120/);
  assert.match(ctx.block, /E-commerce: not included/);
  assert.match(ctx.block, /Additional page \+\$25 \(\+1 day\(s\)\)/);
  assert.match(ctx.block, /Your other gigs .*\n- I will fix wordpress errors — from \$15/);
  assert.match(ctx.block, /\$130 — gig "I will create wordpress website design" — 5 Days Delivery — status: pending/);
  assert.match(ctx.block, /Seller's pricing rules for this gig: Each extra page \$25/);
  assert.match(ctx.block, /Seller's general pricing rules: Hourly \$20/);
  assert.match(ctx.block, /HOW TO PRICE FROM THE GIGS/);
});

test("unknown related gig says packages are not loaded and has no pricing data", () => {
  const ctx = G.buildGigPricingContext({ catalogs: {}, messages: [messages[0]] });
  assert.equal(ctx.relatedGig, null);
  assert.equal(ctx.hasPricingData, false);
  assert.match(ctx.block, /Its packages are not loaded yet/);
});

test("no gig on the thread infers from the catalog; disabled gigs are hidden", () => {
  const ctx = G.buildGigPricingContext({ catalogs: [catalog], messages: [{ text: "hi" }], pricing: { disabledGigs: { "fix-wordpress-errors": true } } });
  assert.match(ctx.block, /No gig is attached to this conversation/);
  assert.doesNotMatch(ctx.block, /fix wordpress errors/);
  assert.equal(ctx.hasPricingData, true);
});

test("custom offer gig title is used when no relates-to card exists", () => {
  const ctx = G.buildGigPricingContext({ catalogs: [catalog], messages: [messages[1]] });
  assert.match(ctx.block, /LIKELY GIG/);
  assert.equal(ctx.relatedGig.slug, "create-wordpress-website-design");
});

test("empty input gives an empty block", () => {
  assert.equal(G.buildGigPricingContext({ catalogs: {}, messages: [{ text: "hi" }] }).block, "");
});

test("message cards, refs order, and referenced URL collection", () => {
  assert.equal(G.describeMessageCards(messages[0]), '(This message relates to your gig: "I will create wordpress website design")');
  assert.match(G.describeMessageCards(messages[1]), /^\(Custom offer card: \$130/);
  const other = { slug: "fix-wordpress-errors", title: "Fix", url: catalog.gigs[1].url };
  const refs = G.findConversationGigRefs([{ relatedGig: ref }, { relatedGig: other }, { relatedGig: ref }]);
  assert.deepEqual(refs.map((r) => r.slug), ["fix-wordpress-errors", "create-wordpress-website-design"]);
  const shared = [{ relatedGig: ref }, { relatedGig: { url: "javascript:x" } }];
  assert.deepEqual(G.collectReferencedGigUrls({ a: shared, b: shared, c: [{ relatedGig: other }] }), [ref.url, other.url]);
  assert.equal(G.formatMoney(12.5, "EUR"), "EUR 12.50");
});
