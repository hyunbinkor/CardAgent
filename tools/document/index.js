// ============================================================
// tools/document/index.js — 문서 생성 도메인 (2개 도구)
//
// 원본: card-presentation-generator, card-product-sheet-generator
// 도구: generate_card_presentation, generate_new_pdf
// ============================================================

import { createLogger } from '../../shared/logger.js';
import { generatePresentation } from './presentation.js';
import { generateInfoSheetPdf } from './info-sheet.js';

const logger = createLogger('document');

// ── 도구 스키마 정의 ────────────────────────────────────────

export const tools = [
  {
    name: 'generate_card_presentation',
    description:
      '카드 상품 데이터와 분석 데이터를 기반으로 사업 기획서를 생성합니다. ' +
      '카드사 입장에서 상사에게 발표할 수 있는 전문적이고 설득력 있는 기획서를 만들어줍니다.',
    inputSchema: {
      type: 'object',
      properties: {
        jsonDataFilePath: {
          type: 'string',
          description:
            '카드 상품 정보가 담긴 JSON 파일의 assets 폴더 내 상대 경로입니다. ' +
            '카드명, 연회비, 혜택, 서비스 등의 상세 정보가 포함되어야 합니다.',
          examples: [
            'card-data/card_product.json',
            'card-data/shinhan_card.json',
            'card-data/premium_card.json'
          ]
        },
        jsonAnalysisFilePath: {
          type: 'string',
          description:
            '카드 상품에 대한 분석 데이터가 담긴 JSON 파일의 assets 폴더 내 상대 경로입니다. ' +
            '시장 분석, 수익성 분석, 타겟 고객 분석 등이 포함되어야 합니다.',
          examples: [
            'profitability/card_analysis.json',
            'profitability/market_research.json',
            'profitability/profitability_study.json'
          ]
        }
      },
      required: ['jsonDataFilePath', 'jsonAnalysisFilePath'],
      additionalProperties: false
    }
  },
  {
    name: 'generate_new_pdf',
    description:
      'JSON 형식의 카드 상품 데이터를 사용하여 새로운 카드 상품 설명서 PDF를 생성합니다. ' +
      'PDF 템플릿의 디자인을 유지하면서 JSON 데이터로 텍스트 내용을 채웁니다.',
    inputSchema: {
      type: 'object',
      properties: {
        dataJsonFilePath: {
          type: 'string',
          description:
            '카드 상품 정보가 담긴 JSON 파일의 assets 폴더 내 상대 경로입니다. ' +
            '카드명, 연회비, 혜택, 서비스 등의 상세 정보가 포함되어야 합니다.',
          examples: [
            'card-data/card_product.json',
            'card-data/shinhan_card.json'
          ]
        }
      },
      required: ['dataJsonFilePath'],
      additionalProperties: false
    }
  }
];

// ── 핸들러 매핑 ─────────────────────────────────────────────

const HANDLERS = {
  generate_card_presentation: generatePresentation,
  generate_new_pdf: generateInfoSheetPdf
};

// ── 라우터 ──────────────────────────────────────────────────

export async function handle(name, args) {
  logger.info(`${name} 호출`, args);
  return HANDLERS[name](args);
}
