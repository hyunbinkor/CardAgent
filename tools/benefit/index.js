// ============================================================
// tools/benefit/index.js — 카드 혜택 검색 도메인 (5개 도구)
//
// 도구: search_cards, search_services,
//       get_partnership_brands, get_service_categories, get_merchants
// ============================================================

import { createLogger } from '../../shared/logger.js';
import { searchCards } from './search-cards.js';
import { searchServices } from './search-services.js';
import { getPartnershipBrands, getServiceCategories, getMerchants } from './keyword-pools.js';

const logger = createLogger('benefit');

// ── 도구 스키마 정의 ────────────────────────────────────────

export const tools = [
  {
    name: 'search_cards',
    description: '카드 상품을 검색하여 original_json을 반환합니다',
    inputSchema: {
      type: 'object',
      properties: {
        product_name: { type: 'string', description: '상품명 (부분 일치)' },
        product_code: { type: 'string', description: '상품코드 (정확 일치)' },
        issuer: { type: 'string', description: '발급사명' },
        grade: { type: 'string', description: '카드 등급' },
        brand: { type: 'string', description: '카드 브랜드' },
        partnership_brand: { type: 'string', description: '제휴 브랜드명' },
        min_annual_fee: { type: 'number', description: '최소 연회비' },
        max_annual_fee: { type: 'number', description: '최대 연회비' },
        annual_fee_type: {
          type: 'string',
          enum: ['basic', 'brand', 'total'],
          default: 'total',
          description: '연회비 타입 (basic: 기본, brand: 브랜드, total: 합계)'
        },
        limit: { type: 'number', default: 10, description: '검색 결과 제한 수' }
      }
    }
  },
  {
    name: 'search_services',
    description: '카드 서비스를 검색하여 original_json을 반환합니다',
    inputSchema: {
      type: 'object',
      properties: {
        service_name: { type: 'string', description: '서비스명' },
        service_category: { type: 'string', description: '서비스 카테고리' },
        usage_area: { type: 'string', description: '이용 영역' },
        rate_type: { type: 'string', description: '혜택 타입' },
        merchant: { type: 'string', description: '가맹점명' },
        min_rate_value: { type: 'number', description: '최소 혜택율' },
        max_rate_value: { type: 'number', description: '최대 혜택율' },
        limit: { type: 'number', default: 10, description: '검색 결과 제한 수' }
      }
    }
  },
  {
    name: 'get_partnership_brands',
    description: 'card_products의 partnership_brands 키워드 풀을 반환합니다',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_service_categories',
    description: 'card_services의 service_category 키워드 풀을 반환합니다',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_merchants',
    description: 'card_services의 merchants_virtual 키워드 풀을 반환합니다',
    inputSchema: { type: 'object', properties: {} }
  }
];

// ── 핸들러 매핑 ─────────────────────────────────────────────

const HANDLERS = {
  search_cards: searchCards,
  search_services: searchServices,
  get_partnership_brands: getPartnershipBrands,
  get_service_categories: getServiceCategories,
  get_merchants: getMerchants,
};

// ── 라우터 ──────────────────────────────────────────────────

export async function handle(name, args) {
  logger.info(`${name} 호출`, args);
  return HANDLERS[name](args);
}
