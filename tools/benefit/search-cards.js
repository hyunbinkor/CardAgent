// ============================================================
// tools/benefit/search-cards.js — 카드 상품 검색
//
// 원본: card_mcp.js L215-338 (searchCards)
// 개선: CB-1 — FIND_IN_SET → JSON_CONTAINS
// [v3.0.1] annual_fee → annual_fee_basic/annual_fee_brand 분리 컬럼 대응
// [v3.0.1] LIMIT 바인딩 → 직접 삽입 (prepared statement 호환)
// ============================================================

import { query } from '../../shared/db/mysql-pool.js';
import { mcpText, mcpError } from '../../shared/utils.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('benefit');

/**
 * 카드 상품 검색 — MySQL card_products 테이블
 *
 * @param {Object} args - 검색 파라미터
 * @returns {Promise<Object>} MCP 응답
 */
export async function searchCards(args) {
  try {
    const conditions = [];
    const params = [];

    // 상품명 (부분 일치)
    if (args.product_name) {
      conditions.push('product_name LIKE ?');
      params.push(`%${args.product_name}%`);
    }

    // 상품코드 (정확 일치)
    if (args.product_code) {
      conditions.push('product_code = ?');
      params.push(args.product_code);
    }

    // 발급사 (정확 일치)
    if (args.issuer) {
      conditions.push('issuer = ?');
      params.push(args.issuer);
    }

    // 등급 (정확 일치)
    if (args.grade) {
      conditions.push('grade = ?');
      params.push(args.grade);
    }

    // 브랜드 (정확 일치)
    if (args.brand) {
      conditions.push('brand = ?');
      params.push(args.brand);
    }

    // 제휴 브랜드 (JSON 배열 검색 — CB-1 개선)
    if (args.partnership_brand) {
      conditions.push('JSON_CONTAINS(partnership_brands, JSON_QUOTE(?))');
      params.push(args.partnership_brand);
    }

    // [v3.0.1] 연회비 범위 — 직접 컬럼 참조 (annual_fee_basic, annual_fee_brand)
    const feeType = args.annual_fee_type || 'total';
    let feeColumn;
    switch (feeType) {
      case 'basic':
        feeColumn = 'annual_fee_basic';
        break;
      case 'brand':
        feeColumn = 'annual_fee_brand';
        break;
      case 'total':
      default:
        feeColumn = '(COALESCE(annual_fee_basic, 0) + COALESCE(annual_fee_brand, 0))';
        break;
    }

    if (args.min_annual_fee !== undefined && args.min_annual_fee !== null) {
      conditions.push(`${feeColumn} >= ?`);
      params.push(args.min_annual_fee);
    }
    if (args.max_annual_fee !== undefined && args.max_annual_fee !== null) {
      conditions.push(`${feeColumn} <= ?`);
      params.push(args.max_annual_fee);
    }

    // 쿼리 빌드
    const limit = Math.min(parseInt(args.limit) || 10, 200);
    // [v3.0.1] SELECT: annual_fee → annual_fee_basic, annual_fee_brand
    let sql = `
      SELECT product_name, product_code, card_type, grade, brand, issuer,
             annual_fee_basic, annual_fee_brand,
             reward_type, partnership_brands, card_service_mapping,
             original_json AS original_json_str
      FROM card_products
    `;

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    // [v3.0.1] LIMIT 직접 삽입 (prepared statement 타입 호환 문제 방지)
    sql += ` ORDER BY product_code LIMIT ${limit}`;

    logger.debug(`SQL: ${sql}`);
    logger.debug(`Params: ${JSON.stringify(params)}`);

    const rows = await query(sql, params);

    // original_json 파싱
    // [v3.0.1] mysql2는 JSON 컬럼을 자동 파싱하므로 타입 체크 필요
    const results = [];
    for (const row of rows) {
      if (row.original_json_str) {
        try {
          const parsed = typeof row.original_json_str === 'string'
            ? JSON.parse(row.original_json_str)
            : row.original_json_str;
          results.push(parsed);
        } catch (parseError) {
          logger.warn(`JSON 파싱 실패 (product_code: ${row.product_code}): ${parseError.message}`);
          results.push({
            product_name: row.product_name,
            product_code: row.product_code,
            error: 'JSON 파싱 실패'
          });
        }
      }
    }

    logger.info(`search_cards: ${results.length}건 반환 (조건 ${conditions.length}개)`);
    return mcpText(JSON.stringify(results, null, 2));

  } catch (error) {
    logger.error('search_cards 오류:', error);
    return mcpError(`카드 검색 중 오류가 발생했습니다: ${error.message}`);
  }
}