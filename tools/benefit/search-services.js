// ============================================================
// tools/benefit/search-services.js — 카드 서비스 검색
//
// 원본: card_mcp.js L345-453 (searchServices)
// 개선: CB-2 — FIND_IN_SET → JSON_CONTAINS (merchants_virtual)
// ============================================================

import { query } from '../../shared/db/mysql-pool.js';
import { mcpText, mcpError } from '../../shared/utils.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('benefit');

/**
 * 카드 서비스 검색 — MySQL card_services 테이블
 *
 * @param {Object} args - 검색 파라미터
 * @returns {Promise<Object>} MCP 응답
 */
export async function searchServices(args) {
  try {
    const conditions = [];
    const params = [];

    // 서비스명 (부분 일치)
    if (args.service_name) {
      conditions.push('service_name LIKE ?');
      params.push(`%${args.service_name}%`);
    }

    // 서비스 카테고리 (부분 일치)
    if (args.service_category) {
      conditions.push('service_category LIKE ?');
      params.push(`%${args.service_category}%`);
    }

    // 이용 영역
    if (args.usage_area) {
      conditions.push('usage_area = ?');
      params.push(args.usage_area);
    }

    // 혜택 타입
    if (args.rate_type) {
      conditions.push('rate_type = ?');
      params.push(args.rate_type);
    }

    // 가맹점 (JSON 배열 검색 — CB-2 개선)
    if (args.merchant) {
      conditions.push('JSON_CONTAINS(merchants_virtual, JSON_QUOTE(?))');
      params.push(args.merchant);
    }

    // 혜택율 범위
    if (args.min_rate_value !== undefined && args.min_rate_value !== null) {
      conditions.push('rate_value >= ?');
      params.push(args.min_rate_value);
    }
    if (args.max_rate_value !== undefined && args.max_rate_value !== null) {
      conditions.push('rate_value <= ?');
      params.push(args.max_rate_value);
    }

    // 쿼리 빌드
    const limit = Math.min(parseInt(args.limit) || 10, 200);
    let sql = `
      SELECT service_id, service_name, service_category, service_classification,
             rate_type, rate_value, rate_unit, usage_area,
             merchants_virtual,
             original_json AS original_json_str
      FROM card_services
    `;

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ` ORDER BY service_id LIMIT ?`;
    params.push(limit);

    logger.debug(`SQL: ${sql}`);
    logger.debug(`Params: ${JSON.stringify(params)}`);

    const rows = await query(sql, params);

    // original_json 파싱
    const results = [];
    for (const row of rows) {
      if (row.original_json_str) {
        try {
          const parsed = JSON.parse(row.original_json_str);
          results.push(parsed);
        } catch (parseError) {
          logger.warn(`JSON 파싱 실패 (service_id: ${row.service_id}): ${parseError.message}`);
          results.push({
            service_id: row.service_id,
            service_name: row.service_name,
            error: 'JSON 파싱 실패'
          });
        }
      }
    }

    logger.info(`search_services: ${results.length}건 반환 (조건 ${conditions.length}개)`);
    return mcpText(JSON.stringify(results, null, 2));

  } catch (error) {
    logger.error('search_services 오류:', error);
    return mcpError(`서비스 검색 중 오류가 발생했습니다: ${error.message}`);
  }
}
