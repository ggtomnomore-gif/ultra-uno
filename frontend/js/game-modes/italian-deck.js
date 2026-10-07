(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ItalianDeck = factory();
  }
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const SUITS = ['coins', 'cups', 'swords', 'clubs'];
  const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  let nextId = 0;

  function createItalianDeck(random = Math.random) {
    const deck = SUITS.flatMap((suit) => RANKS.map((rank) => ({
      id: `italian-${++nextId}`,
      suit,
      rank,
      value: rank
    })));
    for (let index = deck.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
    }
    return deck;
  }

  function createFrenchDeck(jokers = 0, decks = 1, random = Math.random) {
    const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
    const cards = [];
    for (let deckIndex = 0; deckIndex < decks; deckIndex += 1) {
      suits.forEach((suit) => {
        for (let rank = 1; rank <= 13; rank += 1) {
          cards.push({ id: `french-${++nextId}`, suit, rank, value: rank, joker: false });
        }
      });
      for (let index = 0; index < jokers; index += 1) {
        cards.push({ id: `french-${++nextId}`, suit: null, rank: 0, value: 0, joker: true });
      }
    }
    for (let index = cards.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [cards[index], cards[swapIndex]] = [cards[swapIndex], cards[index]];
    }
    return cards;
  }

  return { SUITS, RANKS, createItalianDeck, createFrenchDeck };
}));
