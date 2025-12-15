import { useState } from "react";
import "./App.css";
import { MultiSelect } from "./MultiSelect";

// 1,2,3
// D,S,O
// G,P,R
// S,L,E (Solid, Striped, Empty)
const numbers = ["1", "2", "3"];
const colors = ["Red", "Green", "Purple"];
const fills = ["Solid", "Striped", "Empty"];
const shapes = ["Diamond", "Oval", "Squiggle"];
const characteristics = [numbers, colors, fills, shapes];

const cards: string[] = [];
for (const a of characteristics[0]) {
  for (const b of characteristics[1]) {
    for (const c of characteristics[2]) {
      for (const d of characteristics[3]) {
        cards.push(`${a}-${b}-${c}-${d}`);
      }
    }
  }
}

const calculateMatch = (a: string, b: string): string => {
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
};

const checkSet = (cards: string[]) => {
  if (cards.length < 3) return false;

  const available = new Set(cards);
  for (let a = 0; a < cards.length - 1; a++) {
    for (let b = a + 1; b < cards.length; b++) {
      const third = calculateMatch(cards[a], cards[b]);
      if (available.has(third)) return true;
    }
  }
  return false;
};

function App() {
  const [hasCardsSelected, setHasCardsSelected] = useState(false);
  const [hasSet, setHasSet] = useState(false);

  // const toggleCard = useCallback(
  //   // eslint-disable-next-line react-hooks/preserve-manual-memoization
  //   (card: string) => {
  //     const index = cardsSelected.findIndex((el) => el === card);
  //     if (index >= 0) {
  //       cardsSelected.splice(index, 1);
  //     } else {
  //       cardsSelected.push(card);
  //     }

  //   },
  //   [setHasSet, setHasCardsSelected]
  // );

  return (
    <>
      <h1>Check for a Set</h1>
      <div
        style={{
          display: hasCardsSelected ? "block" : "none",
          visibility: hasCardsSelected ? "visible" : "hidden",
        }}
      >
        <p>Has Set?: {hasSet ? "yes" : "no"}</p>
      </div>
      <p>Select cards</p>
      <MultiSelect
        options={cards.map((c) => ({
          label: c.split("-").join(" "),
          value: c,
        }))}
        onChange={(cards: string[]) => {
          setHasSet(checkSet(cards));
          setHasCardsSelected(cards.length > 0);
        }}
      />
    </>
  );
}

export default App;
