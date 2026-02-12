// ============================================================
// tools/oracle/connection-test.js — Oracle DB 연결 테스트
//
// 원본: oracle-card-processor/index.js → testDbConnection()
// 개선:
//   - 인라인 DB 초기화 → 공유 oracle-pool.js 사용
//   - console.error → createLogger('oracle')
//   - MCP 응답 래퍼 사용
// ============================================================

import { getConnection } from '../../shared/db/oracle-pool.js';
import { mcpText, mcpError } from '../../shared/utils.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('oracle');

/**
 * Oracle DB 연결 테스트
 *
 * SELECT SYSDATE FROM DUAL 실행으로 연결 상태 확인
 *
 * @returns {Promise<Object>} MCP 응답
 */
export async function testDbConnection() {
  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute('SELECT SYSDATE FROM DUAL');

    const sysdate = result.rows[0][0];
    logger.info(`DB 연결 테스트 성공: ${sysdate}`);

    return mcpText(`✅ DB 연결 성공: ${sysdate}`);

  } catch (error) {
    logger.error('DB 연결 테스트 실패:', error.message);

    let helpMessage = '';
    if (error.message.includes('NJS-138')) {
      helpMessage = '\n\n🔧 해결 방법:\n' +
        '1. Oracle Instant Client 다운로드 및 설치\n' +
        '2. 환경변수 설정: ORACLE_CLIENT_PATH=/path/to/instantclient\n' +
        '3. 재시도';
    }

    return mcpError(`❌ DB 연결 실패: ${error.message}${helpMessage}`);

  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        logger.error('연결 종료 실패:', err.message);
      }
    }
  }
}