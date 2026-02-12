// ============================================================
// tools/profitability/index.js — 수익성 분석 도메인 (1개 도구)
//
// 원본: mcp_profitability_analysis/index.js
// 도구: card_profitability_analysis
// ============================================================

import { createLogger } from '../../shared/logger.js';
import { analyzeProfitability } from './analyzer.js';

const logger = createLogger('profitability');

// ── 도구 스키마 정의 ────────────────────────────────────────

export const tools = [
  {
    name: 'card_profitability_analysis',
    description: '카드 상품의 수익성을 분석합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        card_file_name: {
          type: 'string',
          description: '분석할 카드 상품 정보가 담긴 JSON 파일명'
        }
      },
      required: ['card_file_name']
    }
  }
];

// ── 핸들러 매핑 ─────────────────────────────────────────────

const HANDLERS = {
  card_profitability_analysis: analyzeProfitability
};

// ── 라우터 ──────────────────────────────────────────────────

export async function handle(name, args) {
  logger.info(`${name} 호출`, args);
  return HANDLERS[name](args);
}