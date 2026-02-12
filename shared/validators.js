// ============================================================
// shared/validators.js — 전체 MCP 서버 검증 로직 통합
//
// 원본:
//   card-file-schema-manager/lib/validators.js
//   oracle-card-processor/oracle-pre-validator.js
//   json_to_cpdb.js (inline preValidateForOracle)
// ============================================================

import {
  SERVICE_ID_PATTERN,
  MERCHANT_CODE_PATTERN,
  ALLOWED_ISSUERS,
  LIMITS
} from './constants.js';
import { getByteLength } from './utils.js';

// ── 서비스 ID ───────────────────────────────────────────────

export function isValidServiceId(id) {
  return SERVICE_ID_PATTERN.test(id);
}

/**
 * 서비스 ID 중복 검출 (위치 쌍 반환)
 * @param {string[]} ids
 * @returns {{ id: string, firstIndex: number, dupIndex: number }[]}
 */
export function findDuplicateIds(ids) {
  const seen = new Map();
  const duplicates = [];
  ids.forEach((id, index) => {
    if (seen.has(id)) {
      duplicates.push({ id, firstIndex: seen.get(id) + 1, dupIndex: index + 1 });
    } else {
      seen.set(id, index);
    }
  });
  return duplicates;
}

/**
 * 서비스 ID 중복 집계 (ID → 횟수)
 * @param {string[]} ids
 * @returns {{ id: string, count: number }[]}
 */
export function countDuplicateIds(ids) {
  const counts = {};
  ids.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  return Object.entries(counts)
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id, count }));
}

// ── Oracle DB 호환성 검증 ───────────────────────────────────

/**
 * JSON 데이터의 Oracle DB 호환성 검증
 * card-file-schema-manager의 save_card_data에서 사용
 * @param {Object} data - 카드 JSON 데이터
 * @returns {string[]} 에러 메시지 배열 (빈 배열 = 통과)
 */
export function validateOracleCompatibility(data) {
  const errors = [];

  if (data.card_services && Array.isArray(data.card_services)) {
    // service_id 형식
    data.card_services.forEach((service, i) => {
      if (!isValidServiceId(service.service_id)) {
        errors.push(
          `서비스 ${i + 1}의 service_id '${service.service_id}'가 형식에 맞지 않습니다 (알파벳 3자리 + 숫자 5자리 필요, 예: ABC12345)`
        );
      }
    });

    // service_id 중복
    countDuplicateIds(data.card_services.map(s => s.service_id)).forEach(({ id, count }) => {
      errors.push(`service_id '${id}'가 ${count}회 중복됩니다 — 각 서비스는 고유한 ID가 필요합니다`);
    });

    // service_name 바이트 길이
    data.card_services.forEach((service, i) => {
      const bytes = getByteLength(service.service_name);
      if (bytes > LIMITS.SERVICE_NAME_MAX_BYTES) {
        errors.push(`서비스 ${i + 1}의 service_name이 ${LIMITS.SERVICE_NAME_MAX_BYTES}바이트를 초과합니다 (현재: ${bytes}바이트)`);
      }
    });

    // 가맹점 코드 형식
    data.card_services.forEach((service, i) => {
      if (service.merchant_codes && Array.isArray(service.merchant_codes)) {
        service.merchant_codes.forEach((code, ci) => {
          if (!MERCHANT_CODE_PATTERN.test(code)) {
            errors.push(`서비스 ${i + 1}의 merchant_codes[${ci}] '${code}'가 4자리 숫자 형식이 아닙니다`);
          }
        });
      }
    });
  }

  // 발급사
  if (data.card_products && Array.isArray(data.card_products)) {
    data.card_products.forEach((product, i) => {
      if (!ALLOWED_ISSUERS.includes(product.issuer)) {
        errors.push(
          `카드 상품 ${i + 1}의 발급사 '${product.issuer}'가 지원되지 않습니다 (지원 발급사: ${ALLOWED_ISSUERS.join(', ')})`
        );
      }
    });
  }

  // 매핑 일치성
  if (data.card_products && data.card_services) {
    const serviceIds = data.card_services.map(s => s.service_id);
    data.card_products.forEach((product, i) => {
      if (product.card_service_mapping) {
        const unmatched = product.card_service_mapping.filter(id => !serviceIds.includes(id));
        if (unmatched.length > 0) {
          errors.push(
            `카드 상품 ${i + 1}의 card_service_mapping에 존재하지 않는 서비스 ID가 있습니다: ${unmatched.join(', ')}`
          );
        }
      }
    });
  }

  return errors;
}

// ── 통합 검증 (스키마 + Oracle) ──────────────────────────────

/**
 * JSON Schema + Oracle DB 호환성 동시 검증
 * @param {Object} data - 카드 JSON 데이터
 * @param {Function} ajvValidateFn - AJV 스키마 검증 함수
 * @returns {{ valid: boolean, allErrors: string[] }}
 */
export function validateCardDataComprehensive(data, ajvValidateFn) {
  const allErrors = [];
  let schemaValid = true;

  const valid = ajvValidateFn(data);
  if (!valid) {
    schemaValid = false;
    allErrors.push('📋 스키마 오류:');
    allErrors.push(
      ...ajvValidateFn.errors.map(err => `  • ${err.instancePath || 'root'}: ${err.message}`)
    );
  }

  const oracleErrors = validateOracleCompatibility(data);
  if (oracleErrors.length > 0) {
    allErrors.push('\n🔧 Oracle DB 호환성 오류:');
    allErrors.push(...oracleErrors.map(err => `  • ${err}`));
  }

  return {
    valid: schemaValid && oracleErrors.length === 0,
    allErrors
  };
}

// ── Oracle INSERT 전 검증 ───────────────────────────────────

/**
 * Oracle DB INSERT 직전 종합 검증
 * oracle-card-processor의 process_card_file에서 사용
 *
 * @param {Object} data - 카드 JSON 데이터
 * @returns {{ valid: boolean, errors: string[], message: string }}
 */
export function preValidateForOracle(data) {
  const errors = [];

  // 기본 구조
  if (!data || typeof data !== 'object') {
    return fail(['유효한 JSON 객체가 아닙니다']);
  }
  if (!Array.isArray(data.card_products) || data.card_products.length === 0) {
    errors.push('card_products가 비어 있거나 배열이 아닙니다');
  }
  if (!Array.isArray(data.card_services) || data.card_services.length === 0) {
    errors.push('card_services가 비어 있거나 배열이 아닙니다');
  }
  if (errors.length > 0) return fail(errors);

  const product = data.card_products[0];
  const services = data.card_services;

  // 발급사
  if (!ALLOWED_ISSUERS.includes(product.issuer)) {
    errors.push(`발급사 '${product.issuer}'가 지원되지 않습니다 (지원: ${ALLOWED_ISSUERS.join(', ')})`);
  }

  // product_code
  if (!product.product_code) {
    errors.push('product_code가 비어 있습니다');
  }

  // service_id 형식 + 중복
  const serviceIds = [];
  services.forEach((svc, i) => {
    serviceIds.push(svc.service_id);
    if (!SERVICE_ID_PATTERN.test(svc.service_id)) {
      errors.push(`서비스[${i}] ID '${svc.service_id}' 형식 오류 (필요: 알파벳 3자리 + 숫자 5자리)`);
    }
  });

  const idCounts = {};
  serviceIds.forEach(id => { idCounts[id] = (idCounts[id] || 0) + 1; });
  Object.entries(idCounts)
    .filter(([, cnt]) => cnt > 1)
    .forEach(([id, cnt]) => {
      errors.push(`service_id '${id}'가 ${cnt}회 중복됩니다`);
    });

  // service_name 바이트
  services.forEach((svc, i) => {
    const bytes = getByteLength(svc.service_name);
    if (bytes > LIMITS.SERVICE_NAME_MAX_BYTES) {
      errors.push(`서비스[${i}] '${svc.service_name}' 이름이 ${LIMITS.SERVICE_NAME_MAX_BYTES}바이트 초과 (현재: ${bytes}바이트)`);
    }
  });

  // merchant_codes
  services.forEach((svc, i) => {
    if (Array.isArray(svc.merchant_codes)) {
      svc.merchant_codes.forEach((code, ci) => {
        if (!MERCHANT_CODE_PATTERN.test(code)) {
          errors.push(`서비스[${i}] merchant_codes[${ci}] '${code}' — 4자리 숫자 필요`);
        }
      });
    }
  });

  // 매핑 일치성
  if (product.card_service_mapping) {
    const unmatched = product.card_service_mapping.filter(id => !serviceIds.includes(id));
    if (unmatched.length > 0) {
      errors.push(`card_service_mapping에 card_services에 없는 ID: ${unmatched.join(', ')}`);
    }
  }

  return errors.length === 0
    ? { valid: true, errors: [], message: '✅ 검증 통과' }
    : fail(errors);
}

function fail(errors) {
  return {
    valid: false,
    errors,
    message: `❌ 삽입 전 검증 실패 (${errors.length}건):\n${errors.map(e => `  • ${e}`).join('\n')}`
  };
}

// ── Oracle 에러 메시지 변환 ─────────────────────────────────

/**
 * Oracle 에러를 사용자 친화적 메시지로 변환
 * @param {Error} error
 * @param {Object} data - 원본 카드 데이터
 * @returns {string}
 */
export function formatOracleError(error, data = {}) {
  const msg = error.message || String(error);
  const productCode = data.card_products?.[0]?.product_code || '(알 수 없음)';
  const productName = data.card_products?.[0]?.product_name || '(알 수 없음)';

  if (msg.includes('PK_CISU_CDGD_M')) {
    return `❌ 이미 등록된 카드 상품입니다.\n   상품코드: ${productCode}\n   상품명: ${productName}\n   → 기존 데이터를 삭제한 후 다시 시도하거나, 다른 product_code를 사용하십시오.`;
  }
  if (msg.includes('PK_CGDS_CDSV_M')) {
    const serviceIds = data.card_services?.map(s => s.service_id).join(', ') || '(알 수 없음)';
    return `❌ 이미 등록된 서비스 ID가 존재합니다.\n   상품코드: ${productCode}\n   서비스 ID 목록: ${serviceIds}\n   → 서비스 ID를 변경하거나, 기존 데이터를 삭제한 후 다시 시도하십시오.`;
  }
  if (msg.includes('ORA-02291')) {
    return `❌ 참조 무결성 오류.\n   상품코드: ${productCode}\n   → 카드 상품이 먼저 등록되어 있는지 확인하십시오.`;
  }
  if (msg.includes('ORA-12899')) {
    const colMatch = msg.match(/column "([^"]+)"/i);
    const col = colMatch ? colMatch[1] : '(알 수 없음)';
    return `❌ 데이터 길이 초과.\n   컬럼: ${col}\n   상품코드: ${productCode}\n   → 해당 필드의 값 길이를 줄여주십시오.`;
  }
  if (msg.includes('ORA-01400')) {
    return `❌ 필수 필드가 비어 있습니다.\n   상품코드: ${productCode}\n   → 모든 필수 필드가 채워져 있는지 확인하십시오.`;
  }
  return `❌ DB 삽입 오류: ${msg}\n   상품코드: ${productCode}`;
}
