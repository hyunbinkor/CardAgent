// ============================================================
// tools/schema/schema-builder.js — Oracle DB 호환 카드 스키마 생성기
//
// 원본: card-file-schema-manager/lib/schema-builder.js
// 모든 enum/패턴을 shared/constants.js에서 가져와 동적 생성
// ============================================================

import {
  SERVICE_ID_PATTERN_STR,
  PRODUCT_CODE_PATTERN_STR,
  DATE_PATTERN_STR,
  MERCHANT_CODE_PATTERN_STR,
  ALLOWED_ISSUERS,
  CARD_TYPES,
  GRADES,
  BRANDS,
  REWARD_TYPES,
  TARGET_CUSTOMERS,
  SERVICE_CLASSIFICATIONS,
  RATE_UNITS,
  RATE_TYPES,
  SPEND_PERIODS,
  USAGE_AREAS,
  LIMITS
} from '../../shared/constants.js';

// ── 헬퍼: spend 객체 스키마 생성 ────────────────────────────

function spendObject(desc) {
  return {
    type: 'object',
    required: ['amount', 'period'],
    properties: {
      amount: { type: ['number', 'null'], minimum: 0 },
      period: { type: 'string', enum: SPEND_PERIODS, description: desc }
    }
  };
}

// ── 메인: 카드 스키마 생성 ──────────────────────────────────

/**
 * Oracle DB 호환 카드 JSON Schema를 동적으로 생성
 * constants.js의 enum을 직접 참조하므로 상수 변경 시 자동 반영
 *
 * @returns {Object} JSON Schema
 */
export function buildCardSchema() {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: 'Oracle DB 호환 카드 상품 데이터 스키마',
    description: 'card_products + card_services 통합 스키마. Oracle DB 제약조건 반영.',
    required: ['card_products', 'card_services'],
    properties: {
      card_products: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: [
            'product_name', 'product_code', 'card_type', 'grade', 'brand',
            'issuer', 'issue_date', 'target_customer', 'application_restriction',
            'annual_fee', 'reward_type', 'partnership_brands', 'card_service_mapping'
          ],
          properties: {
            product_name: { type: 'string', maxLength: LIMITS.PRODUCT_NAME_MAX },
            product_code: { type: 'string', pattern: PRODUCT_CODE_PATTERN_STR },
            card_type: { type: 'string', enum: CARD_TYPES },
            grade: { type: 'string', enum: GRADES },
            brand: { type: 'string', enum: BRANDS },
            issuer: { type: 'string', enum: ALLOWED_ISSUERS },
            issue_date: { type: 'string', pattern: DATE_PATTERN_STR },
            expire_date: { type: ['string', 'null'], pattern: DATE_PATTERN_STR },
            target_customer: { type: 'string', enum: TARGET_CUSTOMERS },
            application_restriction: { type: 'boolean' },
            annual_fee: {
              type: 'object',
              required: ['basic', 'brand'],
              properties: {
                basic: { type: 'number', minimum: 0 },
                brand: { type: 'number', minimum: 0 }
              }
            },
            reward_type: {
              type: 'array',
              items: { type: 'string', enum: REWARD_TYPES },
              minItems: 1
            },
            partnership_brands: {
              type: 'array',
              items: { type: 'string' }
            },
            card_service_mapping: {
              type: 'array',
              items: { type: 'string', pattern: SERVICE_ID_PATTERN_STR }
            }
          }
        }
      },
      card_services: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: [
            'service_id', 'service_category', 'service_name',
            'service_classificaion', 'description', 'rate',
            'service_limit', 'merchants', 'merchant_codes',
            'minimum_spend', 'maximum_spend', 'usage_area'
          ],
          properties: {
            service_id: { type: 'string', pattern: SERVICE_ID_PATTERN_STR },
            service_category: { type: 'string', maxLength: LIMITS.SERVICE_CATEGORY_MAX },
            service_name: { type: 'string' },
            service_classificaion: { type: 'string', enum: SERVICE_CLASSIFICATIONS },
            description: { type: 'string', maxLength: LIMITS.DESCRIPTION_MAX },
            rate: {
              type: 'object',
              required: ['unit', 'value', 'type'],
              properties: {
                unit: { type: 'string', enum: RATE_UNITS },
                value: { type: 'number', minimum: 0 },
                type: { type: 'string', enum: RATE_TYPES }
              }
            },
            service_limit: {
              type: 'object',
              properties: {
                monthly_limit_amount: { type: ['number', 'null'] },
                transaction_limit_amount: { type: ['number', 'null'] },
                transaction_limit_count: { type: ['number', 'null'] },
                daily_limit_amount: { type: ['number', 'null'] },
                daily_limit_count: { type: ['number', 'null'] },
                monthly_limit_count: { type: ['number', 'null'] },
                annual_limit_amount: { type: ['number', 'null'] },
                annual_limit_count: { type: ['number', 'null'] }
              }
            },
            merchants: {
              type: ['array', 'null'],
              items: { type: 'string' }
            },
            merchant_codes: {
              type: ['array', 'null'],
              items: { type: 'string', pattern: MERCHANT_CODE_PATTERN_STR }
            },
            excluded_merchants: {
              type: ['array', 'null'],
              items: { type: 'string' }
            },
            minimum_spend: spendObject('실적 기간 (최소)'),
            maximum_spend: spendObject('실적 기간 (최대)'),
            usage_area: { type: 'string', enum: USAGE_AREAS }
          }
        }
      }
    }
  };
}

// ── Oracle 요구사항 텍스트 ──────────────────────────────────

/**
 * Oracle DB INSERT 전 요구사항 가이드 반환
 * @returns {string}
 */
export function getOracleRequirementsText() {
  return `# Oracle DB 삽입 요구사항

## 1. 발급사
지원 발급사: ${ALLOWED_ISSUERS.join(', ')}
※ 각 발급사에 대한 MBCM_NO가 자동 매핑됩니다.

## 2. 서비스 ID 규칙
- 형식: 알파벳 대문자 3자리 + 숫자 5자리 (예: SHN00001)
- 접두사: 신한카드=SHN, 삼성카드=SSC, NH농협카드=NHN
- 전체 서비스에서 고유해야 합니다 (중복 불가)

## 3. 필드 길이 제한
- product_name: 최대 ${LIMITS.PRODUCT_NAME_MAX}자
- service_name: 최대 ${LIMITS.SERVICE_NAME_MAX_BYTES}바이트 (한글 약 33자)
- service_category: 최대 ${LIMITS.SERVICE_CATEGORY_MAX}자
- description: 최대 ${LIMITS.DESCRIPTION_MAX}자
- condition_name: 최대 ${LIMITS.CONDITION_NAME_MAX_BYTES}바이트

## 4. enum 값
- card_type: ${CARD_TYPES.join(', ')}
- grade: ${GRADES.join(', ')}
- brand: ${BRANDS.join(', ')}
- service_classificaion: ${SERVICE_CLASSIFICATIONS.join(', ')}
- rate.unit: ${RATE_UNITS.join(', ')}
- rate.type: ${RATE_TYPES.join(', ')}
- usage_area: ${USAGE_AREAS.join(', ')}
- spend.period: ${SPEND_PERIODS.join(', ')}

## 5. merchant_codes
- 4자리 숫자 문자열 (예: "5411")
- MCC(Merchant Category Code) 표준 준수

## 6. card_service_mapping
- card_services의 service_id와 정확히 일치해야 합니다
- 누락되거나 존재하지 않는 service_id가 포함되면 오류 발생`;
}
