(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./italian-deck'));
  } else {
    root.PokerEngine = factory(root.ItalianDeck);
  }
}(typeof globalThis === 'object' ? globalThis : this, function (deckTools) {
  'use strict';

  function evaluateFive(cards) {
    if (!Array.isArray(cards) || cards.length !== 5) throw new RangeError('La mano deve contenere cinque carte.');
    const values = cards.map((card) => card.rank === 1 ? 14 : card.rank).sort((left, right) => right - left);
    const counts = new Map();
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    const groups = Array.from(counts, ([value, count]) => ({ value, count }))
      .sort((left, right) => right.count - left.count || right.value - left.value);
    const flush = cards.every((card) => card.suit === cards[0].suit);
    const uniqueValues = Array.from(counts.keys()).sort((left, right) => right - left);
    const wheel = uniqueValues.join(',') === '14,5,4,3,2';
    const straight = uniqueValues.length === 5 && (uniqueValues[0] - uniqueValues[4] === 4 || wheel);
    const straightHigh = wheel ? 5 : uniqueValues[0];
    if (flush && straight) return [8, straightHigh];
    if (groups[0].count === 4) return [7, groups[0].value, groups[1].value];
    if (groups[0].count === 3 && groups[1].count === 2) return [6, groups[0].value, groups[1].value];
    if (flush) return [5, ...values];
    if (straight) return [4, straightHigh];
    if (groups[0].count === 3) return [3, groups[0].value, ...groups.slice(1).map((group) => group.value)];
    if (groups[0].count === 2 && groups[1].count === 2) return [2, groups[0].value, groups[1].value, groups[2].value];
    if (groups[0].count === 2) return [1, groups[0].value, ...groups.slice(1).map((group) => group.value)];
    return [0, ...values];
  }

  function compareHands(left, right) {
    const a = evaluateFive(left);
    const b = evaluateFive(right);
    for (let index = 0; index < a.length; index += 1) {
      if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
    }
    return 0;
  }

  function combinations(cards, size) {
    const results = [];
    function visit(start, selected) {
      if (selected.length === size) {
        results.push(selected);
        return;
      }
      for (let index = start; index <= cards.length - (size - selected.length); index += 1) {
        visit(index + 1, [...selected, cards[index]]);
      }
    }
    visit(0, []);
    return results;
  }

  function evaluateBest(cards) {
    if (cards.length < 5 || cards.length > 7) throw new RangeError('Servono da cinque a sette carte per valutare la mano.');
    return combinations(cards, 5).reduce((best, hand) => {
      if (!best || compareHands(hand, best) > 0) return hand;
      return best;
    }, null);
  }

  function createGame(playerNames, { random = Math.random, startingStack = 1000 } = {}) {
    if (!Array.isArray(playerNames) || playerNames.length < 2 || playerNames.length > 10) {
      throw new RangeError('Poker Texas richiede da 2 a 10 giocatori.');
    }
    if (!Number.isInteger(startingStack) || startingStack < 1) throw new RangeError('Stack iniziale non valido.');
    const deck = deckTools.createFrenchDeck(0, 1, random);
    const players = playerNames.map((name) => ({
      name,
      hand: deck.splice(0, 2),
      stack: startingStack,
      bet: 0,
      contribution: 0,
      folded: false,
      allIn: false
    }));
    return {
      deck, players, community: [], pot: 0, currentBet: 0, minimumRaise: 20,
      currentPlayer: 0, street: 'preflop', acted: new Set(),
      status: 'playing', winners: []
    };
  }

  function activePlayers(state) {
    return state.players.map((player, index) => ({ player, index })).filter(({ player }) => !player.folded && !player.allIn);
  }

  function determineWinners(state) {
    const contributions = Array.from(new Set(state.players.map((player) => player.contribution).filter((value) => value > 0)))
      .sort((left, right) => left - right);
    let previousLevel = 0;
    const payouts = state.players.map(() => 0);
    contributions.forEach((level) => {
      const contributors = state.players.map((player, index) => ({ player, index }))
        .filter(({ player }) => player.contribution >= level);
      const sidePot = (level - previousLevel) * contributors.length;
      previousLevel = level;
      const eligible = contributors.filter(({ player }) => !player.folded);
      if (!eligible.length) return;
      const ranked = eligible.map(({ player, index }) => ({
        index,
        hand: evaluateBest([...player.hand, ...state.community])
      }));
      let bestHand = ranked[0].hand;
      ranked.slice(1).forEach(({ hand }) => {
        if (compareHands(hand, bestHand) > 0) bestHand = hand;
      });
      const winners = ranked.filter(({ hand }) => compareHands(hand, bestHand) === 0);
      const share = Math.floor(sidePot / winners.length);
      winners.forEach(({ index }) => { payouts[index] += share; });
      let remainder = sidePot - share * winners.length;
      for (let index = 0; index < state.players.length && remainder > 0; index += 1) {
        if (winners.some((winner) => winner.index === index)) {
          payouts[index] += 1;
          remainder -= 1;
        }
      }
    });
    state.players.forEach((player, index) => { player.stack += payouts[index]; });
    state.winners = payouts.map((amount, index) => ({ index, amount })).filter((result) => result.amount > 0);
    state.pot = 0;
    state.status = 'finished';
  }

  function advanceStreet(state) {
    const streets = ['preflop', 'flop', 'turn', 'river'];
    const nextStreetIndex = streets.indexOf(state.street) + 1;
    if (nextStreetIndex >= streets.length) {
      determineWinners(state);
      return;
    }
    state.street = streets[nextStreetIndex];
    const cardsToDeal = state.street === 'flop' ? 3 : 1;
    state.community.push(...state.deck.splice(0, cardsToDeal));
    state.players.forEach((player) => { player.bet = 0; });
    state.currentBet = 0;
    state.acted.clear();
    const nextPlayer = activePlayers(state).find(({ index }) => index >= state.currentPlayer) || activePlayers(state)[0];
    state.currentPlayer = nextPlayer?.index ?? 0;
  }

  function act(state, playerIndex, action, amount = 0) {
    if (state.status !== 'playing' || state.currentPlayer !== playerIndex) throw new Error('Non è il turno di questo giocatore.');
    const player = state.players[playerIndex];
    if (!player || player.folded || player.allIn) throw new Error('Giocatore non attivo.');
    if (action === 'fold') {
      player.folded = true;
    } else if (action === 'check') {
      if (player.bet !== state.currentBet) throw new Error('Non puoi fare check: devi vedere la puntata.');
    } else if (action === 'call') {
      const callAmount = Math.min(state.currentBet - player.bet, player.stack);
      if (callAmount <= 0) throw new Error('Non c’è una puntata da vedere.');
      player.stack -= callAmount;
      player.bet += callAmount;
      player.contribution += callAmount;
      state.pot += callAmount;
      player.allIn = player.stack === 0;
    } else if (action === 'raise') {
      const increase = amount - state.currentBet;
      const allInRaise = amount === player.bet + player.stack;
      if (!Number.isInteger(amount) || amount <= state.currentBet || amount > player.bet + player.stack ||
        (increase < state.minimumRaise && !allInRaise)) {
        throw new Error('Rilancio non valido.');
      }
      const contribution = amount - player.bet;
      player.stack -= contribution;
      player.bet = amount;
      player.contribution += contribution;
      state.pot += contribution;
      player.allIn = player.stack === 0;
      state.minimumRaise = increase;
      state.currentBet = amount;
      state.acted.clear();
    } else {
      throw new Error('Azione di puntata non riconosciuta.');
    }
    state.acted.add(playerIndex);
    const remaining = state.players.map((candidate, index) => ({ candidate, index })).filter(({ candidate }) => !candidate.folded);
    if (remaining.length === 1) {
      remaining[0].candidate.stack += state.pot;
      state.winners = [{ index: remaining[0].index, amount: state.pot }];
      state.pot = 0;
      state.status = 'finished';
      return;
    }
    const contenders = remaining.filter(({ candidate }) => !candidate.allIn);
    const roundComplete = contenders.length === 0 || contenders.every(({ candidate, index }) => (
      state.acted.has(index) && candidate.bet === state.currentBet
    ));
    if (roundComplete) {
      if (contenders.length === 0) {
        while (state.street !== 'river' && state.status === 'playing') advanceStreet(state);
        if (state.status !== 'finished') determineWinners(state);
      } else {
        advanceStreet(state);
      }
      return;
    }
    const start = (playerIndex + 1) % state.players.length;
    state.currentPlayer = Array.from({ length: state.players.length }, (_, offset) => (start + offset) % state.players.length)
      .find((index) => !state.players[index].folded && !state.players[index].allIn);
  }

  return { createGame, act, evaluateFive, evaluateBest, compareHands };
}));
