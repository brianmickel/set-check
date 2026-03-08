import { describe, it, expect } from "vitest";
import { validateCardsForCache } from "./vision.js";

describe("validateCardsForCache", () => {
  it("returns null for non-array", () => {
    expect(validateCardsForCache(null)).toBeNull();
    expect(validateCardsForCache(undefined)).toBeNull();
    expect(validateCardsForCache("")).toBeNull();
    expect(validateCardsForCache({})).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(validateCardsForCache([])).toBeNull();
  });

  it("returns valid array for correct card objects", () => {
    const raw = [
      { card: "1-Red-Solid-Diamond", bbox: [0.1, 0.2, 0.25, 0.35] },
      { card: "2-Green-Striped-Oval", bbox: [0, 0, 1, 1] },
    ];
    const result = validateCardsForCache(raw);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![0]).toEqual({ card: "1-Red-Solid-Diamond", bbox: [0.1, 0.2, 0.25, 0.35] });
    expect(result![1]).toEqual({ card: "2-Green-Striped-Oval", bbox: [0, 0, 1, 1] });
  });

  it("returns null when card string is invalid", () => {
    const raw = [{ card: "not-a-set-card", bbox: [0, 0, 0.5, 0.5] }];
    expect(validateCardsForCache(raw)).toBeNull();
  });

  it("returns null when item has no card property", () => {
    expect(validateCardsForCache([{ bbox: [0, 0, 0.5, 0.5] }])).toBeNull();
  });

  it("returns null when item has no bbox property", () => {
    expect(validateCardsForCache([{ card: "1-Red-Solid-Diamond" }])).toBeNull();
  });

  it("returns null when bbox is not an array of 4 numbers", () => {
    expect(
      validateCardsForCache([{ card: "1-Red-Solid-Diamond", bbox: [0, 0] }])
    ).toBeNull();
    expect(
      validateCardsForCache([{ card: "1-Red-Solid-Diamond", bbox: [0, 0, 0.5, 0.5, 0.1] }])
    ).toBeNull();
    expect(
      validateCardsForCache([{ card: "1-Red-Solid-Diamond", bbox: [0, 0, 0.5, "0.5"] }])
    ).toBeNull();
  });

  it("returns null when bbox values are out of 0-1 range", () => {
    expect(
      validateCardsForCache([{ card: "1-Red-Solid-Diamond", bbox: [0, 0, 1.5, 0.5] }])
    ).toBeNull();
    expect(
      validateCardsForCache([{ card: "1-Red-Solid-Diamond", bbox: [-0.1, 0, 0.5, 0.5] }])
    ).toBeNull();
  });

  it("returns null when any item in array is invalid", () => {
    const raw = [
      { card: "1-Red-Solid-Diamond", bbox: [0.1, 0.2, 0.25, 0.35] },
      { card: "invalid", bbox: [0, 0, 0.5, 0.5] },
    ];
    expect(validateCardsForCache(raw)).toBeNull();
  });
});
