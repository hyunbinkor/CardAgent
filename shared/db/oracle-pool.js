// ============================================================
// shared/db/oracle-pool.js — Oracle 연결 풀 (싱글톤)
//
// 원본: json_to_cpdb.js (CommonJS → ESM 변환)
// 사용 도메인: oracle (process_card_file, test_db_connection)
//
// v3.0.1 수정:
//   - getConnection()에 lazy init 추가 (initializeDB 자동 호출)
//   - closePool alias export 추가 (index.js shutdown 호환)
//
// v3.0.3 수정:
//   - initializeDB() 실패 시 실제 에러를 lastInitError에 저장
//   - getConnection()에서 실제 에러 메시지를 전파 (기존: 항상 "환경변수 확인" 고정 메시지)
//   - NJS-047 (풀 alias 미발견) 에러 안내 추가
//   - initializeDB() 중복 호출 방어 (initPromise 잠금)
//
// @example
//   import { getConnection, closePool } from '../shared/db/oracle-pool.js';
//   const conn = await getConnection();  // 풀 미초기화 시 자동 초기화
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
let lastInitError = null;   // [v3.0.3] 마지막 초기화 에러 보존
let initPromise = null;     // [v3.0.3] 동시 호출 방어

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

  // [v3.0.3] 이전 에러 초기화
  lastInitError = null;

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
      connectString: process.env.ORACLE_CONNECT_STRING || 'localhost:1523/fcamdb23',
      poolMin: 1,
      poolMax: 10,
      poolIncrement: 1
    };

    logger.info(`Oracle 연결 풀 생성 시도: ${dbConfig.user}@${dbConfig.connectString}`);
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
    // [v3.0.3] 실제 에러 보존
    lastInitError = error;
    logger.error('DB 연결 실패:', error.message);

    // 에러 유형별 상세 안내
    if (error.message.includes('NJS-138')) {
      logger.error(
        '해결 방법:\n' +
        '1. Oracle Instant Client 다운로드 및 설치\n' +
        '2. 환경변수 설정: ORACLE_CLIENT_PATH=/path/to/instantclient\n' +
        '3. 재시도'
      );
    } else if (error.message.includes('NJS-047')) {
      logger.error('pool alias가 캐시에 없습니다. 풀 생성에 문제가 있었을 수 있습니다.');
    } else if (error.message.includes('DPI-1047')) {
      logger.error(
        'Oracle Client 라이브러리를 찾을 수 없습니다.\n' +
        `현재 ORACLE_CLIENT_PATH: ${process.env.ORACLE_CLIENT_PATH || '(미설정)'}\n` +
        '해당 경로에 oci.dll (Windows) 또는 libclntsh.so (Linux)가 있는지 확인하세요.'
      );
    } else if (error.message.includes('ORA-12541')) {
      logger.error(
        'TNS 리스너가 응답하지 않습니다.\n' +
        `현재 ORACLE_CONNECT_STRING: ${process.env.ORACLE_CONNECT_STRING || '(미설정)'}\n` +
        'Oracle DB 서비스가 실행 중인지, 호스트/포트가 올바른지 확인하세요.'
      );
    } else if (error.message.includes('ORA-01017')) {
      logger.error(
        '사용자명/패스워드가 잘못되었습니다.\n' +
        `현재 ORACLE_USER: ${process.env.ORACLE_USER || '(미설정)'}`
      );
    }

    return false;
  }
}

/**
 * Oracle 커넥션 획득 (lazy init 포함)
 * 풀이 초기화되지 않았으면 자동으로 initializeDB()를 호출합니다.
 * 반드시 사용 후 conn.close()를 호출하세요.
 *
 * [v3.0.3] 실제 Oracle 에러 메시지를 전파합니다.
 *
 * @returns {Promise<import('oracledb').Connection>}
 * @throws {Error} DB 초기화 실패 시 (실제 Oracle 에러 포함)
 */
export async function getConnection() {
  if (!initialized) {
    // [v3.0.3] 동시 호출 방어: 여러 도구가 동시에 getConnection()을 호출해도
    //          initializeDB()는 한 번만 실행
    if (!initPromise) {
      logger.info('Oracle 풀 미초기화 상태, 자동 초기화 시작...');
      initPromise = initializeDB().finally(() => {
        initPromise = null;
      });
    }

    const success = await initPromise;

    if (!success) {
      // [v3.0.3] 실제 에러를 전파 — 기존: 항상 "환경변수 확인" 고정 메시지
      const realError = lastInitError?.message || '알 수 없는 오류';
      throw new Error(`Oracle DB 초기화 실패: ${realError}`);
    }
  }
  return oracledb.getConnection();
}

/**
 * Oracle 연결 풀 종료
 * 서버 shutdown 시 호출
 */
export async function closeDB() {
  if (!initialized) return;
  try {
    await oracledb.getPool().close(0);
    initialized = false;
    logger.info('Oracle DB 연결 풀 종료 완료');
  } catch (error) {
    logger.error('DB 종료 실패:', error.message);
  }
}

// index.js shutdown 호환용 alias
export { closeDB as closePool };