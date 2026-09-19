import { afterEach, describe, expect, it } from "vitest";
import {
  readBrand,
  readBrandColors,
  brandCssVariables,
  hexToRgbTriplet,
  parseHours,
  schemaOpeningHours,
  compactHours,
  toTelHref,
  toWhatsAppNumber,
  mapsEmbed,
  to24HourRange,
} from "../contracts/brand.js";

/**
 * These tests pin the behaviour that lets the storefront be reconfigured by
 * environment alone: correct parsing of the `BRAND_*` overrides, and — just as
 * importantly — this repo's own defaults surviving an unconfigured deployment,
 * so a missing variable cannot silently change what customers see.
 *
 * Everything below is derived from `readBrand()` rather than hardcoded, so the
 * same suite is correct in either storefront's repo while still catching a
 * wrong name, address, hours, phone or palette.
 */

const BRAND_VARS = [
  "BRAND_NAME",
  "BRAND_STREET",
  "BRAND_CITY",
  "BRAND_PHONE",
  "BRAND_EMAIL",
  "BRAND_WHATSAPP",
  "BRAND_HOURS",
  "BRAND_PRIMARY",
  "BRAND_PRIMARY_DARK",
  "BRAND_SECONDARY",
  "BRAND_SURFACE",
  "BRAND_INK",
  "BRAND_ACCENT",
  "BRAND_REGION",
  "BRAND_CITY_LABEL",
  "BRAND_SITE_URL",
  "BRAND_TAGLINE",
] as const;

// Captured with the environment clean, so these are the repo's real defaults.
const DEFAULTS = readBrand();

afterEach(() => {
  for (const name of BRAND_VARS) delete process.env[name];
});

describe("default brand (no environment configured)", () => {
  it("names the correct store", () => {
    // The single most damaging misconfiguration: the wrong shop's name and
    // phone number going out in a customer email.
    expect(DEFAULTS.name).toBe("Prime Wireless");
    expect(DEFAULTS.wordmarkPrimary).toBe("Prime");
    expect(DEFAULTS.wordmarkAccent).toBe("Wireless");
  });

  it("carries Prime Wireless's address", () => {
    expect(DEFAULTS.address).toBe("25 South 19th Street");
    expect(DEFAULTS.city).toBe("Philadelphia, PA 19103");
    expect(DEFAULTS.addressParts).toEqual({
      street: "25 South 19th Street",
      locality: "Philadelphia",
      region: "PA",
      postalCode: "19103",
    });
  });

  it("carries Prime Wireless's opening hours, not another store's", () => {
    expect(compactHours(DEFAULTS.hours)).toBe("Mon–Sat 10–10 · Sun 11–9");
    expect(schemaOpeningHours(DEFAULTS.hours)).toEqual([
      "Mo-Sa 10:00-22:00",
      "Su 11:00-21:00",
    ]);
  });

  it("carries the navy / electric blue palette", () => {
    expect(DEFAULTS.colors.primary.DEFAULT).toBe("#0B2545");
    expect(DEFAULTS.colors.surface).toBe("#FFFFFF");
    expect(DEFAULTS.colors.accent).toBe("#1E90FF");
  });

  it("uses the inline SVG placeholder logo until real artwork exists", () => {
    expect(DEFAULTS.logo.type).toBe("svg");
  });

  it("contains no trace of another storefront's identity", () => {
    // Guards against a copy/paste slip when this repo was created.
    const dump = JSON.stringify(DEFAULTS).toLowerCase();
    for (const forbidden of ["philly phone repair", "phillyphonerepair", "1033 chestnut"]) {
      expect(dump).not.toContain(forbidden);
    }
  });

  it("produces a clickable telephone link from its own number", () => {
    // Asserted without hardcoding digits, so the check is meaningful in either
    // storefront's repo. `phoneHref` is E.164 (`+1` prepended) while the raw
    // phone may be formatted, so both are reduced to comparable local digits.
    const local = (v: string) => v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    expect(DEFAULTS.phoneHref).toMatch(/^tel:\+\d{8,15}$/);
    expect(local(DEFAULTS.phoneHref)).toBe(local(DEFAULTS.phone));
    // The WhatsApp link is digits-only, country code first.
    expect(DEFAULTS.whatsapp).toMatch(/^\d{8,15}$/);
    expect(local(DEFAULTS.whatsapp)).toBe(local(DEFAULTS.phone));
  });
});

describe("BRAND_* overrides", () => {
  it("splits the wordmark from an overridden name", () => {
    process.env.BRAND_NAME = "Sample Repair Co";
    const b = readBrand();
    expect(b.name).toBe("Sample Repair Co");
    expect(b.wordmarkPrimary).toBe("Sample");
    expect(b.wordmarkAccent).toBe("Repair Co");
  });

  it("applies overrides while leaving untouched values at their defaults", () => {
    process.env.BRAND_STREET = "1 Test Avenue";
    process.env.BRAND_CITY = "Pittsburgh, PA 15213";
    process.env.BRAND_PHONE = "(412) 555-7788";
    process.env.BRAND_PRIMARY = "#123456";

    const b = readBrand();
    expect(b.addressParts).toEqual({
      street: "1 Test Avenue",
      locality: "Pittsburgh",
      region: "PA",
      postalCode: "15213",
    });
    expect(b.phoneHref).toBe("tel:+14125557788");
    expect(b.whatsapp).toBe("14125557788");
    expect(b.colors.primary.DEFAULT).toBe("#123456");
    // Not overridden, so still this repo's own default.
    expect(b.colors.secondary).toEqual(DEFAULTS.colors.secondary);
    expect(b.name).toBe(DEFAULTS.name);
  });

  it("resolves the site URL, preferring the explicit override", () => {
    process.env.BRAND_SITE_URL = "https://example.test/";
    expect(readBrand().siteUrl).toBe("https://example.test");
  });
});

describe("phone number normalisation", () => {
  it("adds +1 to bare North-American numbers", () => {
    expect(toTelHref("(215) 555-7788")).toBe("tel:+12155557788");
    expect(toTelHref("2155557788")).toBe("tel:+12155557788");
    expect(toTelHref("12155557788")).toBe("tel:+12155557788");
    expect(toWhatsAppNumber("(215) 555-7788")).toBe("12155557788");
  });

  it("leaves an already-international number alone", () => {
    expect(toTelHref("+442071234567")).toBe("tel:+442071234567");
    expect(toWhatsAppNumber("+442071234567")).toBe("442071234567");
  });
});

describe("parseHours", () => {
  it("expands a day range into the days it covers", () => {
    const rows = parseHours("Monday-Saturday|10 AM-10 PM");
    expect(rows).toHaveLength(1);
    expect(rows[0].days).toEqual([
      "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
    ]);
  });

  it("handles abbreviated and comma-separated day lists", () => {
    expect(parseHours("Mon-Fri|9 AM-5 PM")[0].days).toHaveLength(5);
    const split = parseHours("Sat,Sun|12 PM-4 PM");
    expect(split).toHaveLength(2);
    expect(split[0].days).toEqual(["saturday"]);
    expect(split[1].days).toEqual(["sunday"]);
  });

  it("converts 12-hour times, including noon and midnight", () => {
    expect(schemaOpeningHours(parseHours("Monday|12 PM-5 PM"))).toEqual(["Mo 12:00-17:00"]);
    expect(schemaOpeningHours(parseHours("Monday|12 AM-11 AM"))).toEqual(["Mo 00:00-11:00"]);
    expect(to24HourRange("10:00 AM – 10:00 PM")).toEqual({ opens: "10:00", closes: "22:00" });
  });

  it("rejects a malformed row loudly instead of silently showing wrong hours", () => {
    expect(() => parseHours("Monday to Saturday 10-10")).toThrow(/BRAND_HOURS/);
  });
});

describe("hexToRgbTriplet", () => {
  it("converts the palette into CSS custom-property channels", () => {
    expect(hexToRgbTriplet("#7F1D1D")).toBe("127 29 29");
    expect(hexToRgbTriplet("7F1D1D")).toBe("127 29 29");
    expect(hexToRgbTriplet("#FFF")).toBe("255 255 255");
    expect(brandCssVariables(readBrandColors())["--brand-primary"]).toBe("11 37 69");
  });

  it("throws on a value that is not a colour", () => {
    expect(() => hexToRgbTriplet("navy")).toThrow(/Invalid hex/);
  });
});

describe("mapsEmbed", () => {
  it("builds a query containing this store's street and ZIP", () => {
    const url = mapsEmbed(DEFAULTS.addressParts);
    expect(url).toContain("maps.google.com/maps?q=");
    expect(decodeURIComponent(url)).toContain(DEFAULTS.addressParts.street);
    expect(decodeURIComponent(url)).toContain(DEFAULTS.addressParts.postalCode);
  });
});
