import { describe, expect, test, beforeEach } from "bun:test";

import { MetadataMode, setMetadata, getMetadata, skipMetadata, warnOnIgnoredMetadata } from "../src/config";

describe("config", () => {
  beforeEach(() => {
    setMetadata(MetadataMode.IGNORE);
  });

  test("setMetadata and getMetadata round-trip with enum", () => {
    setMetadata(MetadataMode.STRICT);
    expect(getMetadata()).toBe(MetadataMode.STRICT);

    setMetadata(MetadataMode.ALLOW);
    expect(getMetadata()).toBe(MetadataMode.ALLOW);

    setMetadata(MetadataMode.IGNORE);
    expect(getMetadata()).toBe(MetadataMode.IGNORE);
  });

  test("setMetadata accepts string values", () => {
    setMetadata("strict");
    expect(getMetadata()).toBe(MetadataMode.STRICT);

    setMetadata("allow");
    expect(getMetadata()).toBe(MetadataMode.ALLOW);

    setMetadata("ignore");
    expect(getMetadata()).toBe(MetadataMode.IGNORE);
  });

  test("setMetadata is case insensitive", () => {
    setMetadata("STRICT");
    expect(getMetadata()).toBe(MetadataMode.STRICT);

    setMetadata("Allow");
    expect(getMetadata()).toBe(MetadataMode.ALLOW);

    setMetadata("IGNORE");
    expect(getMetadata()).toBe(MetadataMode.IGNORE);
  });

  test("setMetadata throws on invalid mode", () => {
    expect(() => setMetadata("invalid")).toThrow(/Invalid metadata mode/);
    expect(() => setMetadata("random")).toThrow(/Invalid metadata mode/);
  });

  test("skipMetadata sets mode to IGNORE", () => {
    setMetadata(MetadataMode.STRICT);
    skipMetadata();
    expect(getMetadata()).toBe(MetadataMode.IGNORE);
  });

  test("skipMetadata with skipWarning flag", () => {
    skipMetadata({ skipWarning: true });
    expect(warnOnIgnoredMetadata()).toBe(false);

    skipMetadata({ skipWarning: false });
    expect(warnOnIgnoredMetadata()).toBe(true);
  });

  test("warnOnIgnoredMetadata returns warning state", () => {
    skipMetadata({ skipWarning: false });
    expect(warnOnIgnoredMetadata()).toBe(true);

    skipMetadata({ skipWarning: true });
    expect(warnOnIgnoredMetadata()).toBe(false);
  });

  test("default mode is IGNORE", () => {
    expect(getMetadata()).toBe(MetadataMode.IGNORE);
  });
});
