import { describe, it, expect } from "vitest";
import {
  parseCard,
  buildCard,
  findAllSets,
  sortCardsByTopLeft,
  allCards,
  numbers,
  colors,
  fills,
  shapes,
} from "./setLogic";

describe("parseCard", () => {
  it("parses a valid card string", () => {
    expect(parseCard("1-Red-Solid-Diamond")).toEqual({
      number: "1",
      color: "Red",
      fill: "Solid",
      shape: "Diamond",
    });
    expect(parseCard("3-Purple-Striped-Squiggle")).toEqual({
      number: "3",
      color: "Purple",
      fill: "Striped",
      shape: "Squiggle",
    });
  });

  it("normalizes Outlined to Empty", () => {
    expect(parseCard("2-Green-Outlined-Oval")).toEqual({
      number: "2",
      color: "Green",
      fill: "Empty",
      shape: "Oval",
    });
  });

  it("returns fallbacks for invalid or partial strings", () => {
    expect(parseCard("")).toEqual({
      number: "1",
      color: "Red",
      fill: "Solid",
      shape: "Diamond",
    });
    expect(parseCard("1-Red")).toEqual({
      number: "1",
      color: "Red",
      fill: "Solid",
      shape: "Diamond",
    });
    expect(parseCard("bad-card")).toEqual({
      number: "1",
      color: "Red",
      fill: "Solid",
      shape: "Diamond",
    });
  });
});

describe("buildCard", () => {
  it("builds card string from parts", () => {
    expect(
      buildCard({ number: "1", color: "Red", fill: "Solid", shape: "Diamond" })
    ).toBe("1-Red-Solid-Diamond");
    expect(
      buildCard({ number: "3", color: "Purple", fill: "Empty", shape: "Squiggle" })
    ).toBe("3-Purple-Empty-Squiggle");
  });

  it("round-trips with parseCard", () => {
    const card = "2-Green-Striped-Oval";
    expect(buildCard(parseCard(card))).toBe(card);
    const withOutlined = "1-Purple-Outlined-Diamond";
    expect(buildCard(parseCard(withOutlined))).toBe("1-Purple-Empty-Diamond");
  });
});

describe("findAllSets", () => {
  it("returns empty array when fewer than 3 cards", () => {
    expect(findAllSets([])).toEqual([]);
    expect(findAllSets(["1-Red-Solid-Diamond"])).toEqual([]);
    expect(findAllSets(["1-Red-Solid-Diamond", "2-Red-Solid-Diamond"])).toEqual([]);
  });

  it("finds a set when three cards form a valid set", () => {
    // 1-Red-Solid-Diamond, 2-Red-Solid-Diamond, 3-Red-Solid-Diamond (same color, fill, shape; different number)
    const cards = [
      "1-Red-Solid-Diamond",
      "2-Red-Solid-Diamond",
      "3-Red-Solid-Diamond",
    ];
    const sets = findAllSets(cards);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toContain("1-Red-Solid-Diamond");
    expect(sets[0]).toContain("2-Red-Solid-Diamond");
    expect(sets[0]).toContain("3-Red-Solid-Diamond");
  });

  it("finds multiple sets when present", () => {
    // Two sets: (1,2,3) Red-Solid-Diamond and (1,2,3) Green-Solid-Diamond
    const cards = [
      "1-Red-Solid-Diamond",
      "2-Red-Solid-Diamond",
      "3-Red-Solid-Diamond",
      "1-Green-Solid-Diamond",
      "2-Green-Solid-Diamond",
      "3-Green-Solid-Diamond",
    ];
    const sets = findAllSets(cards);
    expect(sets.length).toBeGreaterThanOrEqual(2);
  });

  it("does not count duplicate sets", () => {
    const cards = [
      "1-Red-Solid-Diamond",
      "2-Red-Solid-Diamond",
      "3-Red-Solid-Diamond",
    ];
    const sets = findAllSets(cards);
    expect(sets).toHaveLength(1);
  });

  it("returns empty when no set exists", () => {
    // 1-Red, 2-Red, 1-Green: numbers and colors are neither all same nor all different
    const cards = [
      "1-Red-Solid-Diamond",
      "2-Red-Solid-Diamond",
      "1-Green-Solid-Diamond",
    ];
    const sets = findAllSets(cards);
    expect(sets).toEqual([]);
  });
});

describe("sortCardsByTopLeft", () => {
  it("sorts by y then x (top-left order)", () => {
    const cards = [
      { card: "1-Red-Solid-Diamond", bbox: [0.5, 0.5, 0.2, 0.2] as [number, number, number, number] },
      { card: "2-Green-Solid-Diamond", bbox: [0.1, 0.1, 0.2, 0.2] as [number, number, number, number] },
      { card: "3-Purple-Solid-Diamond", bbox: [0.3, 0.1, 0.2, 0.2] as [number, number, number, number] },
    ];
    const sorted = sortCardsByTopLeft(cards);
    expect(sorted[0].card).toBe("2-Green-Solid-Diamond");
    expect(sorted[1].card).toBe("3-Purple-Solid-Diamond");
    expect(sorted[2].card).toBe("1-Red-Solid-Diamond");
  });

  it("does not mutate original array", () => {
    const cards = [
      { card: "1-Red-Solid-Diamond", bbox: [0.5, 0.5, 0.2, 0.2] as [number, number, number, number] },
      { card: "2-Green-Solid-Diamond", bbox: [0.1, 0.1, 0.2, 0.2] as [number, number, number, number] },
    ];
    const copy = [...cards];
    sortCardsByTopLeft(cards);
    expect(cards[0].bbox[0]).toBe(0.5);
    expect(cards).toEqual(copy);
  });
});

describe("allCards", () => {
  it("has 81 cards (3×3×3×3)", () => {
    expect(allCards).toHaveLength(81);
  });

  it("each card has four segments", () => {
    for (const card of allCards) {
      const parts = card.split("-");
      expect(parts).toHaveLength(4);
      expect(numbers).toContain(parts[0]);
      expect(colors).toContain(parts[1]);
      expect(fills).toContain(parts[2]);
      expect(shapes).toContain(parts[3]);
    }
  });

  it("has no duplicates", () => {
    const set = new Set(allCards);
    expect(set.size).toBe(81);
  });
});
