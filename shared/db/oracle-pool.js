// ============================================================
// shared/db/oracle-pool.js — Oracle 연결 풀 (싱글톤)
//
// 원본: json_to_cpdb.js (CommonJS → ESM 변환)
// 사용 도메인: oracle (process_card_file, test_db_connection)
//
// @example
//   import { initializeDB, getConnection, closeDB } from '../shared/db/oracle-pool.js';
//   await initializeDB();
//   const conn = await getConnection();
//   try {
//     const result = await conn.execute('SELECT SYSDATE FROM DUAL');
//   } finally {
//     await conn.close();
//   }
// ============================================================

import oracledb from 'oracledb';
import { createLogger } from '../logger.js';

const logger = createLogger('oracle-db');

let initialized = false;
let clientInitialized = false;

/**
 * Oracle DB 연결 풀 초기화
 * Thick 모드 + 커넥션 풀 생성 + 연결 테스트
 *
 * @returns {Promise<boolean>} 성공 여부
 */
export async function initializeDB() {
  if (initialized) {
    logger.debug('Oracle DB 이미 초기화됨, 스킵');
    return true;
  }

  try {
    // Thick 모드 초기화 (한 번만)
    if (!clientInitialized) {
      const clientPath = process.env.ORACLE_CLIENT_PATH || null;
      if (clientPath) {
        logger.info(`Oracle Instant Client 경로: ${clientPath}`);
        oracledb.initOracleClient({ libDir: clientPath });
      } else {
        try {
          oracledb.initOracleClient();
        } catch (err) {
          if (err.message.includes('DPI-1047') || err.message.includes('already initialized')) {
            logger.warn('Oracle Client 초기화 건너뜀 (이미 초기화되었거나 경로 필요)');
          } else {
            throw err;
          }
        }
      }
      clientInitialized = true;
    }

    // 연결 풀 생성
    const dbConfig = {
      user: process.env.ORACLE_USER || 'cdapp2016',
      password: process.env.ORACLE_PASSWORD || 'cdapp2016',
      connectString: process.env.ORACLE_CONNECT_STRING || 'localhost:1523/xe',
      poolMin: 1,
      poolMax: 10,
      poolIncrement: 1
    };

    await oracledb.createPool(dbConfig);
    logger.info('Oracle DB 연결 풀 생성 완료');

    // 연결 테스트
    let connection;
    try {
      connection = await oracledb.getConnection();
      const result = await connection.execute('SELECT SYSDATE FROM DUAL');
      logger.info(`DB 연결 테스트 성공: ${result.rows[0][0]}`);
      initialized = true;
      return true;
    } finally {
      if (connection) {
        await connection.close();
      }
    }

  } catch (error) {
    logger.error('DB 연결 실패:', error.message);
    if (error.message.includes('NJS-138')) {
      logger.error(
        '해결 방법:\n' +
        '1. Oracle Instant Client 다운로드 및 설치\n' +
        '2. 환경변수 설정: ORACLE_CLIENT_PATH=/path/to/instantclient\n' +
        '3. 재시도'
      );
    }
    return false;
  }
}

/**
 * Oracle 커넥션 획득
 * 반드시 사용 후 conn.close()를 호출하세요.
 *
 * @returns {Promise<import('oracledb').Connection>}
 */
export async function getConnection() {
  return oracledb.getConnection();
}

/**
 * Oracle 연결 풀 종료
 * 서버 shutdown 시 호출
 */
export async function closeDB() {
  try {
    await oracledb.getPool().close(0);
    initialized = false;
    logger.info('Oracle DB 연결 풀 종료 완료');
  } catch (error) {
    logger.error('DB 종료 실패:', error.message);
  }
}
