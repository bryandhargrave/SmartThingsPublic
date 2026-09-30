'use strict';
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

function createLogger(level = 'info', sink = console) {
  const min = LEVELS[level] || LEVELS.info;
  const fmt = (lvl, msg) => `${new Date().toISOString()} ${lvl.padEnd(5)} ${msg}`;
  const log = (lvl, msg) => {
    if ((LEVELS[lvl] || 0) < min) return;
    (lvl === 'error' || lvl === 'warn' ? sink.error : sink.log)(fmt(lvl, msg));
  };
  log.debug = (m) => log('debug', m);
  log.info = (m) => log('info', m);
  log.warn = (m) => log('warn', m);
  log.error = (m) => log('error', m);
  log.level = level;
  return log;
}

module.exports = { createLogger, LEVELS };
