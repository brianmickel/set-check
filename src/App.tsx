import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "/vite.svg";
import "./App.css";

// 1,2,3
// D,S,O
// G,P,R
// S,L,E (Solid, Striped, Empty)

const cards: string[] = [];
for (const n of ["1", "2", "3"]) {
  for (const s of ["Diamond", "Oval", "Squiggle"]) {
    for (const c of ["Red", "Green", "Purple"]) {
      for (const f of ["Solid", "Striped", "Empty"]) {
        cards.push(`${n}-${s}-${c}-${f}`);
      }
    }
  }
}

function App() {
  return (
    <>
      <h1>Set Check</h1>
      <p>UNDER CONSTRUCTION</p>
      <div style={{ width: "100%", display: "flex", flexWrap: "wrap" }}>
        {cards.map((c) => (
          <div style={{ padding: "2px", whiteSpace: "nowrap" }}>
            <button>{c}</button>
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
