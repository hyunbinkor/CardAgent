// ============================================================
// tools/benefit/keyword-pools.js — 키워드 풀 조회
//
// 원본: card_mcp.js L459-600
//   getPartnershipBrands, getServiceCategories, getMerchants
// ============================================================

import { query } from '../../shared/db/mysql-pool.js';
import { mcpText, mcpError } from '../../shared/utils.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('benefit');

// ── 공통 헬퍼: JSON 배열/문자열에서 개별 값 추출 ──────────

function extractValues(rawValue) {
  if (!rawValue) return [];

  // JSON 배열인 경우
  if (Array.isArray(rawValue)) {
    return rawValue.map(v => String(v).trim()).filter(Boolean);
  }

  // 문자열인 경우 — JSON 파싱 시도
  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) {
        return parsed.map(v => String(v).trim()).filter(Boolean);
      }
    } catch {
      // JSON 파싱 실패 → 쉼표 구분 문자열로 처리
      return rawValue.split(',').map(v => v.trim()).filter(Boolean);
    }
  }

  return [];
}

// ── get_partnership_brands ──────────────────────────────────

/**
 * 카드 상품의 제휴 브랜드 키워드 풀 반환
 * @returns {Promise<Object>} MCP 응답
 */
export async function getPartnershipBrands() {
  try {
    const rows = await query('SELECT DISTINCT partnership_brands FROM card_products');
    const allBrands = new Set();

    for (const row of rows) {
      extractValues(row.partnership_brands).forEach(b => allBrands.add(b));
    }

    const sorted = [...allBrands].sort();
    logger.info(`get_partnership_brands: ${sorted.length}개 키워드`);
    return mcpText(JSON.stringify(sorted, null, 2));

  } catch (error) {
    logger.error('get_partnership_brands 오류:', error);
    return mcpError(`제휴 브랜드 조회 중 오류: ${error.message}`);
  }
}

// ── get_service_categories ──────────────────────────────────

/**
 * 카드 서비스의 카테고리 키워드 풀 반환
 * @returns {Promise<Object>} MCP 응답
 */
export async function getServiceCategories() {
  try {
    const rows = await query('SELECT DISTINCT service_category FROM card_services ORDER BY service_category');
    const categories = rows
      .map(r => r.service_category)
      .filter(Boolean)
      .sort();

    logger.info(`get_service_categories: ${categories.length}개 키워드`);
    return mcpText(JSON.stringify(categories, null, 2));

  } catch (error) {
    logger.error('get_service_categories 오류:', error);
    return mcpError(`서비스 카테고리 조회 중 오류: ${error.message}`);
  }
}

// ── get_merchants ───────────────────────────────────────────

/**
 * 카드 서비스의 가맹점 키워드 풀 반환
 * @returns {Promise<Object>} MCP 응답
 */
export async function getMerchants() {
  try {
    const rows = await query('SELECT DISTINCT merchants_virtual FROM card_services');
    const allMerchants = new Set();

    for (const row of rows) {
      extractValues(row.merchants_virtual).forEach(m => allMerchants.add(m));
    }

    const sorted = [...allMerchants].sort();
    logger.info(`get_merchants: ${sorted.length}개 키워드`);
    return mcpText(JSON.stringify(sorted, null, 2));

  } catch (error) {
    logger.error('get_merchants 오류:', error);
    return mcpError(`가맹점 조회 중 오류: ${error.message}`);
  }
}
