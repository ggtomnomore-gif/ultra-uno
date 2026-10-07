(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CardMelds = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function getMeldType(cards) {
    if (!Array.isArray(cards) || cards.length < 3) return null;
    const jokers = cards.filter((card) => card.joker).length;
    const natural = cards.filter((card) => !card.joker);
    if (natural.length < 2) return null;

    const ranks = new Set(natural.map((card) => card.rank));
    if (ranks.size === 1) {
      const suits = new Set(natural.map((card) => card.suit));
      if (suits.size === natural.length && natural.length <= 4 && jokers <= 4 - natural.length) return 'set';
    }

    const suits = new Set(natural.map((card) => card.suit));
    if (suits.size !== 1) return null;
    const sortedRanks = natural.map((card) => card.rank).sort((left, right) => left - right);
    if (new Set(sortedRanks).size !== sortedRanks.length) return null;
    let gaps = 0;
    for (let index = 1; index < sortedRanks.length; index += 1) gaps += sortedRanks[index] - sortedRanks[index - 1] - 1;
    return gaps <= jokers ? 'run' : null;
  }

  function meldPoints(cards) {
    return cards.reduce((sum, card) => sum + (card.joker ? 25 : card.rank === 1 ? 11 : card.rank >= 11 ? 10 : card.rank), 0);
  }

  return { getMeldType, meldPoints };
}));
