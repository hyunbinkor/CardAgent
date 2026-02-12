// ============================================================
// tools/document/index.js — 문서 생성 도메인 (2개 도구)
//
// 원본: card-presentation-generator, card-product-sheet-generator
// 도구: generate_card_presentation, generate_new_pdf
//
// v3.0.2 수정:
//   - generate_card_presentation: 마크다운+PDF 이중 출력 설명 추가
//   - generate_new_pdf: PDF 경로 안내 방식 명시
// ============================================================

import { createLogger } from '../../shared/logger.js';
import { generatePresentation } from './presentation.js';
import { generateInfoSheetPdf } from './info-sheet.js';

const logger = createLogger('document');

// ── 도구 스키마 정의 ────────────────────────────────────────

export const tools = [
  {
    name: 'generate_card_presentation',
    // [v3.0.2] 마크다운 본문 + PDF 경로 반환 설명 추가
    description:
      '카드 상품 데이터와 분석 데이터를 기반으로 사업 기획서를 생성합니다. ' +
      '카드사 입장에서 상사에게 발표할 수 있는 전문적이고 설득력 있는 기획서입니다. ' +
      '결과로 마크다운 기획서 본문과 PDF 저장 경로가 함께 반환됩니다. ' +
      '마크다운 본문은 사용자에게 가공 없이 그대로 보여주고, PDF 경로는 별도로 안내합니다.',
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
    // [v3.0.2] PDF 경로 반환 방식 명시
    description:
      '카드 상품 데이터(card-data JSON)로 고객용 카드 상품 설명서 PDF를 생성합니다. ' +
      'HTML 템플릿에 데이터를 채운 후 PDF로 변환하여 서버에 직접 저장합니다. ' +
      '결과로 PDF 파일 저장 경로가 반환되며, 이 경로를 사용자에게 안내하면 됩니다. ' +
      'PDF 파일 자체는 반환되지 않으므로 별도의 후처리가 필요하지 않습니다.',
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