(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./italian-deck'));
  } else {
    root.BlackjackEngine = factory(root.ItalianDeck);
  }
}(typeof globalThis === 'object' ? globalThis : this, function (deckTools) {
  'use strict';

  function cardValue(card) {
    if (card.rank === 1) return 11;
    return Math.min(card.rank, 10);
  }

  function scoreHand(hand) {
    let score = hand.reduce((total, card) => total + cardValue(card), 0);
    let aces = hand.filter((card) => card.rank === 1).length;
    while (score > 21 && aces > 0) {
      score -= 10;
      aces -= 1;
    }
    return score;
  }

  function createGame(random = Math.random) {
    const deck = deckTools.createFrenchDeck(0, 1, random);
    const player = [deck.pop(), deck.pop()];
    const dealer = [deck.pop(), deck.pop()];
    const state = { deck, player, dealer, status: 'playing', doubled: false, winner: null };
    if (scoreHand(player) === 21) stand(state);
    return state;
  }

  function hit(state) {
    if (state.status !== 'playing') throw new Error('La partita è già terminata.');
    state.player.push(state.deck.pop());
    if (scoreHand(state.player) > 21) {
      state.status = 'finished';
      state.winner = 'dealer';
    }
    return state;
  }

  function stand(state) {
    if (state.status !== 'playing') throw new Error('La partita è già terminata.');
    while (scoreHand(state.dealer) < 17 && state.deck.length > 0) state.dealer.push(state.deck.pop());
    const playerScore = scoreHand(state.player);
    const dealerScore = scoreHand(state.dealer);
    state.status = 'finished';
    state.winner = dealerScore > 21 || playerScore > dealerScore ? 'player' : dealerScore > playerScore ? 'dealer' : 'push';
    return state;
  }

  function doubleDown(state) {
    if (state.status !== 'playing') throw new Error('La partita è già terminata.');
    if (state.player.length !== 2) {
      throw new Error('Il raddoppio è disponibile solo dopo le prime due carte.');
    }
    state.doubled = true;
    state.player.push(state.deck.pop());
    if (scoreHand(state.player) > 21) {
      state.status = 'finished';
      state.winner = 'dealer';
      return state;
    }
    return stand(state);
  }

  return { createGame, scoreHand, hit, stand, doubleDown };
}));
