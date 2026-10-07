'use strict';

function loadConfig(environment = process.env) {
  const jwtSecret = environment.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET è obbligatorio e deve contenere almeno 32 caratteri.');
  }

  const port = Number(environment.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT deve essere un numero intero compreso tra 1 e 65535.');
  }

  const redisUrl = environment.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL è obbligatorio per verificare e revocare le sessioni.');
  }

  return { port, jwtSecret, redisUrl };
}

module.exports = { loadConfig };
