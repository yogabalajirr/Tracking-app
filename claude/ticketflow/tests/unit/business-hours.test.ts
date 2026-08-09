import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addBusinessMinutes,
  businessMinutesBetween,
  DEFAULT_BUSINESS_HOURS,
  isWithinBusinessHours,
  parseBusinessHours,
} from "../../src/lib/business-hours";

const TZ = "Asia/Kolkata";
const H = DEFAULT_BUSINESS_HOURS; // Mon–Fri 09:00–18:00

/** Render an instant as wall-clock time in a timezone, for readable assertions. */
const wall = (d: Date, tz = TZ) => d.toLocaleString("sv-SE", { timeZone: tz });

describe("addBusinessMinutes", () => {
  it("adds within a single open day", () => {
    // Thu 2026-08-06 10:00 IST + 4h
    const got = addBusinessMinutes(new Date("2026-08-06T04:30:00Z"), 240, TZ, H);
    assert.equal(wall(got), "2026-08-06 14:00:00");
  });

  it("spills into the next working day", () => {
    // Thu 17:00 IST + 4h = 1h Thu + 3h Fri
    const got = addBusinessMinutes(new Date("2026-08-06T11:30:00Z"), 240, TZ, H);
    assert.equal(wall(got), "2026-08-07 12:00:00");
  });

  it("skips the weekend", () => {
    // Fri 17:00 IST + 4h = 1h Fri + 3h Mon
    const got = addBusinessMinutes(new Date("2026-08-07T11:30:00Z"), 240, TZ, H);
    assert.equal(wall(got), "2026-08-10 12:00:00");
  });

  it("starts at Monday opening when raised on a Saturday", () => {
    const got = addBusinessMinutes(new Date("2026-08-08T06:30:00Z"), 60, TZ, H);
    assert.equal(wall(got), "2026-08-10 10:00:00");
  });

  it("waits for opening time when raised before hours", () => {
    // Thu 06:00 IST + 30m
    const got = addBusinessMinutes(new Date("2026-08-06T00:30:00Z"), 30, TZ, H);
    assert.equal(wall(got), "2026-08-06 09:30:00");
  });

  it("lands exactly on closing time", () => {
    // Thu 09:00 IST + 9h
    const got = addBusinessMinutes(new Date("2026-08-06T03:30:00Z"), 540, TZ, H);
    assert.equal(wall(got), "2026-08-06 18:00:00");
  });

  it("skips configured holidays", () => {
    const withHoliday = { ...H, holidays: ["2026-08-07"] };
    // Thu 17:00 + 4h, but Friday is a holiday → 1h Thu + 3h Mon
    const got = addBusinessMinutes(new Date("2026-08-06T11:30:00Z"), 240, TZ, withHoliday);
    assert.equal(wall(got), "2026-08-10 12:00:00");
  });

  it("falls back to wall-clock when no hours are configured", () => {
    const always = {
      days: { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] },
      holidays: [],
    };
    const got = addBusinessMinutes(new Date("2026-08-08T06:30:00Z"), 60, TZ, always);
    assert.equal(wall(got), "2026-08-08 13:00:00");
  });

  it("honours a non-IST workspace timezone", () => {
    // Thu 09:30 EDT + 4h = 13:30 EDT
    const got = addBusinessMinutes(
      new Date("2026-08-06T13:30:00Z"),
      240,
      "America/New_York",
      H,
    );
    assert.equal(wall(got, "America/New_York"), "2026-08-06 13:30:00");
  });

  it("returns the start instant for a non-positive duration", () => {
    const start = new Date("2026-08-06T04:30:00Z");
    assert.equal(addBusinessMinutes(start, 0, TZ, H).getTime(), start.getTime());
  });
});

describe("businessMinutesBetween", () => {
  it("counts only open minutes across a weekend", () => {
    // Fri 17:00 IST → Mon 11:00 IST = 1h Fri + 2h Mon
    const got = businessMinutesBetween(
      new Date("2026-08-07T11:30:00Z"),
      new Date("2026-08-10T05:30:00Z"),
      TZ,
      H,
    );
    assert.equal(got, 180);
  });

  it("is zero when the range is inverted", () => {
    const got = businessMinutesBetween(
      new Date("2026-08-10T05:30:00Z"),
      new Date("2026-08-07T11:30:00Z"),
      TZ,
      H,
    );
    assert.equal(got, 0);
  });

  it("round-trips with addBusinessMinutes", () => {
    const start = new Date("2026-08-06T11:30:00Z");
    const due = addBusinessMinutes(start, 500, TZ, H);
    assert.equal(Math.round(businessMinutesBetween(start, due, TZ, H)), 500);
  });
});

describe("isWithinBusinessHours", () => {
  it("is true inside an open range", () => {
    assert.equal(isWithinBusinessHours(new Date("2026-08-06T04:30:00Z"), TZ, H), true);
  });

  it("is false at the weekend", () => {
    assert.equal(isWithinBusinessHours(new Date("2026-08-08T06:30:00Z"), TZ, H), false);
  });

  it("is false before opening", () => {
    assert.equal(isWithinBusinessHours(new Date("2026-08-06T00:30:00Z"), TZ, H), false);
  });
});

describe("parseBusinessHours", () => {
  it("falls back to the default for malformed input", () => {
    assert.deepEqual(parseBusinessHours(null), DEFAULT_BUSINESS_HOURS);
    assert.deepEqual(parseBusinessHours("nope"), DEFAULT_BUSINESS_HOURS);
    assert.deepEqual(parseBusinessHours({ nope: true }), DEFAULT_BUSINESS_HOURS);
  });

  it("preserves a valid stored value", () => {
    const stored = { days: { "1": [{ start: "10:00", end: "16:00" }] }, holidays: ["2026-01-01"] };
    assert.deepEqual(parseBusinessHours(stored), stored);
  });
});
