// ============================================================
// tools/oracle/index.js — Oracle DB 삽입 도메인 (2개 도구)
//
// 원본: oracle-card-processor MCP 서버
// 도구: process_card_file, test_db_connection
// ============================================================

import { createLogger } from '../../shared/logger.js';
import { processCardFile } from './processor.js';
import { testDbConnection } from './connection-test.js';

const logger = createLogger('oracle');

// ── 도구 스키마 정의 ────────────────────────────────────────

export const tools = [
  {
    name: 'process_card_file',
    description:
      '파일 경로의 JSON 데이터를 Oracle DB에 삽입합니다. ' +
      '파일은 하나의 카드 상품과 그에 연결된 서비스를 포함해야 합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'JSON 파일 경로'
        }
      },
      required: ['filePath']
    }
  },
  {
    name: 'test_db_connection',
    description: 'Oracle DB 연결을 테스트합니다.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// ── 핸들러 매핑 ─────────────────────────────────────────────

const HANDLERS = {
  process_card_file: processCardFile,
  test_db_connection: testDbConnection
};

// ── 라우터 ──────────────────────────────────────────────────

export async function handle(name, args) {
  logger.info(`${name} 호출`, args);
  return HANDLERS[name](args);
}