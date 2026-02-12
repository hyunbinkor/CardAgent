// ============================================================
// shared/db/mysql-pool.js — MySQL 연결 풀 (싱글톤)
//
// 원본: card_mcp.js (mysql.createConnection → createPool 변환)
// 사용 도메인: benefit (search_cards, search_services 등)
//
// @example
//   import { getPool, query } from '../shared/db/mysql-pool.js';
//   const rows = await query('SELECT * FROM card_products WHERE issuer = ?', ['신한카드']);
// ============================================================

import mysql from 'mysql2/promise';
import { createLogger } from '../logger.js';

const logger = createLogger('mysql');

let pool = null;

/**
 * MySQL 연결 풀 생성 (싱글톤)
 * 최초 호출 시에만 풀을 생성하고, 이후에는 기존 풀을 반환합니다.
 * @returns {import('mysql2/promise').Pool}
 */
export function getPool() {
  if (!pool) {
    const config = {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER || 'devuser',
      password: process.env.MYSQL_PASSWORD || 'devpass123',
      database: process.env.MYSQL_DATABASE || 'mydata',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0
    };

    pool = mysql.createPool(config);
    logger.info(`MySQL 풀 생성 완료 (${config.host}:${config.port}/${config.database})`);
  }
  return pool;
}

/**
 * SQL 쿼리 실행 헬퍼
 * 풀이 없으면 자동 생성합니다.
 *
 * @param {string} sql - SQL 문
 * @param {Array} [params] - 바인드 파라미터
 * @returns {Promise<Array>} rows
 */
export async function query(sql, params = []) {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

/**
 * MySQL 풀 종료
 * 서버 shutdown 시 호출
 */
export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('MySQL 풀 종료 완료');
  }
}
