// ============================================================
// shared/logger.js — MCP 서버용 통합 로거
//
// MCP는 stdout을 JSON-RPC 프로토콜에 사용하므로
// 모든 로그를 stderr(console.error)로 출력
// ============================================================

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

const LEVEL_CONFIG = {
  error: { color: COLORS.red, label: 'ERROR' },
  warn: { color: COLORS.yellow, label: 'WARN ' },
  info: { color: COLORS.blue, label: 'INFO ' },
  debug: { color: COLORS.magenta, label: 'DEBUG' },
  trace: { color: COLORS.cyan, label: 'TRACE' }
};

export class Logger {
  /**
   * @param {string} prefix - 도메인 식별자 (예: 'benefit', 'schema', 'oracle', 'profit', 'doc-gen')
   */
  constructor(prefix = '') {
    const envLevel = process.env.LOG_LEVEL?.toLowerCase();
    const defaultLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

    this.prefix = prefix ? `[${prefix}] ` : '';
    this.currentLevel = LOG_LEVELS[envLevel] !== undefined ? envLevel : defaultLevel;
    this.currentLevelValue = LOG_LEVELS[this.currentLevel];
    this.useColors = process.env.NO_COLOR !== '1' && process.stderr?.isTTY;
  }

  getTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
           `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  shouldLog(level) {
    return LOG_LEVELS[level] <= this.currentLevelValue;
  }

  formatValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (value instanceof Error) return `${value.message}\n${value.stack}`;
    if (typeof value === 'object') {
      try { return JSON.stringify(value, null, 2); }
      catch { return '[Object]'; }
    }
    return String(value);
  }

  log(level, ...args) {
    if (!this.shouldLog(level)) return;

    const config = LEVEL_CONFIG[level];
    const timestamp = this.getTimestamp();
    const message = args.map(arg => this.formatValue(arg)).join(' ');

    const ts = this.useColors ? `${COLORS.gray}${timestamp}${COLORS.reset}` : timestamp;
    const lv = this.useColors ? `${config.color}[${config.label}]${COLORS.reset}` : `[${config.label}]`;

    console.error(`${ts} ${lv} ${this.prefix}${message}`);
  }

  error(...args) { this.log('error', ...args); }
  warn(...args) { this.log('warn', ...args); }
  info(...args) { this.log('info', ...args); }
  debug(...args) { this.log('debug', ...args); }
  trace(...args) { this.log('trace', ...args); }

  setLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
      this.currentLevel = level;
      this.currentLevelValue = LOG_LEVELS[level];
    }
  }
}

export { LOG_LEVELS };

/**
 * 팩토리 함수 — 도메인별로 간단히 생성
 * @example
 *   import { createLogger } from '../shared/logger.js';
 *   const logger = createLogger('oracle');
 */
export function createLogger(prefix) {
  return new Logger(prefix);
}
