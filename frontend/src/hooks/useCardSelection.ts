import { useState, useCallback } from "react";

export function useCardSelection() {
  const [selectedCards, setSelectedCards] = useState<string[]>([]);

  const toggleCard = useCallback((cardId: string) => {
    setSelectedCards((prev) =>
      prev.includes(cardId) ? prev.filter((c) => c !== cardId) : [...prev, cardId]
    );
  }, []);

  const clearCards = useCallback(() => setSelectedCards([]), []);

  return {
    selectedCards,
    hasCards: selectedCards.length > 0,
    toggleCard,
    setCards: setSelectedCards,
    clearCards,
  };
}
