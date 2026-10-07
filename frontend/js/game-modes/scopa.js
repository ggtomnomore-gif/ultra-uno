(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./italian-deck'));
  } else {
    root.ScopaEngine = factory(root.ItalianDeck);
  }
}(typeof globalThis === 'object' ? globalThis : this, function (deckTools) {
  'use strict';

  function createGame(playerNames, random = Math.random) {
    if (!Array.isArray(playerNames) || playerNames.length !== 2) throw new RangeError('Scopa richiede due giocatori.');
    const deck = deckTools.createItalianDeck(random);
    const players = playerNames.map((name) => ({ name, hand: deck.splice(0, 3), captured: [], scopes: 0 }));
    return { deck, players, table: deck.splice(0, 4), currentPlayer: 0, lastCapturer: null, status: 'playing' };
  }

  function findSubset(cards, targetValue) {
    const matches = [];
    function search(start, sum, subset) {
      if (sum === targetValue && subset.length > 0) {
        matches.push(subset);
        return;
      }
      if (sum >= targetValue) return;
      for (let index = start; index < cards.length; index += 1) {
        search(index + 1, sum + cards[index].value, [...subset, cards[index]]);
      }
    }
    search(0, 0, []);
    return matches;
  }

  function legalCaptures(table, playedCard) {
    const exact = table.filter((card) => card.value === playedCard.value);
    return exact.length ? exact.map((card) => [card]) : findSubset(table, playedCard.value);
  }

  function refillHands(state) {
    if (state.players.every((player) => player.hand.length === 0) && state.deck.length > 0) {
      state.players.forEach((player) => { player.hand.push(...state.deck.splice(0, 3)); });
    }
    if (state.players.every((player) => player.hand.length === 0)) {
      if (state.lastCapturer !== null) state.players[state.lastCapturer].captured.push(...state.table.splice(0));
      state.status = 'finished';
    }
  }

  function playCard(state, playerIndex, cardId, captureIds = []) {
    if (state.status !== 'playing' || state.currentPlayer !== playerIndex) throw new Error('Non è il turno di questo giocatore.');
    const player = state.players[playerIndex];
    const handIndex = player.hand.findIndex((card) => card.id === cardId);
    if (handIndex < 0) throw new Error('La carta non è nella tua mano.');
    const played = player.hand.splice(handIndex, 1)[0];
    const selected = state.table.filter((card) => captureIds.includes(card.id));
    const legal = legalCaptures(state.table, played);
    if (new Set(captureIds).size !== captureIds.length ||
      (legal.length && selected.length === 0) || (captureIds.length && !legal.some((set) => (
      set.length === selected.length && set.every((card) => captureIds.includes(card.id))
    )))) {
      player.hand.splice(handIndex, 0, played);
      throw new Error('Devi eseguire una presa valida quando è possibile.');
    }
    if (selected.length) {
      const capturedIds = new Set(selected.map((card) => card.id));
      state.table = state.table.filter((card) => !capturedIds.has(card.id));
      player.captured.push(played, ...selected);
      state.lastCapturer = playerIndex;
      if (state.table.length === 0) player.scopes += 1;
    } else {
      state.table.push(played);
    }
    state.currentPlayer = (playerIndex + 1) % state.players.length;
    refillHands(state);
    return { captured: selected.length > 0, scopa: selected.length > 0 && state.table.length === 0, status: state.status };
  }

  function roundPoints(state) {
    const summaries = state.players.map((player) => {
      const coins = player.captured.filter((card) => card.suit === 'coins').length;
      const sevenOfCoins = player.captured.some((card) => card.suit === 'coins' && card.rank === 7);
      const bestBySuit = new Map();
      player.captured.forEach((card) => {
        const points = ({ 7: 21, 6: 18, 1: 16, 5: 15, 4: 14, 3: 13, 2: 12 })[card.rank] || 10;
        bestBySuit.set(card.suit, Math.max(bestBySuit.get(card.suit) || 0, points));
      });
      const primiera = bestBySuit.size === 4
        ? Array.from(bestBySuit.values()).reduce((sum, points) => sum + points, 0)
        : 0;
      return { name: player.name, scopes: player.scopes, cards: player.captured.length, coins, sevenOfCoins, primiera };
    });
    const points = summaries.map((summary) => summary.scopes);
    ['cards', 'coins', 'primiera'].forEach((key) => {
      if (summaries[0][key] !== summaries[1][key]) points[summaries[0][key] > summaries[1][key] ? 0 : 1] += 1;
    });
    if (summaries[0].sevenOfCoins !== summaries[1].sevenOfCoins) points[summaries[0].sevenOfCoins ? 0 : 1] += 1;
    return summaries.map((summary, index) => ({ ...summary, points: points[index] }));
  }

  return { createGame, legalCaptures, playCard, roundPoints };
}));
