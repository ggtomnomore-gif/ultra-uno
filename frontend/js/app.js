(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const COLORS = {
    red: { label: 'ROSSO', symbol: '●' },
    blue: { label: 'BLU', symbol: '●' },
    green: { label: 'VERDE', symbol: '●' },
    yellow: { label: 'GIALLO', symbol: '●' },
    wild: { label: 'JOLLY', symbol: '✦' }
  };
  const SCALA_SUITS = {
    clubs: { symbol: '♣', label: 'fiori', red: false },
    diamonds: { symbol: '♦', label: 'quadri', red: true },
    hearts: { symbol: '♥', label: 'cuori', red: true },
    spades: { symbol: '♠', label: 'picche', red: false }
  };
  const BOT_NAMES = ['AGGR', 'CONS', 'STRAT'];
  let game = null;
  let chosenCardId = null;
  let botTimer = null;
  let realtime = null;
  let blackjackGame = null;
  let scopaGame = null;
  let scopaCaptureTrigger = null;
  let rubaGame = null;
  let scalaGame = null;
  let scalaSelectedCards = new Set();
  let scalaHandoffPending = false;
  let pokerGame = null;
  let pokerHandoffPending = false;
  let pokerShowdown = false;
  let milleGame = null;
  let milleHandoffPending = false;
  let milleSelectedCardId = null;
  let onlineRoom = null;
  let onlineIdentity = null;
  let onlineGame = false;
  let rankedMatch = false;
  let matchmakingActive = false;
  let onlineVersion = -1;
  let onlineUserIds = [];
  let onlinePlayerIndex = 0;
  let guestMode = false;
  let storeData = null;
  let battleCardData = null;
  let dailyChallenges = [];
  let pendingBattleRewards = [];
  let battleRewardTrigger = null;

  const BLACKJACK_SUITS = {
    clubs: { symbol: '♣', label: 'fiori', red: false },
    diamonds: { symbol: '♦', label: 'quadri', red: true },
    hearts: { symbol: '♥', label: 'cuori', red: true },
    spades: { symbol: '♠', label: 'picche', red: false }
  };
  const SCOPA_SUITS = {
    coins: { symbol: '●', label: 'denari', red: false },
    cups: { symbol: '♥', label: 'coppe', red: true },
    swords: { symbol: '⚔', label: 'spade', red: false },
    clubs: { symbol: '♣', label: 'bastoni', red: false }
  };

  function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach((screen) => screen.classList.add('hidden'));
    const nextScreen = document.getElementById(screenId);
    if (nextScreen) nextScreen.classList.remove('hidden');
  }

  function continueAsGuest() {
    const nameField = $('#player-name');
    const name = nameField.value.trim();
    if (name.length < 3 || name.length > 15) {
      nameField.setCustomValidity('Il nome deve contenere da 3 a 15 caratteri.');
      nameField.reportValidity();
      return;
    }
    try {
      localStorage.removeItem('uno-ultra-token');
    } catch (error) {
      console.error('Impossibile terminare la sessione locale:', error.message);
      $('#auth-message').textContent = 'Impossibile avviare la modalità ospite in questo browser.';
      return;
    }
    nameField.setCustomValidity('');
    guestMode = true;
    $('#lobby-player-name').textContent = name;
    $('#player-session-label').textContent = 'OSPITE · SOLO MODALITÀ LOCALI';
    $('#lobby-notice').textContent = 'Modalità ospite: account, progressi e stanze online non sono disponibili.';
    $('#lobby-notice').hidden = false;
    updateOnlineRoomUI();
    showScreen('lobby-screen');
  }

  function setAuthMode(mode) {
    const registering = mode === 'register';
    const title = $('#auth-title');
    title.replaceChildren(document.createTextNode(registering ? 'Crea il tuo ' : 'Accedi '));
    const titleAccent = document.createElement('span');
    titleAccent.textContent = registering ? 'profilo.' : 'all’arena.';
    title.append(titleAccent);
    $('#login-form').classList.toggle('hidden', registering);
    $('#register-form').classList.toggle('hidden', !registering);
    $('#login-tab').classList.toggle('active', !registering);
    $('#register-tab').classList.toggle('active', registering);
    $('#login-tab').setAttribute('aria-selected', String(!registering));
    $('#register-tab').setAttribute('aria-selected', String(registering));
    $('#auth-message').textContent = '';
  }

  function storeToken(token) {
    try {
      localStorage.setItem('uno-ultra-token', token);
      return true;
    } catch (error) {
      console.error('Impossibile salvare la sessione:', error.message);
      $('#auth-message').textContent = 'Impossibile salvare la sessione in questo browser.';
      return false;
    }
  }

  async function submitAuth(form, endpoint) {
    const formData = new FormData(form);
    const message = $('#auth-message');
    message.textContent = 'Connessione all’arena…';
    try {
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData.entries()))
      });
      const data = await response.json();
      if (!response.ok) {
        const errorMessage = data.error || 'Operazione non riuscita.';
        message.textContent = response.status === 503
          ? `${errorMessage} Verifica che PostgreSQL sia avviato e aggiornato. Puoi intanto giocare in locale come ospite.`
          : errorMessage;
        return;
      }
      if (!data.token || !data.user?.username || !storeToken(data.token)) return;
      guestMode = false;
      $('#player-name').value = data.user.username;
      $('#lobby-player-name').textContent = data.user.username;
      $('#player-session-label').textContent = 'Livello 01 · Bronze I';
      showScreen('lobby-screen');
    } catch (error) {
      console.error('Authentication request failed:', error.message);
      message.textContent = 'Server non raggiungibile. Riprova tra poco.';
    }
  }

  async function logout() {
    let token;
    try {
      token = localStorage.getItem('uno-ultra-token');
    } catch (error) {
      console.error('Impossibile leggere la sessione:', error.message);
      const notice = $('#lobby-notice');
      notice.textContent = 'Impossibile leggere la sessione in questo browser.';
      notice.hidden = false;
      return;
    }
    if (!token) {
      guestMode = false;
      showScreen('home-screen');
      return;
    }
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token }
      });
      const data = await response.json();
      if (!response.ok) {
        const notice = $('#lobby-notice');
        notice.textContent = data.error || 'Impossibile terminare la sessione.';
        notice.hidden = false;
        return;
      }
      realtime?.close();
      realtime = null;
      onlineRoom = null;
      onlineGame = false;
      rankedMatch = false;
      matchmakingActive = false;
      onlineVersion = -1;
      onlineUserIds = [];
      updateOnlineRoomUI();
      localStorage.removeItem('uno-ultra-token');
      showScreen('home-screen');
    } catch (error) {
      console.error('Logout request failed:', error.message);
      const notice = $('#lobby-notice');
      notice.textContent = 'Server non raggiungibile: sessione non terminata.';
      notice.hidden = false;
    }
  }

  function setMessage(message, kind = '') {
    const messageNode = $('#board-message');
    messageNode.textContent = message;
    messageNode.className = `board-message${kind ? ` ${kind}` : ''}`;
  }

  async function connectRealtime() {
    if (guestMode) throw new Error('Le stanze online richiedono un account e il database online.');
    if (realtime?.authenticated) return realtime;
    const token = localStorage.getItem('uno-ultra-token');
    if (!token) throw new Error('Accedi per creare o unirti a una stanza online.');
    realtime = new UnoWSClient.WSClient({ token });
    realtime.on('room.created', (room) => {
      onlineRoom = room;
      onlineIdentity = { userId: room.players[0]?.userId, username: room.players[0]?.username };
      onlineUserIds = room.players.map((player) => player.userId);
      updateOnlineRoomUI();
    });
    realtime.on('room.joined', (room) => {
      onlineRoom = room;
      onlineUserIds = room.players.map((player) => player.userId);
      updateOnlineRoomUI();
      if (room.hostId !== onlineIdentity?.userId) {
        showLobbyNotice(`Sei nella stanza ${room.id}. In attesa che l’host avvii la partita.`);
      }
    });
    realtime.on('room.playerJoined', (player) => {
      if (!onlineRoom || onlineRoom.players.some((existing) => existing.userId === player.userId)) return;
      onlineRoom.players.push(player);
      onlineUserIds = onlineRoom.players.map((member) => member.userId);
      updateOnlineRoomUI();
    });
    realtime.on('room.playerLeft', (player) => {
      if (!onlineRoom) return;
      onlineRoom.players = onlineRoom.players.filter((member) => member.userId !== player.userId);
      onlineUserIds = onlineRoom.players.map((member) => member.userId);
      updateOnlineRoomUI();
    });
    realtime.on('room.closed', () => {
      onlineRoom = null;
      onlineGame = false;
      onlineVersion = -1;
      onlineUserIds = [];
      updateOnlineRoomUI();
      showLobbyNotice('L’host ha chiuso la stanza.');
      showScreen('lobby-screen');
    });
    realtime.on('game.state', (payload) => receiveOnlineGameState(payload));
    realtime.on('matchmaking.queued', (payload) => {
      matchmakingActive = true;
      const status = $('#matchmaking-status');
      status.hidden = false;
      status.textContent = `In coda ranked · ${payload.mmr} MMR · ricerca avversario…`;
      $('#matchmaking-button').textContent = 'ANNULLA RICERCA';
    });
    realtime.on('matchmaking.found', (payload) => {
      matchmakingActive = false;
      rankedMatch = true;
      const status = $('#matchmaking-status');
      status.hidden = false;
      status.textContent = `Partita ranked trovata contro ${payload.opponent}.`;
      $('#matchmaking-button').textContent = 'CERCA PARTITA RANKED';
      updateOnlineRoomUI();
    });
    realtime.on('matchmaking.cancelled', () => {
      matchmakingActive = false;
      $('#matchmaking-status').hidden = true;
      $('#matchmaking-button').textContent = 'CERCA PARTITA RANKED';
    });
    realtime.on('client.close', () => {
      if (onlineRoom) showLobbyNotice('Connessione online interrotta.');
      onlineRoom = null;
      onlineGame = false;
      rankedMatch = false;
      matchmakingActive = false;
      onlineVersion = -1;
      onlineUserIds = [];
      updateOnlineRoomUI();
    });
    realtime.on('error', (message) => {
      if (message.code === 'MATCHMAKING_UNAVAILABLE' || message.code === 'RANK_NOT_FOUND') {
        matchmakingActive = false;
        $('#matchmaking-status').hidden = false;
        $('#matchmaking-status').textContent = message.message;
        $('#matchmaking-button').textContent = 'CERCA PARTITA RANKED';
      }
      showLobbyNotice(message.message || 'Operazione stanza non riuscita.');
    });
    realtime.on('client.error', (error) => {
      showLobbyNotice(error.message);
    });
    onlineIdentity = await realtime.connect();
    return realtime;
  }

  function showLobbyNotice(text) {
    const notice = $('#lobby-notice');
    notice.textContent = text;
    notice.hidden = false;
  }

  function applyPlayerProfile(user) {
    if (!user?.username) return;
    guestMode = false;
    $('#player-name').value = user.username;
    $('#lobby-player-name').textContent = user.username;
    const unoStats = Array.isArray(user.stats) ? user.stats.find((stats) => stats.mode === 'uno') : null;
    if (unoStats) {
      $('#rank-value').textContent = unoStats.rank.toUpperCase();
      $('#rank-mmr').textContent = `${unoStats.mmr} MMR`;
      $('#player-session-label').textContent = `Rank · ${unoStats.rank}`;
    }
    renderPlayerProfile(user);
    updateOnlineRoomUI();
  }

  function renderPlayerProfile(user) {
    const unoStats = Array.isArray(user.stats) ? user.stats.find((stats) => stats.mode === 'uno') : null;
    $('#profile-username').textContent = user.username;
    $('#profile-rank').textContent = unoStats?.rank || 'Bronze I';
    $('#profile-mmr').textContent = `${unoStats?.mmr ?? 200} MMR`;
    $('#profile-created').querySelector('strong').textContent = user.created_at
      ? new Date(user.created_at).toLocaleDateString('it-IT')
      : '—';
    $('.profile-avatar').textContent = user.username.slice(0, 1).toUpperCase();
    const modeNames = {
      uno: 'UNO Classic',
      scala40: 'Scala 40',
      'ruba-mazzetto': 'Ruba Mazzetto',
      blackjack: 'BlackJack',
      scopa: 'Scopa',
      'poker-texas': 'Poker Texas',
      burraco: 'Burraco',
      mille: 'Millemiglia'
    };
    const list = $('#profile-stats');
    list.replaceChildren();
    (Array.isArray(user.stats) ? user.stats : []).forEach((stats) => {
      const card = document.createElement('article');
      card.className = 'profile-stat-card';
      card.setAttribute('role', 'listitem');
      const isUno = stats.mode === 'uno';
      const title = document.createElement('h4');
      title.textContent = modeNames[stats.mode] || stats.mode;
      const rank = document.createElement('strong');
      rank.textContent = isUno ? (stats.rank || 'Bronze I') : 'Statistiche non attive';
      const details = document.createElement('p');
      details.textContent = isUno
        ? `${stats.mmr ?? 0} MMR · ${stats.gamesPlayed ?? 0} ranked · ${stats.wins ?? 0} vittorie`
        : 'Questa modalità non salva ancora statistiche online.';
      card.append(title, rank, details);
      list.append(card);
    });
    $('#profile-message').textContent = user.stats?.length
      ? ''
      : 'Le statistiche appariranno qui dopo le prime partite competitive.';
  }

  async function refreshPlayerProfile() {
    if (guestMode) return false;
    try {
      const token = localStorage.getItem('uno-ultra-token');
      if (!token) return false;
      const response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.status === 401) {
        localStorage.removeItem('uno-ultra-token');
        showScreen('home-screen');
        return false;
      }
      if (!response.ok) {
        const message = data.error || 'Profilo non aggiornato.';
        if (!$('#profile-panel').classList.contains('hidden')) {
          $('#profile-message').textContent = message;
        } else {
          showLobbyNotice(message);
        }
        return false;
      }
      applyPlayerProfile(data.user);
      return true;
    } catch (error) {
      const message = `Profilo non aggiornato: ${error.message}`;
      if (!$('#profile-panel').classList.contains('hidden')) {
        $('#profile-message').textContent = message;
      } else {
        showLobbyNotice(message);
      }
      return false;
    }
  }

  function updateOnlineRoomUI() {
    const status = $('#room-status');
    const start = $('#start-online-button');
    const leave = $('#leave-room-button');
    const host = Boolean(onlineRoom && onlineIdentity && onlineRoom.hostId === onlineIdentity.userId);
    status.hidden = !onlineRoom;
    start.hidden = !host;
    leave.hidden = !onlineRoom;
    $('#game-mode').disabled = Boolean(onlineRoom);
    const rankedSelected = $('#competitive-toggle').checked && $('#game-mode').value === 'uno' && !guestMode;
    $('#create-room-button').classList.toggle('hidden', rankedSelected);
    $('.room-join').classList.toggle('hidden', rankedSelected);
    $('#matchmaking-button').hidden = !rankedSelected || Boolean(onlineRoom);
    $('#matchmaking-button').disabled = !realtime?.authenticated && matchmakingActive;
    if (onlineRoom) {
      status.textContent = `STANZA ${onlineRoom.id} · ${onlineRoom.players.map((player) => player.username).join(', ')} · ${onlineRoom.players.length}/4`;
      start.disabled = onlineRoom.players.length < 2;
      $('#play-button').disabled = true;
      $('#play-button').setAttribute('aria-label', 'Usa avvia partita online per giocare nella stanza');
      $('#competitive-toggle').checked = Boolean(onlineRoom.competitive);
    } else {
      $('#play-button').disabled = false;
      $('#play-button').removeAttribute('aria-label');
    }
    $('#competitive-toggle').disabled = Boolean(onlineRoom) || guestMode;
    $('#play-button').classList.toggle('hidden', rankedSelected && !onlineRoom);
  }

  function applyTheme(theme) {
      document.documentElement.dataset.theme = theme;
      try {
        localStorage.setItem('uno-ultra-theme', theme);
      } catch (error) {
        console.error('Impossibile salvare il tema:', error.message);
        $('#store-message').textContent = 'Tema applicato, ma non è stato possibile salvarlo localmente.';
      }
    }

  function renderStore() {
      if (!storeData) return;
      $('#store-credits').textContent = storeData.credits;
      const items = $('#store-items');
      items.replaceChildren();
      const catalog = [
        { id: 'theme-cyber', name: 'Cyber Blue', description: 'Il tema originale dell’arena.', category: 'theme', theme: 'cyber-blue', price: 0, owned: true, equipped: storeData.activeTheme === 'cyber-blue' },
        ...storeData.items
      ];
      catalog.forEach((item) => {
        const card = document.createElement('article');
        card.className = 'store-item';
        card.setAttribute('role', 'listitem');
        const preview = document.createElement('div');
        preview.className = 'store-preview';
        preview.dataset.theme = item.theme;
        preview.textContent = 'UNO ULTRA';
        const title = document.createElement('h3');
        title.textContent = item.name;
        const description = document.createElement('p');
        description.textContent = item.description;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `button ${item.owned ? 'button-quiet' : 'button-primary'}`;
        if (item.owned) {
          button.textContent = item.equipped ? 'EQUIPAGGIATO' : 'EQUIPAGGIA';
          button.disabled = item.equipped;
          button.dataset.storeAction = 'equip';
        } else {
          button.textContent = `ACQUISTA · ${item.price} V`;
          button.disabled = storeData.credits < item.price;
          button.dataset.storeAction = 'purchase';
        }
        button.dataset.itemId = item.id;
        card.append(preview, title, description, button);
        items.append(card);
      });
      renderWallet();
      renderLocker();
    }

    function renderWallet() {
      if (!storeData) return;
      $('#wallet-credits').textContent = storeData.credits;
      const active = storeData.items.find((item) => item.theme === storeData.activeTheme);
      $('#wallet-active-theme').textContent = `TEMA EQUIPAGGIATO · ${active?.name || 'Cyber Blue'}`;
      const history = $('#wallet-history');
      history.replaceChildren();
      const transactions = Array.isArray(storeData.transactions) ? storeData.transactions : [];
      if (transactions.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'wallet-empty';
        empty.textContent = 'Nessuna attività registrata.';
        history.append(empty);
        return;
      }
      transactions.forEach((transaction) => {
        const row = document.createElement('div');
        row.className = 'wallet-transaction';
        row.setAttribute('role', 'listitem');
        const description = document.createElement('span');
        const itemName = storeData.items.find((item) => item.id === transaction.item_id)?.name;
        description.textContent = transaction.reason === 'starter'
          ? 'Bonus iniziale'
          : transaction.reason === 'purchase'
            ? transaction.item_id ? `Acquisto · ${itemName || 'Articolo'}` : 'Acquisto · Pass Battle Card'
            : 'Premio partita';
        const amount = document.createElement('strong');
        amount.classList.toggle('credit-negative', transaction.amount < 0);
        amount.textContent = `${transaction.amount > 0 ? '+' : ''}${transaction.amount} V`;
        const date = document.createElement('time');
        date.dateTime = transaction.created_at || '';
        date.textContent = transaction.created_at
          ? new Date(transaction.created_at).toLocaleDateString()
          : '';
        row.append(description, amount, date);
        history.append(row);
      });
    }

    function renderLocker() {
      if (!storeData) return;
      const locker = $('#locker-items');
      locker.replaceChildren();
      const inventory = [
        { id: 'theme-cyber', name: 'Cyber Blue', description: 'Tema originale dell’arena.', theme: 'cyber-blue', owned: true, equipped: storeData.activeTheme === 'cyber-blue' },
        ...storeData.items.filter((item) => item.owned)
      ];
      $('#locker-message').textContent = `${inventory.length} TEMI · ${inventory.find((item) => item.equipped)?.name || 'Cyber Blue'} EQUIPAGGIATO`;
      inventory.forEach((item) => {
        const card = document.createElement('article');
        card.className = 'store-item';
        card.setAttribute('role', 'listitem');
        const preview = document.createElement('div');
        preview.className = 'store-preview';
        preview.dataset.theme = item.theme;
        preview.textContent = 'UNO ULTRA';
        const title = document.createElement('h3');
        title.textContent = item.name;
        const description = document.createElement('p');
        description.textContent = item.description;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `button ${item.equipped ? 'button-primary' : 'button-quiet'}`;
        button.textContent = item.equipped ? 'EQUIPAGGIATO' : 'EQUIPAGGIA';
        button.disabled = item.equipped;
        button.dataset.lockerItemId = item.id;
        card.append(preview, title, description, button);
        locker.append(card);
      });
    }

  async function loadStore() {
      let token;
      try {
        token = localStorage.getItem('uno-ultra-token');
      } catch (error) {
        $('#store-message').textContent = `Impossibile leggere la sessione: ${error.message}`;
        return false;
      }
      if (!token) {
        $('#store-message').textContent = 'Accedi al tuo account per consultare il Negozio.';
        return false;
      }
      $('#store-message').textContent = 'Caricamento del catalogo…';
      try {
        const response = await fetch('/api/store', { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) {
          $('#store-message').textContent = data.error || 'Negozio non disponibile.';
          return false;
        }
        storeData = data;
        applyTheme(data.activeTheme);
        renderStore();
        $('#store-message').textContent = '';
        return true;
      } catch (error) {
        $('#store-message').textContent = `Negozio non raggiungibile: ${error.message}`;
        return false;
      }
    }

  async function updateStoreItem(action, itemId) {
      const token = localStorage.getItem('uno-ultra-token');
      if (!token) {
        $('#store-message').textContent = 'Accedi al tuo account per usare il Negozio.';
        return;
      }
      $('#store-message').textContent = action === 'purchase' ? 'Acquisto in corso…' : 'Equipaggiamento in corso…';
      try {
        const response = await fetch(`/api/store/${action}`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId })
        });
        const data = await response.json();
        if (!response.ok) {
          $('#store-message').textContent = data.error || 'Operazione negozio non riuscita.';
          return;
        }
        if (action === 'equip') applyTheme(data.theme);
        await loadStore();
        $('#store-message').textContent = action === 'purchase' ? 'Articolo acquistato.' : 'Tema equipaggiato.';
      } catch (error) {
        $('#store-message').textContent = `Operazione negozio non riuscita: ${error.message}`;
    }
  }

  function renderBattleCard() {
    if (!battleCardData) return;
    const { level, maxLevel, experience, experiencePerLevel, premiumUnlocked, rewards } = battleCardData;
    $('#battle-card-level-label').querySelector('strong').textContent = `${level} / ${maxLevel}`;
    const levelExperience = experience % experiencePerLevel;
    $('#battle-card-progress').textContent = level >= maxLevel
      ? `${battleCardData.season.name} · livello massimo raggiunto · ${experience} XP`
      : `${battleCardData.season.name} · ${levelExperience} / ${experiencePerLevel} XP al prossimo livello`;
    $('#battle-card-unlock-standard').classList.toggle('hidden', premiumUnlocked);
    $('#battle-card-unlock-boosted').classList.toggle('hidden', premiumUnlocked);
    $('#battle-card-unlock-standard').textContent = `PASS PREMIUM · ${battleCardData.prices.standard} V`;
    $('#battle-card-unlock-boosted').textContent = `PASS + 20 LIVELLI · ${battleCardData.prices.boosted} V`;
    $('#battle-card-unlock-standard').disabled = battleCardData.credits < battleCardData.prices.standard;
    $('#battle-card-unlock-boosted').disabled = battleCardData.credits < battleCardData.prices.boosted;

    const rewardMap = new Map();
    rewards.forEach((reward) => {
      if (!rewardMap.has(reward.level)) rewardMap.set(reward.level, {});
      rewardMap.get(reward.level)[reward.track] = reward;
    });
    const list = $('#battle-card-levels');
    list.replaceChildren();
    let claimable = false;
    for (let levelNumber = 1; levelNumber <= maxLevel; levelNumber += 1) {
      const card = document.createElement('article');
      card.className = `battle-level${levelNumber <= level ? ' reached' : ''}`;
      card.setAttribute('role', 'listitem');
      const heading = document.createElement('h3');
      heading.textContent = `LIVELLO ${levelNumber}`;
      card.append(heading);
      for (const track of ['free', 'premium']) {
        const reward = rewardMap.get(levelNumber)?.[track];
        if (!reward) continue;
        const row = document.createElement('div');
        row.className = `battle-reward ${track}`;
        const label = document.createElement('span');
        label.textContent = `${track === 'free' ? 'GRATIS' : 'PREMIUM'} · ${reward.credits} V`;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'text-button';
        button.dataset.battleAction = 'claim';
        button.dataset.level = String(levelNumber);
        button.dataset.track = track;
        if (reward.claimed) {
          button.textContent = 'RISCATTATO';
          button.disabled = true;
        } else if (levelNumber > level) {
          button.textContent = 'BLOCCATO';
          button.disabled = true;
        } else if (track === 'premium' && !premiumUnlocked) {
          button.textContent = 'PREMIUM';
          button.disabled = true;
        } else {
          button.textContent = 'RISCATTA';
          claimable = true;
        }
        row.append(label, button);
        card.append(row);
      }
      list.append(card);
    }
    $('#battle-card-claim-all').disabled = !claimable;
    $('#battle-card-claim-all').textContent = claimable ? 'RISCATTA TUTTO' : 'NESSUNA RICOMPENSA';
  }

  function renderChallenges() {
    const list = $('#challenge-list');
    list.replaceChildren();
    dailyChallenges.forEach((challenge) => {
      const card = document.createElement('article');
      card.className = 'challenge-card';
      card.setAttribute('role', 'listitem');
      const details = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = challenge.title;
      const description = document.createElement('p');
      description.textContent = challenge.description;
      details.append(title, description);
      const progress = document.createElement('span');
      progress.className = 'challenge-progress';
      progress.textContent = `${Math.min(challenge.progress, challenge.target)} / ${challenge.target} · PREMIO ${challenge.reward} V`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button-quiet';
      button.dataset.challengeId = challenge.challenge_id;
      button.textContent = challenge.claimed
        ? 'RISCATTATA'
        : challenge.progress >= challenge.target ? 'RISCATTA' : 'IN CORSO';
      button.disabled = challenge.claimed || challenge.progress < challenge.target;
      card.append(details, progress, button);
      list.append(card);
    });
  }

  async function loadChallenges() {
    const message = $('#challenges-message');
    try {
      const token = localStorage.getItem('uno-ultra-token');
      if (!token) {
        message.textContent = 'Accedi al tuo account per consultare le sfide.';
        return false;
      }
      message.textContent = 'Caricamento sfide…';
      const response = await fetch('/api/challenges', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('uno-ultra-token');
          setAuthMode('login');
          showScreen('auth-screen');
        }
        message.textContent = data.error || 'Sfide non disponibili.';
        return false;
      }
      dailyChallenges = data.challenges;
      $('#challenges-date').querySelector('strong').textContent = data.challenges[0]?.challenge_date || '—';
      renderChallenges();
      message.textContent = dailyChallenges.length ? '' : 'Nessuna sfida giornaliera attiva.';
      return true;
    } catch (error) {
      message.textContent = `Sfide non raggiungibili: ${error.message}`;
      return false;
    }
  }

  async function claimDailyChallenge(button) {
    const message = $('#challenges-message');
    try {
      const token = localStorage.getItem('uno-ultra-token');
      if (!token) {
        message.textContent = 'Accedi al tuo account per riscattare le sfide.';
        return;
      }
      button.disabled = true;
      message.textContent = 'Riscatto ricompensa…';
      const response = await fetch('/api/challenges/claim', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: button.dataset.challengeId })
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('uno-ultra-token');
          setAuthMode('login');
          showScreen('auth-screen');
        }
        message.textContent = data.error || 'Riscatto sfida non riuscito.';
        button.disabled = false;
        return;
      }
      await loadChallenges();
      message.textContent = `Ricompensa riscattata: ${data.reward} V-Coins · saldo ${data.credits}.`;
    } catch (error) {
      message.textContent = `Riscatto sfida non riuscito: ${error.message}`;
      button.disabled = false;
    }
  }

  async function loadBattleCard() {
    const message = $('#battle-card-message');
    try {
      const token = localStorage.getItem('uno-ultra-token');
      if (!token) {
        message.textContent = 'Accedi al tuo account per consultare la Battle Card.';
        return false;
      }

      message.textContent = 'Caricamento progressi…';
      const response = await fetch('/api/battle-card', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('uno-ultra-token');
          setAuthMode('login');
          showScreen('auth-screen');
        }
        message.textContent = data.error || 'Battle Card non disponibile.';
        return false;
      }
      battleCardData = data;
      renderBattleCard();
      message.textContent = '';
      return true;
    } catch (error) {
      message.textContent = `Battle Card non raggiungibile: ${error.message}`;
      return false;
    }
  }

  function closeBattleRewardDialog() {
    $('#battle-card-reward-dialog').classList.add('hidden');
    pendingBattleRewards = [];
    if (battleRewardTrigger?.isConnected && !battleRewardTrigger.disabled) {
      battleRewardTrigger.focus();
    } else {
      $('#battle-card-title').focus();
    }
    battleRewardTrigger = null;
  }

  function showNextBattleReward() {
    const reward = pendingBattleRewards[0];
    if (!reward) {
      closeBattleRewardDialog();
      return;
    }
    $('#battle-card-reward-copy').textContent =
      `Livello ${reward.level} · ${reward.track === 'free' ? 'Ricompensa gratuita' : 'Ricompensa premium'} · ${reward.credits} V-Coins`;
    $('#battle-card-reward-count').textContent = pendingBattleRewards.length > 1
      ? `${pendingBattleRewards.length} RICOMPENSE · RISCATTATE UNA ALLA VOLTA`
      : 'ULTIMA RICOMPENSA';
    $('#battle-card-reward-next').textContent = pendingBattleRewards.length > 1 ? 'AVANTI' : 'CHIUDI';
    $('#battle-card-reward-dialog').classList.remove('hidden');
    $('#battle-card-reward-next').focus();
  }

  async function performBattleCardAction(button) {
    const message = $('#battle-card-message');
    const action = button.dataset.battleAction;
    if (action === 'reward-next') {
      pendingBattleRewards.shift();
      showNextBattleReward();
      return;
    }
    if (action === 'reward-close') {
      closeBattleRewardDialog();
      return;
    }
    const endpoint = action === 'unlock' ? 'unlock'
      : action === 'claim-all' ? 'claim-all' : 'claim';
    const payload = action === 'unlock'
      ? { tier: button.dataset.tier }
      : action === 'claim'
        ? { level: Number(button.dataset.level), track: button.dataset.track }
        : {};
    try {
      const token = localStorage.getItem('uno-ultra-token');
      if (!token) {
        message.textContent = 'Accedi al tuo account per usare la Battle Card.';
        return;
      }
      button.disabled = true;
      message.textContent = action === 'unlock' ? 'Sblocco del pass…' : 'Riscatto ricompense…';
      const response = await fetch(`/api/battle-card/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('uno-ultra-token');
          setAuthMode('login');
          showScreen('auth-screen');
        }
        message.textContent = data.error || 'Operazione Battle Card non riuscita.';
        button.disabled = false;
        return;
      }
      await loadBattleCard();
      if (Array.isArray(data.rewards) && data.rewards.length) {
        battleRewardTrigger = button.isConnected && !button.disabled
          ? button
          : $('#battle-card-title');
        pendingBattleRewards = [...data.rewards];
        showNextBattleReward();
      } else {
        message.textContent = action === 'unlock'
          ? `Pass premium attivato. Saldo: ${data.credits} V-Coins.`
          : 'Ricompensa riscattata.';
      }
    } catch (error) {
      message.textContent = `Operazione Battle Card non riuscita: ${error.message}`;
      button.disabled = false;
    }
  }

  function formatCard(card) {
    if (card.value === 'wild') return '✦';
    if (card.value === 'wild4') return '+4';
    if (card.value === 'draw2') return '+2';
    if (card.value === 'reverse') return '↻';
    if (card.value === 'skip') return '⊘';
    return card.value;
  }

  function createCardElement(card, small = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `uno-card ${card.color}${small ? ' small-card' : ''}`;
    button.setAttribute('aria-label', `${card.color === 'wild' ? 'Jolly' : COLORS[card.color].label}, ${card.value}`);
    const value = document.createElement('span');
    value.className = 'card-value';
    value.textContent = formatCard(card);
    const stamp = document.createElement('span');
    stamp.className = 'card-stamp';
    stamp.textContent = 'UNO';
    button.append(value, stamp);
    return button;
  }

  function receiveOnlineGameState(payload) {
    if (!payload?.state) return;
    if (Number.isInteger(payload.version) && payload.version <= onlineVersion) return;
    const state = payload.state;
    if (!state || !Array.isArray(state.players) || !Array.isArray(state.onlineUserIds) ||
      state.players.length < 2 || state.players.length > 4 || state.onlineUserIds.length !== state.players.length ||
      !Array.isArray(state.drawPile) || !Array.isArray(state.discardPile) || state.discardPile.length === 0 ||
      !onlineIdentity || !Array.isArray(payload.privateHand)) {
      showLobbyNotice('Stato della partita online non valido.');
      return;
    }
    const playerIndex = state.onlineUserIds.indexOf(onlineIdentity.userId);
    if (playerIndex < 0) {
      showLobbyNotice('La partita è già iniziata e non puoi unirti a questa mano.');
      return;
    }
    game = state;
    if (Number.isInteger(payload.version)) onlineVersion = payload.version;
    onlineGame = true;
    onlineUserIds = [...state.onlineUserIds];
    onlinePlayerIndex = playerIndex;
    game.players.forEach((player, index) => {
      player.isHuman = true;
      player.hand = index === playerIndex ? (payload.privateHand || []) : Array(player.handCount || 0).fill(null);
    });
    $('#match-label').textContent = rankedMatch
      ? `UNO RANKED · ${game.players.length} GIOCATORI`
      : `UNO ONLINE CASUAL · ${game.players.length} GIOCATORI`;
    setGameTitle('UNO ', 'ONLINE');
    $('#result-dialog').classList.add('hidden');
    $('#uno-board').classList.remove('hidden');
    ['blackjack-board', 'scopa-board', 'ruba-board', 'scala-board', 'poker-board', 'mille-board'].forEach((id) => $(`#${id}`).classList.add('hidden'));
    showScreen('game-screen');
    setMessage(`Partita online sincronizzata · turno di ${game.players[game.currentPlayer].name}.`);
    renderBoard();
    if (game.status === 'finished') showResult();
  }

  function sendOnlineAction(action) {
    if (!onlineGame || !game || game.currentPlayer !== onlinePlayerIndex) return false;
    try {
      realtime.sendGameAction(action);
      setMessage('Mossa inviata. In attesa della conferma server…');
    } catch (error) {
      setMessage(error.message, 'error');
    }
    return true;
  }

  function renderBoard() {
    if (!game) return;
    const hand = $('#hand');
    const playersNode = $('#opponents');
    hand.replaceChildren();
    playersNode.replaceChildren();

    game.players.forEach((player, index) => {
      if (onlineGame ? index === onlinePlayerIndex : player.isHuman) return;
      const opponent = document.createElement('div');
      opponent.className = `opponent${game.currentPlayer === index ? ' active' : ''}`;
      const badge = document.createElement('span');
      badge.className = 'opponent-avatar';
      badge.textContent = player.name.slice(0, 1);
      const details = document.createElement('span');
      details.className = 'opponent-details';
      const name = document.createElement('strong');
      name.textContent = player.name;
      const count = document.createElement('small');
      count.textContent = `${player.hand.length} CARTE`;
      details.append(name, count);
      const back = document.createElement('span');
      back.className = 'opponent-cards';
      back.setAttribute('aria-hidden', 'true');
      for (let card = 0; card < Math.min(player.hand.length, 5); card += 1) {
        const backCard = document.createElement('i');
        back.append(backCard);
      }
      opponent.append(badge, details, back);
      playersNode.append(opponent);
    });

    const top = game.discardPile[game.discardPile.length - 1];
    const discard = $('#discard-pile');
    discard.replaceChildren(createCardElement(top));
    discard.setAttribute('aria-label', `Carta in cima: ${top.color} ${top.value}${game.chosenColor ? `, colore scelto ${game.chosenColor}` : ''}`);
    $('#draw-count').textContent = `MAZZO · ${game.drawPile.length}`;
    const activePlayer = game.players[onlineGame ? onlinePlayerIndex : 0];
    $('#hand-count').textContent = String(activePlayer.hand.length);

    const playable = UnoEngine.getPlayableCards(game, onlineGame ? onlinePlayerIndex : 0);
    activePlayer.hand.forEach((card) => {
      const cardNode = createCardElement(card);
      const allowed = playable.some((candidate) => candidate.id === card.id);
      cardNode.disabled = !allowed || game.currentPlayer !== (onlineGame ? onlinePlayerIndex : 0);
      if (allowed) cardNode.classList.add('playable');
      cardNode.addEventListener('click', () => onCardSelected(card));
      hand.append(cardNode);
    });

    const humanTurn = game.currentPlayer === (onlineGame ? onlinePlayerIndex : 0);
    $('#turn-label').textContent = humanTurn ? (game.pendingDraw ? `PESCA ${game.pendingDraw} CARTE O RILANCIA` : 'IL TUO TURNO') : `TURNO DI ${game.players[game.currentPlayer].name}`;
    $('#draw-button').disabled = !humanTurn;
    $('#draw-button').textContent = game.pendingDraw ? `PESCA ${game.pendingDraw} CARTE` : 'PESCA CARTA';
    $('#draw-button').setAttribute('aria-label', game.pendingDraw ? `Pesca ${game.pendingDraw} carte` : 'Pesca una carta');
    $('#pass-button').classList.toggle('hidden', !humanTurn || !game.justDrawnCardId || game.pendingDraw > 0);

    if (!onlineGame && !humanTurn && game.status === 'playing') scheduleBotTurn();
  }

  function onCardSelected(card) {
    if (card.color === 'wild') {
      chosenCardId = card.id;
      $('#color-dialog').classList.remove('hidden');
      $('.color-choice')?.focus();
      return;
    }
    playHumanCard(card.id);
  }

  function playHumanCard(cardId, color) {
    try {
      const playerIndex = onlineGame ? onlinePlayerIndex : 0;
      if (onlineGame) {
        sendOnlineAction({ type: 'play', cardId, color });
        $('#color-dialog').classList.add('hidden');
        chosenCardId = null;
        return;
      }
      const result = UnoEngine.playCard(game, playerIndex, cardId, color);
      $('#color-dialog').classList.add('hidden');
      chosenCardId = null;
      setMessage(result.winner === playerIndex ? 'Hai vinto la partita!' : `Colore attivo: ${game.chosenColor || game.discardPile.at(-1).color}`, result.winner === playerIndex ? 'success' : '');
      renderBoard();
      if (game.status === 'finished') showResult();
    } catch (error) {
      setMessage(error.message, 'error');
    }
  }

  function scheduleBotTurn() {
    if (botTimer) return;
    const thinkTime = UnoEngine.getBotThinkTime(game.players[game.currentPlayer].mmr);
    botTimer = window.setTimeout(() => {
      botTimer = null;
      const playerIndex = game.currentPlayer;
      const player = game.players[playerIndex];
      const move = UnoEngine.chooseBotMove(game, playerIndex);
      try {
        if (move.type === 'draw') {
          if (game.pendingDraw > 0) {
            const amount = UnoEngine.drawCards(game, playerIndex);
            setMessage(`${player.name} pesca ${amount} carte.`);
          } else {
            UnoEngine.drawCards(game, playerIndex);
            const playable = UnoEngine.getPlayableCards(game, playerIndex);
            if (playable.length === 0) {
              UnoEngine.passTurn(game, playerIndex);
              setMessage(`${player.name} pesca e passa.`);
            } else {
              const drawnMove = UnoEngine.chooseBotMove(game, playerIndex);
              UnoEngine.playCard(game, playerIndex, drawnMove.cardId, drawnMove.color);
              setMessage(`${player.name} gioca una carta.`);
            }
          }
        } else {
          UnoEngine.playCard(game, playerIndex, move.cardId, move.color);
          setMessage(`${player.name} gioca una carta${game.chosenColor ? ` · ${COLORS[game.chosenColor].label}` : ''}.`);
        }
      } catch (error) {
        setMessage(error.message, 'error');
        return;
      }
      renderBoard();
      if (game.status === 'finished') showResult();
    }, thinkTime);
  }

  function startGame() {
    if (onlineRoom) {
      showLobbyNotice('Esci dalla stanza online prima di avviare una partita locale.');
      return;
    }
    if ($('#game-mode').value === 'blackjack') {
      startBlackjack();
      return;
    }
    if ($('#game-mode').value === 'scopa') {
      startScopa();
      return;
    }
    if ($('#game-mode').value === 'ruba-mazzetto') {
      startRubaMazzetto();
      return;
    }
    if ($('#game-mode').value === 'scala40') {
      startScala40();
      return;
    }
    if ($('#game-mode').value === 'poker') {
      startPoker();
      return;
    }
    if ($('#game-mode').value === 'mille') {
      startMille();
      return;
    }
    startUnoGame();
  }

  function startOnlineGame() {
    if (!onlineRoom || onlineRoom.hostId !== onlineIdentity?.userId || onlineRoom.players.length < 2) {
      showLobbyNotice('Servono almeno due giocatori e l’host per avviare la partita online.');
      return;
    }
    if ($('#game-mode').value !== 'uno') {
      showLobbyNotice('La partita online supporta al momento solo UNO Classic.');
      return;
    }
    onlineGame = true;
    onlineVersion = 0;
    onlineUserIds = onlineRoom.players.map((player) => player.userId);
    onlinePlayerIndex = onlineUserIds.indexOf(onlineIdentity.userId);
    game = null;
    try {
      realtime.startGame('uno');
      showLobbyNotice('Il server sta preparando la partita UNO online.');
    } catch (error) {
      onlineGame = false;
      showLobbyNotice(error.message);
    }
  }

  function setGameTitle(title, subtitle) {
    const heading = $('#game-title');
    heading.replaceChildren(document.createTextNode(title));
    if (subtitle) {
      const suffix = document.createElement('span');
      suffix.textContent = subtitle;
      heading.append(suffix);
    }
  }

  function startUnoGame() {
    onlineGame = false;
    rankedMatch = false;
    onlineVersion = -1;
    onlinePlayerIndex = 0;
    window.clearTimeout(botTimer);
    botTimer = null;
    blackjackGame = null;
    scopaGame = null;
    rubaGame = null;
    scalaGame = null;
    pokerGame = null;
    milleGame = null;
    milleHandoffPending = false;
    milleSelectedCardId = null;
    pokerHandoffPending = false;
    pokerShowdown = false;
    scalaHandoffPending = false;
    const name = $('#player-name').value.trim() || 'Giocatore';
    $('#lobby-player-name').textContent = name;
    $('#match-label').textContent = 'MATCH CASUAL · 4 GIOCATORI';
    setGameTitle('UNO ', 'CLASSIC');
    $('#uno-board').classList.remove('hidden');
    $('#blackjack-board').classList.add('hidden');
    $('#scopa-board').classList.add('hidden');
    $('#ruba-board').classList.add('hidden');
    $('#scala-board').classList.add('hidden');
    $('#poker-board').classList.add('hidden');
    $('#mille-board').classList.add('hidden');
    $('#turn-label').textContent = 'IL TUO TURNO';
    game = UnoEngine.createGame([name, ...BOT_NAMES], { mmrs: [200, 200, 800, 1400] });
    $('#board-message').textContent = 'Partita avviata. Buona fortuna!';
    $('#board-message').className = 'board-message';
    $('#result-dialog').classList.add('hidden');
    showScreen('game-screen');
    renderBoard();
  }

  function blackjackCardLabel(card) {
    const rank = { 1: 'Asso', 11: 'Jack', 12: 'Regina', 13: 'Re' }[card.rank] || String(card.rank);
    return `${rank} di ${BLACKJACK_SUITS[card.suit].label}`;
  }

  function renderBlackjackCards(container, cards, hideHoleCard = false) {
    container.replaceChildren(...cards.map((card, index) => {
      const node = document.createElement('div');
      const suit = BLACKJACK_SUITS[card.suit];
      node.className = `playing-card${suit.red ? ' red-suit' : ''}${hideHoleCard && index === 1 ? ' card-back' : ''}`;
      node.setAttribute('aria-label', hideHoleCard && index === 1 ? 'Carta coperta' : blackjackCardLabel(card));
      if (hideHoleCard && index === 1) {
        node.textContent = 'ULTRA';
      } else {
        const rank = document.createElement('span');
        rank.className = 'playing-card-rank';
        rank.textContent = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[card.rank] || String(card.rank);
        const suitSymbol = document.createElement('span');
        suitSymbol.className = 'playing-card-suit';
        suitSymbol.setAttribute('aria-hidden', 'true');
        suitSymbol.textContent = suit.symbol;
        node.append(rank, suitSymbol);
      }
      return node;
    }));
  }

  function renderBlackjack() {
    if (!blackjackGame) return;
    const finished = blackjackGame.status === 'finished';
    renderBlackjackCards($('#dealer-cards'), blackjackGame.dealer, !finished);
    renderBlackjackCards($('#blackjack-player-cards'), blackjackGame.player);
    $('#dealer-score').textContent = finished ? `PUNTEGGIO ${BlackjackEngine.scoreHand(blackjackGame.dealer)}` : 'PUNTEGGIO ?';
    $('#player-score').textContent = `PUNTEGGIO ${BlackjackEngine.scoreHand(blackjackGame.player)}`;
    const message = $('#blackjack-message');
    if (finished) {
      const outcome = {
        player: 'Hai battuto il banco!',
        dealer: 'Il banco vince. Riprova!',
        push: 'Parità: nessuno vince.'
      }[blackjackGame.winner];
      message.textContent = outcome;
      message.className = `board-message blackjack-message${blackjackGame.winner === 'player' ? ' success' : ''}`;
    } else {
      message.textContent = 'Scegli: chiedi carta, stai o raddoppia.';
      message.className = 'board-message blackjack-message';
    }
    $('#blackjack-hit').disabled = finished;
    $('#blackjack-stand').disabled = finished;
    $('#blackjack-double').disabled = finished || blackjackGame.player.length !== 2;
    $('#turn-label').textContent = finished ? 'PARTITA TERMINATA' : 'IL TUO TURNO';
  }

  function startBlackjack() {
    window.clearTimeout(botTimer);
    botTimer = null;
    game = null;
    scopaGame = null;
    scalaGame = null;
    blackjackGame = BlackjackEngine.createGame();
    rubaGame = null;
    pokerGame = null;
    milleGame = null;
    scalaSelectedCards.clear();
    scalaHandoffPending = false;
    milleHandoffPending = false;
    milleSelectedCardId = null;
    $('#match-label').textContent = 'BLACKJACK · CONTRO IL BANCO';
    setGameTitle('BLACKJACK');
    $('#uno-board').classList.add('hidden');
    $('#blackjack-board').classList.remove('hidden');
    $('#scopa-board').classList.add('hidden');
    $('#ruba-board').classList.add('hidden');
    $('#scala-board').classList.add('hidden');
    $('#poker-board').classList.add('hidden');
    $('#mille-board').classList.add('hidden');
    $('#result-dialog').classList.add('hidden');
    showScreen('game-screen');
    renderBlackjack();
  }

  function scopaRankLabel(rank) {
    return { 1: 'Asso', 8: 'Fante', 9: 'Cavallo', 10: 'Re' }[rank] || String(rank);
  }

  function createScopaCard(card, isButton = false) {
    const suit = SCOPA_SUITS[card.suit];
    const element = document.createElement(isButton ? 'button' : 'div');
    if (isButton) element.type = 'button';
    element.className = `scopa-card${suit.red ? ' red-suit' : ''}${isButton ? ' scopa-hand-card' : ''}`;
    element.setAttribute('aria-label', `${scopaRankLabel(card.rank)} di ${suit.label}`);
    const rank = document.createElement('span');
    rank.className = 'scopa-card-rank';
    rank.textContent = String(card.rank);
    const symbol = document.createElement('span');
    symbol.className = 'scopa-card-suit';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = suit.symbol;
    element.append(rank, symbol);
    return element;
  }

  function renderScopa() {
    if (!scopaGame) return;
    const activePlayer = scopaGame.players[scopaGame.currentPlayer];
    const points = ScopaEngine.roundPoints(scopaGame);
    const finished = scopaGame.status === 'finished';
    $('#scopa-player-name').textContent = scopaGame.players[0].name.toUpperCase();
    $('#scopa-opponent-name').textContent = scopaGame.players[1].name.toUpperCase();
    $('#scopa-player-score').textContent = points[0].points;
    $('#scopa-opponent-score').textContent = points[1].points;
    $('#scopa-score-label').textContent = finished ? 'PUNTI FINALI' : 'PUNTI PROVVISORI';
    $('#scopa-turn-name').textContent = activePlayer?.name || '';
    $('#scopa-hand-count').textContent = `${activePlayer?.hand.length || 0} CARTE`;
    $('#scopa-deck-count').textContent = `MAZZO · ${scopaGame.deck.length}`;
    const table = $('#scopa-table');
    table.replaceChildren(...scopaGame.table.map((card) => createScopaCard(card)));
    if (scopaGame.table.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'scopa-empty-table';
      empty.textContent = 'Tavolo libero';
      table.append(empty);
    }
    const hand = $('#scopa-hand');
    hand.replaceChildren(...(activePlayer?.hand || []).map((card) => {
      const button = createScopaCard(card, true);
      button.addEventListener('click', () => chooseScopaCard(card));
      return button;
    }));

    const message = $('#scopa-message');
    if (finished) {
      const outcome = points[0].points === points[1].points
        ? 'Partita in parità.'
        : `${points[0].points > points[1].points ? points[0].name : points[1].name} vince con ${Math.max(points[0].points, points[1].points)} punti.`;
      message.textContent = `Fine partita · ${outcome}`;
      message.className = 'board-message scopa-message success';
      $('#turn-label').textContent = 'PARTITA TERMINATA';
    } else {
      message.textContent = `${activePlayer.name}: gioca una carta. Le prese disponibili saranno mostrate.`;
      message.className = 'board-message scopa-message';
      $('#turn-label').textContent = `TURNO DI ${activePlayer.name.toUpperCase()}`;
    }
  }

  function playScopaCard(cardId, captureIds = []) {
    if (!scopaGame || scopaGame.status !== 'playing') return;
    try {
      const result = ScopaEngine.playCard(scopaGame, scopaGame.currentPlayer, cardId, captureIds);
      $('#scopa-capture-dialog').classList.add('hidden');
      scopaCaptureTrigger = null;
      if (result.scopa) {
        $('#scopa-message').textContent = 'Scopa! Hai preso tutte le carte sul tavolo.';
      } else if (result.captured) {
        $('#scopa-message').textContent = 'Presa effettuata.';
      } else {
        $('#scopa-message').textContent = 'Carta lasciata sul tavolo.';
      }
      renderScopa();
      $('#scopa-hand').querySelector('button')?.focus();
      if (scopaGame.status === 'playing') {
        $('#scopa-message').textContent = `${result.scopa ? 'Scopa! ' : result.captured ? 'Presa effettuata. ' : ''}Tocca a ${scopaGame.players[scopaGame.currentPlayer].name}.`;
      }
    } catch (error) {
      $('#scopa-message').textContent = error.message;
      $('#scopa-message').classList.add('error');
    }
  }

  function chooseScopaCard(card) {
    const captures = ScopaEngine.legalCaptures(scopaGame.table, card);
    if (!captures.length) {
      playScopaCard(card.id);
      return;
    }
    const options = $('#scopa-capture-options');
    options.replaceChildren(...captures.map((capture, index) => {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'button button-quiet scopa-capture-option';
      choice.setAttribute('aria-label', `Presa ${index + 1}: ${capture.map((item) => `${scopaRankLabel(item.rank)} di ${SCOPA_SUITS[item.suit].label}`).join(', ')}`);
      const label = document.createElement('span');
      label.textContent = `PRESA ${index + 1}`;
      const cards = document.createElement('span');
      cards.className = 'scopa-capture-cards';
      cards.textContent = capture.map((item) => `${scopaRankLabel(item.rank)} ${SCOPA_SUITS[item.suit].symbol}`).join(' + ');
      choice.append(label, cards);
      choice.addEventListener('click', () => playScopaCard(card.id, capture.map((item) => item.id)));
      return choice;
    }));
    scopaCaptureTrigger = document.activeElement;
    $('#scopa-capture-dialog').classList.remove('hidden');
    options.querySelector('button')?.focus();
  }

  function startScopa() {
    window.clearTimeout(botTimer);
    botTimer = null;
    game = null;
    blackjackGame = null;
    rubaGame = null;
    scalaGame = null;
    pokerGame = null;
    milleGame = null;
    milleHandoffPending = false;
    milleSelectedCardId = null;
    const name = $('#player-name').value.trim() || 'Giocatore';
    $('#lobby-player-name').textContent = name;
    scopaGame = ScopaEngine.createGame([name, 'Avversario']);
    $('#match-label').textContent = 'SCOPA · 2 GIOCATORI LOCALI';
    setGameTitle('SCOPA');
    $('#uno-board').classList.add('hidden');
    $('#blackjack-board').classList.add('hidden');
    $('#scopa-board').classList.remove('hidden');
    $('#ruba-board').classList.add('hidden');
    $('#scala-board').classList.add('hidden');
    $('#poker-board').classList.add('hidden');
    $('#mille-board').classList.add('hidden');
    $('#scopa-capture-dialog').classList.add('hidden');
    showScreen('game-screen');
    renderScopa();
  }

  function renderRubaMazzetto() {
    if (!rubaGame) return;
    const activePlayer = rubaGame.players[rubaGame.currentPlayer];
    const finished = rubaGame.status === 'finished';
    $('#ruba-player-name').textContent = rubaGame.players[0].name.toUpperCase();
    $('#ruba-opponent-name').textContent = rubaGame.players[1].name.toUpperCase();
    $('#ruba-player-count').textContent = `${rubaGame.players[0].pile.length} CARTE`;
    $('#ruba-opponent-count').textContent = `${rubaGame.players[1].pile.length} CARTE`;
    const ownPile = rubaGame.players[0].pile;
    const opponentPile = rubaGame.players[1].pile;
    $('#ruba-player-pile').replaceChildren(
      ownPile.length ? createScopaCard(ownPile[ownPile.length - 1]) : Object.assign(document.createElement('span'), { textContent: 'Mazzetto vuoto' })
    );
    $('#ruba-opponent-pile').replaceChildren(
      opponentPile.length ? createScopaCard(opponentPile[opponentPile.length - 1]) : Object.assign(document.createElement('span'), { textContent: 'Mazzetto vuoto' })
    );
    $('#ruba-turn-name').textContent = activePlayer?.name || '';
    $('#ruba-hand-count').textContent = `${activePlayer?.hand.length || 0} CARTE`;
    const hand = $('#ruba-hand');
    hand.replaceChildren(...(activePlayer?.hand || []).map((card) => {
      const button = createScopaCard(card, true);
      button.addEventListener('click', () => playRubaMazzettoCard(card.id));
      return button;
    }));
    const message = $('#ruba-message');
    if (finished) {
      const ownCount = ownPile.length;
      const opponentCount = opponentPile.length;
      message.textContent = ownCount === opponentCount
        ? `Fine partita · pareggio con ${ownCount} carte per ciascun mazzetto.`
        : `Fine partita · ${ownCount > opponentCount ? rubaGame.players[0].name : rubaGame.players[1].name} vince con ${Math.max(ownCount, opponentCount)} carte.`;
      message.className = 'board-message scopa-message success';
      $('#turn-label').textContent = 'PARTITA TERMINATA';
    } else {
      message.textContent = `${activePlayer.name}: gioca una carta. Se il valore combacia, rubi il mazzetto avversario.`;
      message.className = 'board-message scopa-message';
      $('#turn-label').textContent = `TURNO DI ${activePlayer.name.toUpperCase()}`;
    }
  }

  function playRubaMazzettoCard(cardId) {
    if (!rubaGame || rubaGame.status !== 'playing') return;
    const playerIndex = rubaGame.currentPlayer;
    const card = rubaGame.players[playerIndex].hand.find((item) => item.id === cardId);
    if (!card) return;
    try {
      const result = RubaMazzettoEngine.playCard(rubaGame, playerIndex, cardId);
      renderRubaMazzetto();
      if (rubaGame.status === 'playing') {
        $('#ruba-message').textContent = `${result.stolen ? `${rubaGame.players[playerIndex].name} ha rubato il mazzetto! ` : ''}Tocca a ${rubaGame.players[rubaGame.currentPlayer].name}.`;
      }
    } catch (error) {
      $('#ruba-message').textContent = error.message;
      $('#ruba-message').classList.add('error');
    }
  }

  function startRubaMazzetto() {
    window.clearTimeout(botTimer);
    botTimer = null;
    game = null;
    blackjackGame = null;
    scopaGame = null;
    scalaGame = null;
    pokerGame = null;
    milleGame = null;
    milleHandoffPending = false;
    milleSelectedCardId = null;
    const name = $('#player-name').value.trim() || 'Giocatore';
    $('#lobby-player-name').textContent = name;
    rubaGame = RubaMazzettoEngine.createGame([name, 'Avversario']);
    $('#match-label').textContent = 'RUBA MAZZETTO · 2 GIOCATORI LOCALI';
    setGameTitle('RUBA MAZZETTO');
    $('#uno-board').classList.add('hidden');
    $('#blackjack-board').classList.add('hidden');
    $('#scopa-board').classList.add('hidden');
    $('#ruba-board').classList.remove('hidden');
    $('#scala-board').classList.add('hidden');
    $('#poker-board').classList.add('hidden');
    $('#mille-board').classList.add('hidden');
    showScreen('game-screen');
    renderRubaMazzetto();
  }

  function scalaRankLabel(rank) {
    return { 1: 'Asso', 11: 'Jack', 12: 'Regina', 13: 'Re' }[rank] || String(rank);
  }

  function createScalaCard(card, isButton = false) {
    const joker = card.joker === true;
    const suit = joker ? { symbol: '✦', label: 'jolly', red: false } : SCALA_SUITS[card.suit];
    const element = document.createElement(isButton ? 'button' : 'div');
    if (isButton) element.type = 'button';
    element.className = `scopa-card scala-card${suit.red ? ' red-suit' : ''}${isButton ? ' scopa-hand-card' : ''}${scalaSelectedCards.has(card.id) ? ' selected' : ''}`;
    element.setAttribute('aria-label', joker ? 'Jolly' : `${scalaRankLabel(card.rank)} di ${suit.label}`);
    if (isButton) element.setAttribute('aria-pressed', String(scalaSelectedCards.has(card.id)));
    const rank = document.createElement('span');
    rank.className = 'scopa-card-rank';
    rank.textContent = joker ? 'J' : ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[card.rank] || String(card.rank));
    const symbol = document.createElement('span');
    symbol.className = 'scopa-card-suit';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = suit.symbol;
    element.append(rank, symbol);
    if (joker) {
      const label = document.createElement('small');
      label.className = 'scala-joker-label';
      label.textContent = 'JOLLY';
      element.append(label);
    }
    return element;
  }

  function renderScala40() {
    if (!scalaGame) return;
    const activePlayer = scalaGame.players[scalaGame.currentPlayer];
    const opponentIndex = (scalaGame.currentPlayer + 1) % scalaGame.players.length;
    const opponent = scalaGame.players[opponentIndex];
    const finished = scalaGame.status === 'finished';
    $('#scala-player-name').textContent = scalaGame.players[0].name.toUpperCase();
    $('#scala-opponent-name').textContent = scalaGame.players[opponentIndex].name.toUpperCase();
    $('#scala-player-count').textContent = scalaGame.players[0].hand.length;
    $('#scala-opponent-count').textContent = opponent.hand.length;
    $('#scala-turn-name').textContent = activePlayer.name;
    $('#scala-hand-count').textContent = `${activePlayer.hand.length} CARTE${activePlayer.hand.length === 1 ? '' : ''}`;
    $('#scala-discard-count').textContent = `SCARTI · ${scalaGame.discardPile.length}`;
    const openMelds = $('#scala-table');
    const sections = scalaGame.players.flatMap((player) => player.table.map((meld, index) => {
      const section = document.createElement('section');
      section.className = 'scala-meld-group';
      section.setAttribute('aria-label', `Combinazione ${index + 1} di ${player.name}`);
      const caption = document.createElement('span');
      caption.className = 'scala-meld-caption';
      caption.textContent = `${player.name} · ${Scala40Engine.getMeldType(meld) === 'run' ? 'SCALA' : 'TRIS'}`;
      const cards = document.createElement('div');
      cards.className = 'scala-meld-cards';
      cards.append(...meld.map((card) => createScalaCard(card)));
      section.append(caption, cards);
      return section;
    }));
    if (!sections.length) {
      const empty = document.createElement('span');
      empty.className = 'scopa-empty-table';
      empty.textContent = 'Nessuna combinazione ancora aperta.';
      sections.push(empty);
    }
    openMelds.replaceChildren(...sections);

    const hand = $('#scala-hand');
    hand.replaceChildren(...(!scalaHandoffPending ? activePlayer.hand.map((card) => {
      const button = createScalaCard(card, true);
      button.addEventListener('click', () => toggleScalaCard(card.id));
      return button;
    }) : []));
    const message = $('#scala-message');
    if (finished) {
      const winner = scalaGame.players[scalaGame.winner];
      message.textContent = `Partita terminata · ${winner.name} ha chiuso per primo.`;
      message.className = 'board-message scopa-message success';
      $('#turn-label').textContent = 'PARTITA TERMINATA';
    } else {
      message.textContent = activePlayer.opened
        ? `${activePlayer.name}: pesca, posa combinazioni valide e scarta.`
        : `${activePlayer.name}: pesca, apri una combinazione valida da almeno 40 punti e scarta.`;
      message.className = 'board-message scopa-message';
      $('#turn-label').textContent = `TURNO DI ${activePlayer.name.toUpperCase()}`;
    }
    const canAct = scalaGame.status === 'playing' && !scalaHandoffPending;
    $('#scala-draw-deck').disabled = !canAct || scalaGame.drawn || scalaGame.deck.length === 0;
    $('#scala-draw-discard').disabled = !canAct || scalaGame.drawn || scalaGame.discardPile.length === 0;
    $('#scala-meld').disabled = !canAct || !scalaGame.drawn || scalaSelectedCards.size < 3;
    $('#scala-discard').disabled = !canAct || !scalaGame.drawn || scalaSelectedCards.size !== 1;
    $('#scala-handoff').classList.toggle('hidden', !scalaHandoffPending);
    if (scalaHandoffPending) {
      $('#scala-handoff-copy').textContent = `Passa il dispositivo a ${activePlayer.name}, poi mostra la sua mano.`;
      $('#turn-label').textContent = 'PASSA IL DISPOSITIVO';
      $('#scala-handoff-continue').focus();
    }
  }

  function toggleScalaCard(cardId) {
    if (scalaSelectedCards.has(cardId)) scalaSelectedCards.delete(cardId);
    else scalaSelectedCards.add(cardId);
    renderScala40();
  }

  function drawScalaCard(fromDiscard = false) {
    if (!scalaGame || scalaGame.status !== 'playing' || scalaHandoffPending) return;
    try {
      Scala40Engine.drawCard(scalaGame, scalaGame.currentPlayer, fromDiscard);
      scalaSelectedCards.clear();
      $('#scala-message').textContent = fromDiscard ? 'Hai preso la carta in cima agli scarti.' : 'Carta pescata. Ora puoi aprire/posare e scartare.';
      renderScala40();
    } catch (error) {
      $('#scala-message').textContent = error.message;
      $('#scala-message').classList.add('error');
    }
  }

  function layScalaMeld() {
    if (!scalaGame || !scalaGame.drawn || scalaSelectedCards.size < 3) return;
    const player = scalaGame.players[scalaGame.currentPlayer];
    const opening = !player.opened;
    try {
      const meld = Scala40Engine.openMeld(scalaGame, scalaGame.currentPlayer, Array.from(scalaSelectedCards));
      scalaSelectedCards.clear();
      const type = Scala40Engine.getMeldType(meld) === 'run' ? 'Scala valida posata.' : 'Tris valido posato.';
      renderScala40();
      $('#scala-message').textContent = opening
        ? `Apertura da almeno 40 punti effettuata. ${type} Ora scarta.`
        : `${type} Ora scarta.`;
    } catch (error) {
      $('#scala-message').textContent = error.message;
      $('#scala-message').classList.add('error');
    }
  }

  function discardScalaCard() {
    if (!scalaGame || !scalaGame.drawn || scalaSelectedCards.size !== 1) return;
    try {
      const currentPlayer = scalaGame.players[scalaGame.currentPlayer];
      const playerName = currentPlayer.name;
      Scala40Engine.discard(scalaGame, scalaGame.currentPlayer, Array.from(scalaSelectedCards)[0]);
      scalaSelectedCards.clear();
      if (scalaGame.status === 'playing') {
        scalaHandoffPending = true;
        renderScala40();
        $('#scala-message').textContent = `${playerName} ha scartato. Passa il dispositivo al prossimo giocatore.`;
      } else {
        renderScala40();
      }
    } catch (error) {
      $('#scala-message').textContent = error.message;
      $('#scala-message').classList.add('error');
    }
  }

  function startScala40() {
    window.clearTimeout(botTimer);
    botTimer = null;
    game = null;
    blackjackGame = null;
    scopaGame = null;
    rubaGame = null;
    scalaSelectedCards.clear();
    scalaHandoffPending = false;
    pokerGame = null;
    pokerHandoffPending = false;
    milleGame = null;
    milleHandoffPending = false;
    milleSelectedCardId = null;
    const name = $('#player-name').value.trim() || 'Giocatore';
    $('#lobby-player-name').textContent = name;
    scalaGame = Scala40Engine.createGame([name, 'Avversario']);
    $('#match-label').textContent = 'SCALA 40 · 2 GIOCATORI LOCALI';
    setGameTitle('SCALA 40');
    $('#uno-board').classList.add('hidden');
    $('#blackjack-board').classList.add('hidden');
    $('#scopa-board').classList.add('hidden');
    $('#ruba-board').classList.add('hidden');
    $('#scala-board').classList.remove('hidden');
    $('#poker-board').classList.add('hidden');
    $('#mille-board').classList.add('hidden');
    showScreen('game-screen');
    renderScala40();
  }

  function createPokerCard(card, faceDown = false) {
    const element = document.createElement('div');
    element.className = `playing-card${faceDown ? ' card-back' : BLACKJACK_SUITS[card.suit].red ? ' red-suit' : ''}`;
    element.setAttribute('aria-label', faceDown ? 'Carta coperta' : blackjackCardLabel(card));
    if (faceDown) {
      element.textContent = 'ULTRA';
      return element;
    }
    const rank = document.createElement('span');
    rank.className = 'playing-card-rank';
    rank.textContent = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }[card.rank] || String(card.rank);
    const suit = document.createElement('span');
    suit.className = 'playing-card-suit';
    suit.setAttribute('aria-hidden', 'true');
    suit.textContent = BLACKJACK_SUITS[card.suit].symbol;
    element.append(rank, suit);
    return element;
  }

  function renderPoker() {
    if (!pokerGame) return;
    const activeIndex = pokerGame.currentPlayer;
    const opponentIndex = (activeIndex + 1) % pokerGame.players.length;
    const player = pokerGame.players[activeIndex];
    const finished = pokerGame.status === 'finished';
    const opponent = pokerGame.players[opponentIndex];
    $('#poker-player-name').textContent = `${player.name.toUpperCase()}${player.folded ? ' · FOLD' : ''}`;
    $('#poker-opponent-name').textContent = `${opponent.name.toUpperCase()}${opponent.folded ? ' · FOLD' : ''}`;
    $('#poker-player-stack').textContent = `STACK · ${player.stack}`;
    $('#poker-opponent-stack').textContent = `STACK · ${opponent.stack}`;
    $('#poker-pot').textContent = pokerGame.pot;
    $('#poker-current-bet').textContent = pokerGame.currentBet;
    $('#poker-street').textContent = pokerGame.street.toUpperCase();
    $('#poker-community').replaceChildren(...pokerGame.community.map((card) => createPokerCard(card)));
    $('#poker-player-hand').replaceChildren(...(pokerHandoffPending ? [] : player.hand.map((card) => createPokerCard(card))));
    $('#poker-opponent-hand').replaceChildren(...opponent.hand.map((card) => createPokerCard(card, !(finished && pokerShowdown))));
    const message = $('#poker-message');
    if (finished) {
      const winners = pokerGame.winners.map((winner) => `${pokerGame.players[winner.index].name} (+${winner.amount})`).join(' · ');
      message.textContent = `Mano terminata · ${winners || 'nessun vincitore'}.`;
      message.className = 'board-message scopa-message success';
      $('#turn-label').textContent = 'MANO TERMINATA';
    } else {
      const toCall = Math.max(0, pokerGame.currentBet - player.bet);
      message.textContent = `${player.name}: ${toCall ? `da vedere ${toCall}` : 'puoi fare check'}. Piatto ${pokerGame.pot}.`;
      message.className = 'board-message scopa-message';
      $('#turn-label').textContent = pokerHandoffPending ? 'PASSA IL DISPOSITIVO' : `TURNO DI ${player.name.toUpperCase()}`;
    }
    const blocked = finished || pokerHandoffPending || player.folded || player.allIn;
    $('#poker-fold').disabled = blocked;
    const checkCall = $('#poker-check-call');
    checkCall.textContent = pokerGame.currentBet === player.bet ? 'CHECK' : `CALL ${Math.min(pokerGame.currentBet - player.bet, player.stack)}`;
    checkCall.disabled = blocked;
    const maxRaise = player.bet + player.stack;
    const minRaise = Math.min(maxRaise, pokerGame.currentBet + pokerGame.minimumRaise);
    const raiseInput = $('#poker-raise-amount');
    raiseInput.min = minRaise;
    raiseInput.max = maxRaise;
    raiseInput.value = String(Math.max(minRaise, Math.min(maxRaise, Number(raiseInput.value) || minRaise)));
    $('#poker-raise').disabled = blocked || maxRaise <= pokerGame.currentBet;
    $('#poker-raise').textContent = Number(raiseInput.value) === maxRaise ? 'ALL-IN / RILANCIA' : 'RILANCIA';
    $('#poker-handoff').classList.toggle('hidden', !pokerHandoffPending);
    if (pokerHandoffPending) {
      $('#poker-handoff-copy').textContent = `Passa il dispositivo a ${player.name}, poi mostra le sue carte private.`;
      $('#poker-handoff-continue').focus();
    }
  }

  function takePokerAction(action, amount) {
    if (!pokerGame || pokerGame.status !== 'playing' || pokerHandoffPending) return;
    const actingPlayer = pokerGame.currentPlayer;
    try {
      PokerEngine.act(pokerGame, actingPlayer, action, amount);
      pokerShowdown = pokerGame.status === 'finished' && action !== 'fold';
      pokerHandoffPending = pokerGame.status === 'playing' && pokerGame.currentPlayer !== actingPlayer;
      renderPoker();
    } catch (error) {
      $('#poker-message').textContent = error.message;
      $('#poker-message').className = 'board-message scopa-message error';
    }
  }

  function milleCardName(card) {
    if (card.type === 'distance') return `${card.distance} chilometri`;
    const labels = {
      stop: 'Stop',
      'speed-limit': 'Limite di velocità',
      accident: 'Incidente',
      'flat-tire': 'Foratura',
      'out-of-gas': 'Fine benzina',
      roll: 'Via libera',
      'end-speed-limit': 'Fine limite',
      repairs: 'Riparazione',
      'spare-tire': 'Ruota di scorta',
      gasoline: 'Benzina',
      'right-of-way': 'Diritto di precedenza',
      'driving-ace': 'Asso del volante',
      'extra-tank': 'Serbatoio supplementare',
      'puncture-proof': 'Pneumatici antiforatura'
    };
    return labels[card.type] || card.type;
  }

  function millePlayerStatus(player) {
    const status = [player.moving && !player.stopped ? 'In marcia' : 'Fermo'];
    if (player.speedLimited) status.push('Limite 50');
    if (player.safeties.length) status.push(`Sicurezze: ${player.safeties.map(milleCardName).join(', ')}`);
    return status.join(' · ');
  }

  function renderMille() {
    if (!milleGame) return;
    const currentIndex = milleGame.currentPlayer;
    const opponentIndex = (currentIndex + 1) % milleGame.players.length;
    const player = milleGame.players[currentIndex];
    const opponent = milleGame.players[opponentIndex];
    const finished = milleGame.status === 'finished';
    $('#mille-player-name').textContent = milleGame.players[0].name;
    $('#mille-opponent-name').textContent = milleGame.players[1].name;
    $('#mille-player-distance').textContent = milleGame.players[0].distance;
    $('#mille-opponent-distance').textContent = milleGame.players[1].distance;
    $('#mille-turn-name').textContent = finished ? 'PARTITA TERMINATA' : player.name.toUpperCase();
    $('#mille-hand-owner').textContent = finished || milleHandoffPending ? '—' : player.name.toUpperCase();
    $('#mille-deck-count').textContent = `${milleGame.deck.length} NEL MAZZO`;
    $('#mille-opponent-hand-count').textContent = `${opponent.hand.length} CARTE`;
    $('#mille-player-status').textContent = millePlayerStatus(milleGame.players[0]);
    $('#mille-opponent-status').textContent = millePlayerStatus(milleGame.players[1]);
    $('#mille-hand-count').textContent = `${player.hand.length} CARTE`;
    const hand = $('#mille-hand');
    hand.replaceChildren();
    if (!milleHandoffPending && !finished) {
      player.hand.forEach((card) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.cardId = card.id;
        button.className = 'scopa-card mille-card mille-hand-card';
        button.classList.toggle('selected', card.id === milleSelectedCardId);
        button.disabled = !milleGame.drawn;
        button.setAttribute('aria-label', milleCardName(card));
        const rank = document.createElement('span');
        rank.className = 'scopa-card-rank';
        rank.textContent = card.type === 'distance' ? String(card.distance) : '↗';
        const name = document.createElement('span');
        name.className = 'mille-card-name';
        name.textContent = milleCardName(card);
        button.append(rank, name);
        hand.append(button);
      });
    }
    const blocked = finished || milleHandoffPending;
    $('#mille-draw').disabled = blocked || milleGame.drawn || milleGame.deck.length === 0;
    $('#mille-play').disabled = blocked || !milleGame.drawn || !milleSelectedCardId;
    $('#mille-discard').disabled = blocked || !milleGame.drawn || !milleSelectedCardId;
    const handoff = $('#mille-handoff');
    handoff.classList.toggle('hidden', !milleHandoffPending);
    if (milleHandoffPending) {
      $('#mille-handoff-copy').textContent = `Passa il dispositivo a ${player.name}, poi mostra la sua mano.`;
      $('#mille-handoff-continue').focus();
    }
    const message = $('#mille-message');
    if (finished) {
      message.textContent = `${milleGame.players[milleGame.winner].name} raggiunge 1000 km e vince!`;
      message.className = 'board-message scopa-message success';
      $('#turn-label').textContent = 'PARTITA TERMINATA';
    } else if (milleHandoffPending) {
      message.textContent = `Passa il dispositivo a ${player.name}.`;
      message.className = 'board-message scopa-message';
      $('#turn-label').textContent = 'PASSA IL DISPOSITIVO';
    } else {
      message.textContent = milleGame.drawn
        ? milleSelectedCardId ? `Selezionata: ${milleCardName(player.hand.find((card) => card.id === milleSelectedCardId) || {})}. Gioca o scarta.`
          : 'Scegli una carta da giocare o scartare.'
        : 'Pesca una carta per iniziare il turno.';
      message.className = 'board-message scopa-message';
      $('#turn-label').textContent = `TURNO DI ${player.name.toUpperCase()}`;
    }
  }

  function startMille() {
    window.clearTimeout(botTimer);
    botTimer = null;
    game = null;
    blackjackGame = null;
    scopaGame = null;
    rubaGame = null;
    scalaGame = null;
    pokerGame = null;
    scalaSelectedCards.clear();
    scalaHandoffPending = false;
    pokerHandoffPending = false;
    pokerShowdown = false;
    milleGame = null;
    milleHandoffPending = false;
    milleSelectedCardId = null;
    const name = $('#player-name').value.trim() || 'Giocatore';
    $('#lobby-player-name').textContent = name;
    milleGame = MilleEngine.createGame([name, 'Avversario']);
    $('#match-label').textContent = 'MILLEMIGLIA · 2 GIOCATORI LOCALI';
    setGameTitle('MILLEMIGLIA');
    $('#uno-board').classList.add('hidden');
    $('#blackjack-board').classList.add('hidden');
    $('#scopa-board').classList.add('hidden');
    $('#ruba-board').classList.add('hidden');
    $('#scala-board').classList.add('hidden');
    $('#poker-board').classList.add('hidden');
    $('#mille-board').classList.remove('hidden');
    showScreen('game-screen');
    renderMille();
  }

  function takeMilleAction(action) {
    if (!milleGame || milleGame.status !== 'playing' || milleHandoffPending || !milleGame.drawn) return;
    const actingPlayer = milleGame.currentPlayer;
    if (!milleSelectedCardId) {
      $('#mille-message').textContent = 'Seleziona una carta dalla mano.';
      return;
    }
    try {
      if (action === 'play') MilleEngine.playCard(milleGame, actingPlayer, milleSelectedCardId);
      else MilleEngine.discardCard(milleGame, actingPlayer, milleSelectedCardId);
      milleSelectedCardId = null;
      milleHandoffPending = milleGame.status === 'playing' && milleGame.currentPlayer !== actingPlayer;
      renderMille();
    } catch (error) {
      $('#mille-message').textContent = error.message;
      $('#mille-message').className = 'board-message scopa-message error';
    }
  }

  function startPoker() {
    window.clearTimeout(botTimer);
    botTimer = null;
    game = null;
    blackjackGame = null;
    scopaGame = null;
    rubaGame = null;
    scalaGame = null;
    scalaSelectedCards.clear();
    scalaHandoffPending = false;
    pokerHandoffPending = false;
    pokerShowdown = false;
    const name = $('#player-name').value.trim() || 'Giocatore';
    $('#lobby-player-name').textContent = name;
    pokerGame = PokerEngine.createGame([name, 'Avversario']);
    $('#match-label').textContent = 'POKER TEXAS · 2 GIOCATORI LOCALI';
    setGameTitle('POKER TEXAS');
    $('#uno-board').classList.add('hidden');
    $('#blackjack-board').classList.add('hidden');
    $('#scopa-board').classList.add('hidden');
    $('#ruba-board').classList.add('hidden');
    $('#scala-board').classList.add('hidden');
    $('#poker-board').classList.remove('hidden');
    $('#mille-board').classList.add('hidden');
    showScreen('game-screen');
    renderPoker();
  }

  function goToLobby() {
    window.clearTimeout(botTimer);
    botTimer = null;
    if (onlineRoom && realtime?.authenticated) realtime.leaveRoom();
    onlineRoom = null;
    onlineGame = false;
    onlineVersion = -1;
    onlineUserIds = [];
    onlinePlayerIndex = 0;
    updateOnlineRoomUI();
    showScreen('lobby-screen');
    refreshPlayerProfile();
  }

  function showResult() {
    window.clearTimeout(botTimer);
    botTimer = null;
    const won = game.winner === (onlineGame ? onlinePlayerIndex : 0);
    $('#result-title').textContent = won ? 'VITTORIA!' : `${game.players[game.winner].name} VINCE`;
    $('#result-title').className = won ? 'won' : 'lost';
    $('#result-copy').textContent = won ? 'Hai svuotato la mano per primo. Bella partita!' : `${game.players[game.winner].name} ha svuotato la mano per primo.`;
    $('#result-dialog').classList.remove('hidden');
    $('#result-again').classList.toggle('hidden', onlineGame);
    $('#result-lobby').focus();
  }

  function drawHumanCard() {
    const playerIndex = onlineGame ? onlinePlayerIndex : 0;
    if (!game || game.currentPlayer !== playerIndex) return;
    if (onlineGame) {
      sendOnlineAction({ type: 'draw' });
      return;
    }
    try {
      const acceptedPenalty = game.pendingDraw > 0;
      const amount = UnoEngine.drawCards(game, playerIndex);
      if (acceptedPenalty) {
        setMessage(`Hai pescato ${amount} carte. Il turno passa.`);
      } else if (UnoEngine.getPlayableCards(game, playerIndex).length === 0) {
        UnoEngine.passTurn(game, playerIndex);
        setMessage(amount ? 'Hai pescato e passato il turno.' : 'Mazzo esaurito: turno passato.');
      } else {
        setMessage('Carta pescata: puoi giocarla oppure passare.');
      }
      renderBoard();
    } catch (error) {
      setMessage(error.message, 'error');
    }
  }

  function setupParticles() {
    const canvas = $('#particles');
    const context = canvas.getContext('2d');
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random(), y: Math.random(),
      radius: 0.6 + Math.random() * 1.7,
      speed: 0.00015 + Math.random() * 0.0004,
      phase: Math.random() * Math.PI * 2
    }));
    let width = 0;
    let height = 0;

    function resize() {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
    }
    function draw(time) {
      context.clearRect(0, 0, width, height);
      particles.forEach((particle) => {
        particle.y -= particle.speed * 0.45;
        if (particle.y < -0.02) particle.y = 1.02;
        const glow = 0.35 + (Math.sin(time * 0.001 + particle.phase) + 1) * 0.28;
        context.beginPath();
        context.arc(particle.x * width, particle.y * height, particle.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(0, 188, 212, ${glow})`;
        context.shadowColor = '#00bcd4';
        context.shadowBlur = particle.radius * 8;
        context.fill();
      });
      window.requestAnimationFrame(draw);
    }
    window.addEventListener('resize', resize);
    resize();
    window.requestAnimationFrame(draw);
  }

  async function changeTheme() {
    if (!storeData && !await loadStore()) return;
    const themes = ['cyber-blue', ...storeData.items.filter((item) => item.owned).map((item) => item.theme)];
    const current = document.documentElement.dataset.theme;
    const next = themes[(themes.indexOf(current) + 1) % themes.length];
    const item = next === 'cyber-blue' ? 'theme-cyber' : storeData.items.find((entry) => entry.theme === next)?.id;
    if (!item) return;
    await updateStoreItem('equip', item);
  }

  function handleEscape(event) {
    if (event.key !== 'Escape') return;
    const colorDialog = $('#color-dialog');
    const resultDialog = $('#result-dialog');
    if (!$('#battle-card-reward-dialog').classList.contains('hidden')) {
      closeBattleRewardDialog();
    } else if (!colorDialog.classList.contains('hidden')) {
      colorDialog.classList.add('hidden');
      chosenCardId = null;
    } else if (!$('#scopa-capture-dialog').classList.contains('hidden')) {
      $('#scopa-capture-dialog').classList.add('hidden');
      scopaCaptureTrigger?.focus();
      scopaCaptureTrigger = null;
    } else if (!$('#scala-handoff').classList.contains('hidden')) {
      goToLobby();
    } else if (!$('#poker-handoff').classList.contains('hidden')) {
      goToLobby();
    } else if (!$('#mille-handoff').classList.contains('hidden')) {
      goToLobby();
    } else if (!resultDialog.classList.contains('hidden')) {
      resultDialog.classList.add('hidden');
    } else if (!$('#game-screen').classList.contains('hidden')) {
      goToLobby();
    }
  }

  function containModalFocus(event) {
    if (event.key !== 'Tab') return;
    const dialog = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
      .find((element) => !element.closest('.hidden') && !element.hidden);
    if (!dialog) return;

    const focusable = [...dialog.querySelectorAll(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )].filter((element) => !element.closest('[hidden]') && element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!dialog.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  $('#advance-button').addEventListener('click', () => {
    const nameField = $('#player-name');
    const name = nameField.value.trim();
    if (name.length < 3 || name.length > 15) {
      nameField.setCustomValidity('Il nome deve contenere da 3 a 15 caratteri.');
      nameField.reportValidity();
      return;
    }
    nameField.setCustomValidity('');
    $('#login-username').value = name;
    setAuthMode('login');
    showScreen('auth-screen');
  });
  $('#quick-play-button').addEventListener('click', continueAsGuest);
  $('#guest-play-button').addEventListener('click', continueAsGuest);
  $('#auth-back').addEventListener('click', () => showScreen('home-screen'));
  $('#login-tab').addEventListener('click', () => setAuthMode('login'));
  $('#register-tab').addEventListener('click', () => setAuthMode('register'));
  $('#login-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submitAuth(event.currentTarget, 'login');
  });
  $('#register-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submitAuth(event.currentTarget, 'register');
  });
  $('#play-button').addEventListener('click', startGame);
  $('#matchmaking-button').addEventListener('click', async () => {
    try {
      const client = await connectRealtime();
      if (matchmakingActive) {
        client.cancelMatchmaking();
        matchmakingActive = false;
        $('#matchmaking-status').hidden = true;
        $('#matchmaking-button').textContent = 'CERCA PARTITA RANKED';
        return;
      }
      $('#matchmaking-status').hidden = false;
      $('#matchmaking-status').textContent = 'Connessione alla coda competitiva…';
      client.queueRankedMatch();
    } catch (error) {
      $('#matchmaking-status').hidden = false;
      $('#matchmaking-status').textContent = error.message;
    }
  });
  $('#game-mode').addEventListener('change', (event) => {
    const mode = event.currentTarget.value;
    const blackjackSelected = mode === 'blackjack';
    const scopaSelected = mode === 'scopa';
    const rubaSelected = mode === 'ruba-mazzetto';
    const scalaSelected = mode === 'scala40';
    const pokerSelected = mode === 'poker';
    const milleSelected = mode === 'mille';
    const nonUnoSelected = blackjackSelected || scopaSelected || rubaSelected || scalaSelected || pokerSelected || milleSelected;
    const heading = $('.mode-panel h3');
    const description = $('.mode-panel > p');
    const stats = $('.mode-stats');
    const gameNames = { uno: 'UNO ', blackjack: 'BLACKJACK', scopa: 'SCOPA', 'ruba-mazzetto': 'RUBA MAZZETTO', scala40: 'SCALA 40', poker: 'POKER TEXAS', mille: 'MILLEMIGLIA' };
    heading.replaceChildren(document.createTextNode(gameNames[mode]));
    if (mode === 'uno') {
      const subtitle = document.createElement('span');
      subtitle.textContent = 'CLASSIC';
      heading.append(subtitle);
    }
    const modeDescriptions = {
      uno: 'Gioca una partita classica contro tre profili bot. Svuota la mano per conquistare la vittoria.',
      blackjack: 'Sfida il banco: chiedi carta, fermati o raddoppia dopo le prime due carte.',
      scopa: 'Partita locale a turni per due giocatori: cattura le carte e fai scopa svuotando il tavolo.',
      'ruba-mazzetto': 'Partita hot-seat: abbina il valore della cima avversaria per rubare tutto il suo mazzetto.',
      scala40: 'Partita hot-seat per due: crea scale o tris, apri con almeno 40 punti e scarta per chiudere.',
      poker: 'No-Limit Hold’em locale per due: punta, fai call/check o fold fino al flop, turn, river e showdown.',
      mille: 'Partita hot-seat per due: pesca, avvia la corsa, gioca distanze o imprevisti e raggiungi 1000 km.'
    };
    description.textContent = modeDescriptions[mode];
    stats.children[0].querySelector('strong').textContent = mode === 'uno' ? '4' : '2';
    stats.children[0].querySelector('small').textContent = 'GIOCATORI';
    stats.children[1].querySelector('strong').textContent = scopaSelected || rubaSelected ? '40' : blackjackSelected || pokerSelected ? '52' : milleSelected ? '106' : '108';
    stats.children[1].querySelector('small').textContent = 'CARTE';
    stats.children[2].querySelector('strong').textContent = blackjackSelected ? '21' : scopaSelected ? '4' : rubaSelected ? '2' : scalaSelected ? '40' : pokerSelected ? '1000' : milleSelected ? '1000' : '3';
    stats.children[2].querySelector('small').textContent = blackjackSelected ? 'OBIETTIVO' : scopaSelected ? 'SEMI' : rubaSelected ? 'MAZZETTI' : scalaSelected ? 'APERTURA' : pokerSelected ? 'STACK INIZIALE' : milleSelected ? 'KM OBIETTIVO' : 'BOT AI';
    $('#competitive-toggle').closest('.toggle-row').classList.toggle('hidden', nonUnoSelected);
    $('.room-tools').classList.toggle('hidden', nonUnoSelected);
    const playLabels = {
      uno: 'GIOCA ORA ',
      blackjack: 'GIOCA CONTRO IL BANCO ',
      scopa: 'GIOCA A SCOPA ',
      'ruba-mazzetto': 'GIOCA A RUBA MAZZETTO ',
      scala40: 'GIOCA A SCALA 40 ',
      poker: 'GIOCA A POKER ',
      mille: 'GIOCA A MILLEMIGLIA '
    };
    const playButton = $('#play-button');
    playButton.replaceChildren(document.createTextNode(playLabels[mode]));
    const arrow = document.createElement('span');
    arrow.textContent = '→';
    playButton.append(arrow);
    updateOnlineRoomUI();
  });
  $('#competitive-toggle').addEventListener('change', (event) => {
    if (guestMode && event.currentTarget.checked) {
      event.currentTarget.checked = false;
      showLobbyNotice('La modalità competitiva richiede un account e una connessione online.');
    }
    if (!event.currentTarget.checked && matchmakingActive && realtime?.authenticated) {
      realtime.cancelMatchmaking();
      matchmakingActive = false;
      $('#matchmaking-status').hidden = true;
      $('#matchmaking-button').textContent = 'CERCA PARTITA RANKED';
    }
    updateOnlineRoomUI();
  });
  $('#create-room-button').addEventListener('click', async () => {
    try {
      if ($('#game-mode').value !== 'uno') throw new Error('Le stanze online supportano al momento solo UNO Classic.');
      const client = await connectRealtime();
      client.createRoom();
    } catch (error) {
      showLobbyNotice(error.message);
    }
  });
  $('#join-room-button').addEventListener('click', async () => {
    try {
      if ($('#game-mode').value !== 'uno') throw new Error('Le stanze online supportano al momento solo UNO Classic.');
      const client = await connectRealtime();
      client.joinRoom($('#room-code').value.trim());
    } catch (error) {
      showLobbyNotice(error.message);
    }
  });
  $('#start-online-button').addEventListener('click', startOnlineGame);
  $('#leave-room-button').addEventListener('click', () => {
    if (onlineRoom && realtime?.authenticated) realtime.leaveRoom();
    onlineRoom = null;
    onlineGame = false;
    onlineUserIds = [];
    updateOnlineRoomUI();
    showLobbyNotice('Sei uscito dalla stanza.');
  });
  $('#draw-button').addEventListener('click', drawHumanCard);
  $('#blackjack-hit').addEventListener('click', () => {
    if (!blackjackGame || blackjackGame.status !== 'playing') return;
    BlackjackEngine.hit(blackjackGame);
    renderBlackjack();
  });
  $('#blackjack-stand').addEventListener('click', () => {
    if (!blackjackGame || blackjackGame.status !== 'playing') return;
    BlackjackEngine.stand(blackjackGame);
    renderBlackjack();
  });
  $('#blackjack-double').addEventListener('click', () => {
    if (!blackjackGame || blackjackGame.status !== 'playing') return;
    try {
      BlackjackEngine.doubleDown(blackjackGame);
      renderBlackjack();
    } catch (error) {
      $('#blackjack-message').textContent = error.message;
      $('#blackjack-message').classList.add('error');
    }
  });
  $('#scopa-capture-cancel').addEventListener('click', () => {
    $('#scopa-capture-dialog').classList.add('hidden');
    scopaCaptureTrigger?.focus();
    scopaCaptureTrigger = null;
  });
  $('#scala-draw-deck').addEventListener('click', () => drawScalaCard());
  $('#scala-draw-discard').addEventListener('click', () => drawScalaCard(true));
  $('#scala-meld').addEventListener('click', layScalaMeld);
  $('#scala-discard').addEventListener('click', discardScalaCard);
  $('#scala-handoff-continue').addEventListener('click', () => {
    scalaHandoffPending = false;
    scalaSelectedCards.clear();
    renderScala40();
    $('#scala-hand').querySelector('button')?.focus();
  });
  $('#poker-fold').addEventListener('click', () => takePokerAction('fold'));
  $('#poker-check-call').addEventListener('click', () => {
    if (!pokerGame) return;
    const player = pokerGame.players[pokerGame.currentPlayer];
    takePokerAction(player.bet === pokerGame.currentBet ? 'check' : 'call');
  });
  $('#poker-raise').addEventListener('click', () => {
    const amount = Number($('#poker-raise-amount').value);
    takePokerAction('raise', amount);
  });
  $('#poker-handoff-continue').addEventListener('click', () => {
    pokerHandoffPending = false;
    renderPoker();
    $('#poker-check-call').focus();
  });
  $('#mille-draw').addEventListener('click', () => {
    if (!milleGame || milleGame.status !== 'playing' || milleHandoffPending) return;
    try {
      MilleEngine.draw(milleGame, milleGame.currentPlayer);
      milleSelectedCardId = null;
      renderMille();
    } catch (error) {
      $('#mille-message').textContent = error.message;
      $('#mille-message').className = 'board-message scopa-message error';
    }
  });
  $('#mille-hand').addEventListener('click', (event) => {
    const card = event.target.closest('button[data-card-id]');
    if (!card || !milleGame?.drawn || milleHandoffPending) return;
    milleSelectedCardId = card.dataset.cardId;
    renderMille();
  });
  $('#mille-play').addEventListener('click', () => takeMilleAction('play'));
  $('#mille-discard').addEventListener('click', () => takeMilleAction('discard'));
  $('#mille-handoff-continue').addEventListener('click', () => {
    milleHandoffPending = false;
    milleSelectedCardId = null;
    renderMille();
    $('#mille-hand').querySelector('button')?.focus();
  });
  $('#pass-button').addEventListener('click', () => {
    const playerIndex = onlineGame ? onlinePlayerIndex : 0;
    if (!game || game.currentPlayer !== playerIndex || !game.justDrawnCardId) return;
    if (onlineGame) {
      sendOnlineAction({ type: 'pass' });
      return;
    }
    UnoEngine.passTurn(game, playerIndex);
    setMessage('Hai passato il turno.');
    renderBoard();
  });
  $('#back-button').addEventListener('click', goToLobby);
  $('#new-game-button').addEventListener('click', startGame);
  $('#result-again').addEventListener('click', startGame);
  $('#result-lobby').addEventListener('click', () => {
    $('#result-dialog').classList.add('hidden');
    goToLobby();
  });
  $('#theme-button').addEventListener('click', changeTheme);
  $('#store-items').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-store-action]');
    if (button) updateStoreItem(button.dataset.storeAction, button.dataset.itemId);
  });
  $('#locker-items').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-locker-item-id]');
    if (button && !button.disabled) updateStoreItem('equip', button.dataset.lockerItemId);
  });
  $('#logout-button').addEventListener('click', logout);
  $('.color-options').addEventListener('click', (event) => {
    const choice = event.target.closest('[data-color]');
    if (choice && chosenCardId) playHumanCard(chosenCardId, choice.dataset.color);
  });
  $('#close-dialog').addEventListener('click', () => {
    chosenCardId = null;
    $('#color-dialog').classList.add('hidden');
  });
  $('#battle-card-panel').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-battle-action]');
    if (button && !button.disabled) performBattleCardAction(button);
  });
  $('#challenge-list').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-challenge-id]');
    if (button && !button.disabled) claimDailyChallenge(button);
  });
  $('#battle-card-reward-dialog').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-battle-action]');
    if (button && !button.disabled) performBattleCardAction(button);
  });
  document.addEventListener('keydown', handleEscape);
  document.addEventListener('keydown', containModalFocus);

  document.querySelectorAll('[data-section]').forEach((button) => {
    button.addEventListener('click', () => {
      const section = button.dataset.section;
      if (!['play', 'shop', 'wallet', 'locker', 'pass', 'challenges', 'career'].includes(section)) {
        showLobbyNotice(`${button.textContent.trim()}: disponibile in un prossimo aggiornamento.`);
        return;
      }
      const shopping = section === 'shop';
      const wallet = section === 'wallet';
      const locker = section === 'locker';
      const battleCard = section === 'pass';
      const challenges = section === 'challenges';
      const profile = section === 'career';
      $('#lobby-notice').hidden = true;
      $('#play-layout').classList.toggle('hidden', shopping || wallet || locker || battleCard || challenges || profile);
      $('.coming-soon').classList.toggle('hidden', shopping || wallet || locker || battleCard || challenges || profile);
      $('#store-panel').classList.toggle('hidden', !shopping);
      $('#wallet-panel').classList.toggle('hidden', !wallet);
      $('#locker-panel').classList.toggle('hidden', !locker);
      $('#profile-panel').classList.toggle('hidden', !profile);
      $('#battle-card-panel').classList.toggle('hidden', !battleCard);
      $('#challenges-panel').classList.toggle('hidden', !challenges);
      document.querySelectorAll('[data-section]').forEach((item) => {
        if (item.classList.contains('side-link')) item.classList.toggle('selected', item.dataset.section === section);
        if (item.classList.contains('top-tab')) item.classList.toggle('active', item.dataset.section === section);
      });
      if (shopping || wallet || locker) loadStore();
      if (profile) {
        if (guestMode || !localStorage.getItem('uno-ultra-token')) {
          $('#profile-message').textContent = 'Accedi o crea un account per visualizzare e salvare le statistiche del profilo.';
          $('#profile-stats').replaceChildren();
        } else {
          $('#profile-message').textContent = 'Caricamento profilo…';
          refreshPlayerProfile().then((loaded) => {
            if (!loaded && !$('#profile-message').textContent) {
              $('#profile-message').textContent = 'Impossibile caricare il profilo.';
            }
          });
        }
      }
      if (battleCard) loadBattleCard();
      if (challenges) loadChallenges();
    });
  });

  try {
    const savedTheme = localStorage.getItem('uno-ultra-theme');
    const savedToken = localStorage.getItem('uno-ultra-token');
    if (['cyber-blue', 'lava-red', 'matrix-green', 'royal-purple'].includes(savedTheme)) {
      document.documentElement.dataset.theme = savedTheme;
    }
    if (savedToken) {
      refreshPlayerProfile().then((loaded) => {
        if (loaded) showScreen('lobby-screen');
      });
    }
  } catch (error) {
    console.error('Impossibile leggere il tema salvato:', error.message);
  }
  setupParticles();
}());
