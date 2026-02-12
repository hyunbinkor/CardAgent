// ============================================================
// shared/constants.js — 전체 MCP 서버 SSOT (Single Source of Truth)
//
// 5개 도메인의 모든 상수를 이 파일 하나로 관리합니다.
// import { X } from '../shared/constants.js'
// ============================================================

// ── 정규식 패턴 ─────────────────────────────────────────────
export const SERVICE_ID_PATTERN = /^[A-Z]{3}\d{5}$/;
export const SERVICE_ID_PATTERN_STR = '^[A-Z]{3}\\d{5}$';
export const PRODUCT_CODE_PATTERN_STR = '^[A-Z0-9]{3,10}$';
export const DATE_PATTERN_STR = '^\\d{4}-\\d{2}-\\d{2}$';
export const MERCHANT_CODE_PATTERN = /^\d{4}$/;
export const MERCHANT_CODE_PATTERN_STR = '^\\d{4}$';

// ── 발급사 ──────────────────────────────────────────────────
// SHN/SSC/NHN = 서비스 ID 접두사용
// 201/202/203 = Oracle MBCM_NO용
export const ISSUER_MAP = {
  '신한카드': { prefix: 'SHN', mbcmNo: '201' },
  '삼성카드': { prefix: 'SSC', mbcmNo: '202' },
  'NH농협카드': { prefix: 'NHN', mbcmNo: '203' }
};

export const ALLOWED_ISSUERS = Object.keys(ISSUER_MAP);

// Oracle MBCM_NO 코드만 필요할 때
export const ISSUER_MBCM_MAP = Object.fromEntries(
  Object.entries(ISSUER_MAP).map(([k, v]) => [k, v.mbcmNo])
);

// 서비스 ID 접두사만 필요할 때
export const ISSUER_PREFIX_MAP = Object.fromEntries(
  Object.entries(ISSUER_MAP).map(([k, v]) => [k, v.prefix])
);

// ── card_products enum ──────────────────────────────────────
export const CARD_TYPES = ['credit_card', 'debit_card', 'prepaid_card'];
export const GRADES = ['general', 'gold', 'special', 'platinum', 'signature', 'premium', 'black'];
export const BRANDS = ['local', 'mastercard', 'visa', 'amex', 'jcb', 'unionpay'];
export const REWARD_TYPES = ['cashback', 'mileage', 'discount'];
export const TARGET_CUSTOMERS = ['individual', 'corporate'];

// ── card_services enum ──────────────────────────────────────
export const SERVICE_CLASSIFICATIONS = ['discount', 'mileage', 'cashback', 'annual_fee_exclusion'];
export const RATE_UNITS = ['percentage', 'per_1000_krw', 'per_transaction', 'fixed_amount'];
export const RATE_TYPES = ['discount_rate', 'cashback', 'points', 'mileage'];
export const SPEND_PERIODS = ['last_month', 'this_month', 'last_year', 'none'];
export const USAGE_AREAS = ['domestic', 'overseas', 'both'];

// ── 길이 제한 ───────────────────────────────────────────────
export const LIMITS = {
  PRODUCT_NAME_MAX: 100,
  SERVICE_NAME_MAX_BYTES: 100,
  SERVICE_CATEGORY_MAX: 50,
  DESCRIPTION_MAX: 500,
  CONDITION_NAME_MAX_BYTES: 92
};

// ── Oracle CODE_MAPPINGS ────────────────────────────────────
export const ORACLE_CODE_MAPS = {
  CARD_GRADE_MAP: {
    general: '10', special: '20', gold: '20',
    platinum: '30', signature: '40', premium: '40', black: '40'
  },
  CARD_BRAND_MAP: {
    local: '1', mastercard: '2', visa: '3', jcb: '4', unionpay: '6'
  },
  SERVICE_CLASSIFICATION_MAP: {
    discount: '10', mileage: '20', cashback: '60', annual_fee_exclusion: '50'
  },
  PERFORMANCE_AMOUNT_MAP: {
    last_month: '1', this_month: '2', none: '0'
  },
  PERFORMANCE_COUNT_MAP: {
    last_year: '3', last_month: '1', this_month: '2', none: '0'
  }
};

// ── 파일 시스템 (card-file-schema-manager) ───────────────────
export const DIR_MAP = {
  'pdf': 'card-pdfs',
  'card-data': 'card-data',
  'profitability': 'profitability',
  'schemas': 'schemas'
};
export const ALL_DIR_TYPES = ['pdf', 'card-data', 'profitability', 'schemas'];
export const FILE_FILTER_TYPES = [...ALL_DIR_TYPES, 'all'];

// ── Bedrock 공통 베이스 ─────────────────────────────────────
// 환경변수 우선, 없으면 하드코딩 기본값 사용
export const BEDROCK_BASE = {
  region: process.env.BEDROCK_REGION || 'us-east-1',
  modelId: process.env.BEDROCK_MODEL_ID || 'arn:aws:bedrock:us-east-1:484907498824:inference-profile/us.anthropic.claude-3-7-sonnet-20250219-v1:0'
};

// 서버별 Bedrock 설정 프리셋
export const BEDROCK_PRESETS = {
  // schema-manager: 정규화 (짧은 출력, 정확성 최우선)
  normalization: { ...BEDROCK_BASE, maxTokens: 2048, temperature: 0, requestTimeout: 30000 },
  // document-generator: 기획서 (긴 출력, 약간의 창의성)
  presentation: { ...BEDROCK_BASE, maxTokens: 100000, temperature: 0.1, requestTimeout: 120000 },
  // document-generator: 설명서 (HTML 생성)
  infoSheet: { ...BEDROCK_BASE, maxTokens: 100000, temperature: 0.2, requestTimeout: 600000 }
};

// ── 수익성 분석 기준값 ──────────────────────────────────────
export const PROFITABILITY_THRESHOLDS = {
  COST_RATE_WARN: 1.0,            // 그룹별 당사비용율 경고 기준
  AVG_COST_RATE_MIN: 0.3,         // 평균 당사비용율 권장 하한
  AVG_COST_RATE_MAX: 0.6,         // 평균 당사비용율 권장 상한
  GROUP_COST_RATE_MAX: 0.9,       // 그룹 최대 당사비용율 참고 기준
  MONTHLY_LIMIT_MAX: 70000        // 월간 한도 합계 참고 기준
};
