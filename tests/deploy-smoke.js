'use strict';

const { randomUUID } = require('node:crypto');
const WebSocket = require('ws');

function waitForMessage(socket, expectedType) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Timeout in attesa di ${expectedType}.`)), 10000);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    const finish = (error, message) => {
      cleanup();
      if (error) reject(error);
      else resolve(message);
    };
    const onMessage = (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch (error) {
        finish(new Error(`Risposta WebSocket non JSON: ${error.message}`));
        return;
      }
      if (message.type === 'error') {
        finish(new Error(message.payload?.message || 'Errore WebSocket inatteso.'));
      } else if (message.type === expectedType) {
        finish(null, message);
      }
    };
    const onError = (error) => finish(error);
    const onClose = (code) => finish(new Error(`WebSocket chiuso prima di ${expectedType} (codice ${code}).`));
    socket.on('message', onMessage);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

function waitForClose(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('Timeout in attesa della chiusura WebSocket.')), 10000);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('close', onClose);
      socket.off('error', onError);
    };
    const finish = (error, code) => {
      cleanup();
      if (error) reject(error);
      else resolve(code);
    };
    const onClose = (code) => finish(null, code);
    const onError = (error) => finish(error);
    socket.once('close', onClose);
    socket.once('error', onError);
  });
}

async function openWebSocket(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  return socket;
}

async function smokeTest(baseUrl) {
  const ready = await fetch(new URL('/ready', baseUrl));
  if (!ready.ok) throw new Error(`Servizio non pronto: HTTP ${ready.status}.`);

  const username = `ci${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  const registerResponse = await fetch(new URL('/api/auth/register', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'DeploySmoke123' })
  });
  const registered = await registerResponse.json();
  if (registerResponse.status !== 201 || !registered.token) {
    throw new Error(`Registrazione deploy non riuscita: HTTP ${registerResponse.status} ${registered.error || ''}`);
  }

  let socket;
  let revokedSocket;
  try {
    const profileResponse = await fetch(new URL('/api/auth/me', baseUrl), {
      headers: { Authorization: `Bearer ${registered.token}` }
    });
    if (!profileResponse.ok) throw new Error(`Verifica profilo fallita: HTTP ${profileResponse.status}.`);

    const websocketUrl = new URL('/ws', baseUrl);
    websocketUrl.protocol = websocketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = await openWebSocket(websocketUrl);
    const authenticated = waitForMessage(socket, 'auth.ok');
    socket.send(JSON.stringify({ type: 'auth', payload: { token: registered.token } }));
    if ((await authenticated).payload.userId !== String(registered.user.id)) {
      throw new Error('L’identità WebSocket non corrisponde al profilo registrato.');
    }

    const createdRoom = waitForMessage(socket, 'room.created');
    socket.send(JSON.stringify({ type: 'room.create', payload: {} }));
    if (!(await createdRoom).payload.id) throw new Error('La stanza WebSocket creata non ha un codice.');

    const logoutResponse = await fetch(new URL('/api/auth/logout', baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${registered.token}` }
    });
    if (!logoutResponse.ok) throw new Error(`Revoca sessione fallita: HTTP ${logoutResponse.status}.`);

    const revokedProfile = await fetch(new URL('/api/auth/me', baseUrl), {
      headers: { Authorization: `Bearer ${registered.token}` }
    });
    if (revokedProfile.status !== 401) throw new Error('Il token revocato è ancora valido per le API.');

    revokedSocket = await openWebSocket(websocketUrl);
    const rejected = waitForClose(revokedSocket);
    revokedSocket.send(JSON.stringify({ type: 'auth', payload: { token: registered.token } }));
    if (await rejected !== 1008) throw new Error('WebSocket non ha rifiutato il token revocato.');
  } finally {
    socket?.terminate();
    revokedSocket?.terminate();
  }
}

const baseUrl = process.argv[2] || 'http://localhost:8080';
smokeTest(baseUrl).then(() => {
  console.log(`Deploy smoke test passed via ${baseUrl}: registration, Redis revocation, and Nginx WebSocket.`);
}).catch((error) => {
  console.error(`Deploy smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
