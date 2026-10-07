(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./italian-deck'), require('./melds'));
  } else {
    root.Scala40Engine = factory(root.ItalianDeck, root.CardMelds);
  }
}(typeof globalThis === 'object' ? globalThis : this, function (deckTools, melds) {
  'use strict';

  function createGame(playerNames, random = Math.random) {
    if (!Array.isArray(playerNames) || playerNames.length < 2 || playerNames.length > 6) {
      throw new RangeError('Scala 40 richiede da 2 a 6 giocatori.');
    }
    const deck = deckTools.createFrenchDeck(2, 1, random);
    const players = playerNames.map((name) => ({ name, hand: deck.splice(0, 13), opened: false, table: [] }));
    return { deck, discardPile: [deck.pop()], players, currentPlayer: 0, status: 'playing', drawn: false };
  }

  function drawCard(state, playerIndex, fromDiscard = false) {
    if (state.status !== 'playing' || playerIndex !== state.currentPlayer || state.drawn) throw new Error('Non puoi pescare adesso.');
    if (fromDiscard && state.discardPile.length > 0) state.players[playerIndex].hand.push(state.discardPile.pop());
    else if (state.deck.length > 0) state.players[playerIndex].hand.push(state.deck.pop());
    else throw new Error('Il mazzo è esaurito.');
    state.drawn = true;
    return state.players[playerIndex].hand.at(-1);
  }

  function openMeld(state, playerIndex, cardIds) {
    const player = state.players[playerIndex];
    if (state.status !== 'playing' || state.currentPlayer !== playerIndex || !state.drawn) throw new Error('Pesca prima di aprire una combinazione.');
    if (!player || !Array.isArray(cardIds)) throw new Error('Mossa non valida.');
    const cards = cardIds.map((id) => player.hand.find((card) => card.id === id));
    if (cards.some((card) => !card) || !melds.getMeldType(cards)) throw new Error('La combinazione non è una scala o un tris valido.');
    if (cards.length === player.hand.length) throw new Error('Devi tenere almeno una carta da scartare.');
    if (!player.opened && melds.meldPoints(cards) < 40) throw new Error('Per aprire servono almeno 40 punti.');
    const ids = new Set(cardIds);
    player.hand = player.hand.filter((card) => !ids.has(card.id));
    player.opened = true;
    player.table.push(cards);
    return cards;
  }

  function discard(state, playerIndex, cardId) {
    if (state.status !== 'playing' || playerIndex !== state.currentPlayer || !state.drawn) throw new Error('Pesca prima di scartare.');
    const player = state.players[playerIndex];
    const index = player.hand.findIndex((card) => card.id === cardId);
    if (index < 0) throw new Error('La carta non è nella tua mano.');
    state.discardPile.push(player.hand.splice(index, 1)[0]);
    if (player.hand.length === 0) {
      state.status = 'finished';
      state.winner = playerIndex;
    } else {
      state.currentPlayer = (playerIndex + 1) % state.players.length;
    }
    state.drawn = false;
  }

  return { createGame, drawCard, openMeld, discard, getMeldType: melds.getMeldType };
}));
