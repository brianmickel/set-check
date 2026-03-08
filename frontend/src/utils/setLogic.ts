import type { CardWithBbox } from "../api";

const numbers = ["1", "2", "3"];
const colors = ["Red", "Green", "Purple"];
const fills = ["Solid", "Striped", "Empty"];
const shapes = ["Diamond", "Oval", "Squiggle"];

const characteristics = [numbers, colors, fills, shapes];

export const allCards: string[] = [];
for (const a of numbers) {
  for (const b of colors) {
    for (const c of fills) {
      for (const d of shapes) {
        allCards.push(`${a}-${b}-${c}-${d}`);
      }
    }
  }
}

function calculateMatch(a: string, b: string): string {
  const partsA = a.split("-");
  const partsB = b.split("-");
  const partsMatch: string[] = [];
  for (let i = 0; i < 4; i++) {
    if (partsA[i] === partsB[i]) {
      partsMatch.push(partsA[i]);
    } else {
      const options = new Set(characteristics[i]);
      options.delete(partsA[i]);
      options.delete(partsB[i]);
      partsMatch.push([...options.values()][0]);
    }
  }
  return partsMatch.join("-");
}

export function findAllSets(cards: string[]): string[][] {
  const sets: string[][] = [];
  const seen = new Set<string>();
  const available = new Set(cards);
  for (let i = 0; i < cards.length - 1; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const third = calculateMatch(cards[i], cards[j]);
      if (third !== cards[i] && third !== cards[j] && available.has(third)) {
        const triplet = [cards[i], cards[j], third].sort();
        const key = triplet.join("|");
        if (!seen.has(key)) {
          seen.add(key);
          sets.push(triplet);
        }
      }
    }
  }
  return sets;
}

export function sortCardsByTopLeft(cards: CardWithBbox[]): CardWithBbox[] {
  return [...cards].sort((a, b) => {
    if (a.bbox[1] !== b.bbox[1]) return a.bbox[1] - b.bbox[1];
    return a.bbox[0] - b.bbox[0];
  });
}
