/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BRAND CHECK — fails the build when a storefront is misconfigured.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Runs as part of `npm run build`, and by itself via `npm run brand:check`.
 *
 *  Why this exists: a deployment with a half-filled brand configuration looks
 *  completely healthy — the site builds, the pages render — but the store name
 *  is wrong in every email subject, or the phone number is empty, and nobody
 *  notices until a customer does. Because the storefront is chosen entirely by
 *  environment variables, a typo in one variable name silently falls back to
 *  the Philly Phone Repair default. Printing the resolved identity on every
 *  build makes that visible in the deploy log.
 *
 *  It also refuses to build a non-default store that still carries the
 *  `.example` / `555-01xx` placeholders from `.env.prime.example`.
 */
import {
  readBrand,
  schemaOpeningHours,
  compactHours,
  mapsEmbed,
  hexToRgbTriplet,
} from "../contracts/brand.ts";

const brand = readBrand();
const problems: string[] = [];

/** Values that ship as placeholders and must be replaced before launch.
 *  The `555-01xx` range is reserved for fiction, so any number in it is a
 *  placeholder; the check matches the last seven digits and tolerates an area
 *  code (or a leading country code in the WhatsApp variant) in front. */
const PLACEHOLDER_PATTERNS: { pattern: RegExp; what: string }[] = [
  { pattern: /\.example$/i, what: "BRAND_EMAIL still ends in .example" },
  { pattern: /(?:^|\D)555[-. ]?01\d\d$/, what: "BRAND_PHONE is still a 555-01xx placeholder" },
  { pattern: /55501\d\d$/, what: "BRAND_WHATSAPP is still a 555-01xx placeholder" },
];

// ── Required values ────────────────────────────────────────────────────────
const required: [string, string][] = [
  ["name", brand.name],
  ["address", brand.address],
  ["city", brand.city],
  ["phone", brand.phone],
  ["email", brand.email],
  ["siteUrl", brand.siteUrl],
  ["tagline", brand.tagline],
  ["region", brand.region],
];
for (const [label, value] of required) {
  if (!value || !value.trim()) problems.push(`BRAND ${label} is empty.`);
}

if (brand.hours.length === 0) problems.push("No opening hours resolved.");

// ── Structural checks ──────────────────────────────────────────────────────
const url = (() => {
  try {
    return new URL(brand.siteUrl);
  } catch {
    problems.push(`BRAND_SITE_URL is not a valid absolute URL: "${brand.siteUrl}"`);
    return null;
  }
})();
if (url && url.protocol !== "https:") {
  problems.push(`BRAND_SITE_URL should use https:// (got "${brand.siteUrl}").`);
}

if (brand.addressParts.postalCode === "") {
  problems.push(
    `BRAND_CITY could not be parsed for a state/ZIP: "${brand.city}". ` +
      `Expected the form "Philadelphia, PA 19107".`,
  );
}

for (const [label, value] of Object.entries(brand.colors)) {
  const values = typeof value === "string" ? [value] : Object.values(value);
  for (const v of values) {
    try {
      hexToRgbTriplet(v);
    } catch {
      problems.push(`${label} is not a valid hex colour: "${v}"`);
    }
  }
}

// ── Placeholder check ──────────────────────────────────────────────────────
// Enforced for every store. A phone number or inbox that is still a placeholder
// is worse than a missing one: the site builds, the pages render, and the fake
// contact details go out in customer email and SMS unnoticed. This repo ships
// with placeholders until the real values are known, so the build stays blocked
// until they are supplied — which is the point.
for (const [value, { pattern, what }] of [
  [brand.email, PLACEHOLDER_PATTERNS[0]],
  [brand.phone, PLACEHOLDER_PATTERNS[1]],
  [brand.whatsapp, PLACEHOLDER_PATTERNS[2]],
] as [string, { pattern: RegExp; what: string }][]) {
  if (pattern.test(value)) problems.push(`${what} — replace it with the real value.`);
}

// ── Report ─────────────────────────────────────────────────────────────────
const green = "\u001b[32m";
const dim = "\u001b[2m";
const red = "\u001b[31m";
const bold = "\u001b[1m";
const off = "\u001b[0m";

// Were any BRAND_* variables actually supplied, or is everything falling back?
const configuredByEnv = [
  "BRAND_NAME",
  "VITE_BRAND_NAME",
  "BRAND_PHONE",
  "VITE_BRAND_PHONE",
  "BRAND_EMAIL",
  "VITE_BRAND_EMAIL",
  "BRAND_HOURS",
  "VITE_BRAND_HOURS",
  "BRAND_PRIMARY",
  "VITE_BRAND_PRIMARY",
].some((name) => (process.env[name] ?? "").trim() !== "");

console.log(`\n${bold}Brand${off} ${dim}(${configuredByEnv ? "configured by environment" : "built-in defaults"})${off}`);
console.log(`  name      ${green}${brand.name}${off}`);
console.log(`  wordmark  ${brand.wordmarkPrimary} ${dim}/${off} ${brand.wordmarkAccent || dim + "(none)" + off}`);
console.log(`  address   ${brand.address}, ${brand.city}`);
console.log(`  phone     ${brand.phone}  ${dim}->${off} ${brand.phoneHref}  ${dim}wa.me/${brand.whatsapp}${off}`);
console.log(`  email     ${brand.email}`);
console.log(`  hours     ${compactHours(brand.hours)}`);
console.log(`  schema    ${schemaOpeningHours(brand.hours).join(", ")}`);
console.log(`  site      ${brand.siteUrl}`);
console.log(`  logo      ${brand.logo.type} ${dim}${brand.logo.type === "image" ? brand.logo.icon : "(inline svg placeholder)"}${off}`);
console.log(
  `  palette   ${dim}primary${off} ${brand.colors.primary.DEFAULT}` +
    `  ${dim}secondary${off} ${brand.colors.secondary.DEFAULT}` +
    `  ${dim}surface${off} ${brand.colors.surface}` +
    `  ${dim}ink${off} ${brand.colors.ink}` +
    `  ${dim}accent${off} ${brand.colors.accent}`,
);
console.log(`  map       ${dim}${mapsEmbed(brand.addressParts)}${off}`);

if (problems.length > 0) {
  console.error(`\n${red}${bold}Brand configuration problem(s):${off}`);
  for (const p of problems) console.error(`  ${red}✗${off} ${p}`);
  console.error(
    `\n${dim}See .env.prime.example for every supported variable.${off}\n`,
  );
  process.exit(1);
}

console.log(`${green}  ✓ brand configuration valid${off}\n`);
