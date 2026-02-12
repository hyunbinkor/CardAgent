// ============================================================
// tools/batch/index.js — 혜택 시뮬레이션 배치 도메인 (2개 도구)
//
// 원본: card-batch-server (독립 MCP 서버)
// 도구: submit_privilege_calculation_batch_job,
//       get_privilege_calculation_batch_result
//
// v3.0.3 신규:
//   - 독립 서버 → 통합 서버 6번째 도메인으로 편입
//   - 오타 수정: previlege → privilege
//   - 클래스 → 독립 함수 모듈 패턴
//   - console.error → createLogger('batch')
//   - throw McpError → mcpError() 래퍼 반환
// ============================================================

import { createLogger } from '../../shared/logger.js';
import { submitBatchJob } from './submit-job.js';
import { getBatchResult } from './get-result.js';

const logger = createLogger('batch');

// ── 도구 스키마 정의 ────────────────────────────────────────

export const tools = [
  {
    name: 'submit_privilege_calculation_batch_job',
    description:
      '카드 혜택 시뮬레이션 배치 작업을 등록합니다. ' +
      'card_gds_cd를 기반으로 배치를 실행하며, ' +
      '내부 테스트 결제내역으로 혜택 적용 결과를 확인합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        card_gds_cd: {
          type: 'string',
          description: '카드 상품 코드 (예: KCS1)'
        }
      },
      required: ['card_gds_cd'],
      additionalProperties: false
    }
  },
  {
    name: 'get_privilege_calculation_batch_result',
    description:
      '배치 ID로 카드 혜택 시뮬레이션 배치 작업 결과를 조회합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        batch_id: {
          type: 'string',
          description: '배치 작업 ID'
        }
      },
      required: ['batch_id'],
      additionalProperties: false
    }
  }
];

// ── 핸들러 매핑 ─────────────────────────────────────────────

const HANDLERS = {
  submit_privilege_calculation_batch_job: submitBatchJob,
  get_privilege_calculation_batch_result: getBatchResult
};

// ── 라우터 ──────────────────────────────────────────────────

export async function handle(name, args) {
  logger.info(`${name} 호출`, args);
  return HANDLERS[name](args);
}
