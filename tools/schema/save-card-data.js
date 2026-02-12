// ============================================================
// tools/schema/save-card-data.js — 카드 데이터 저장
//
// 원본: card-file-schema-manager/index.js (handleSaveCardData)
// 흐름: 파싱 → 스키마+Oracle 검증 → 정규화 → 파일 저장
// ============================================================

import fs from 'fs/promises';
import path from 'path';
import { mcpText, mcpError, safeParse, writeJson, cleanCardName } from '../../shared/utils.js';
import { validateCardDataComprehensive } from '../../shared/validators.js';
import { createLogger } from '../../shared/logger.js';
import { normalizeCardData, formatNormalizationLog } from './normalization.js';

const logger = createLogger('schema');

/**
 * 카드 데이터 저장 (정규화 포함)
 *
 * @param {Object} args - { cardData, cardName, version }
 * @param {Object} ctx - { ajvValidate, alias, poolPath, basePath }
 * @returns {Promise<Object>} MCP 응답
 */
export async function saveCardData(args, ctx) {
  try {
    const { cardData, cardName, version = 'v1' } = args;
    const { ajvValidate, alias, poolPath, basePath } = ctx;

    // 1. JSON 파싱
    const parsed = safeParse(cardData);
    if (!parsed.ok) return parsed.response;
    const data = parsed.data;

    // 2. 통합 검증 (스키마 + Oracle 호환성)
    const result = validateCardDataComprehensive(data, ajvValidate);
    if (!result.valid) {
      return mcpText(
        `❌ 검증 실패 - 다음 사항을 모두 수정하고 다시 시도해주세요:\n\n` +
        `${result.allErrors.join('\n')}\n\n` +
        `📋 참고: get_oracle_requirements 도구로 전체 요구사항을 확인할 수 있습니다.`
      );
    }

    // 3. 정규화 (3단계 파이프라인)
    const { data: normalized, log } = await normalizeCardData(data, alias, poolPath);

    // 4. 파일명 생성 및 저장
    const cardDir = process.env.CARD_DATA_DIR || path.join(basePath, 'card-data');
    const cleanName = cleanCardName(cardName);
    const fileName = `${cleanName}_${version}.json`;
    const filePath = path.join(cardDir, fileName);

    await writeJson(filePath, normalized);

    // 5. 결과 메시지
    let msg = `✅ Oracle DB 호환 카드 데이터가 성공적으로 저장되었습니다!\n`;
    msg += `파일: ${fileName}\n`;
    msg += `경로: card-data/${fileName}`;
    msg += formatNormalizationLog(log);
    msg += '\n\n이제 Oracle MCP 서버를 통해 DB에 삽입할 수 있습니다.';

    logger.info(`save_card_data 완료: ${fileName}`);
    return mcpText(msg);

  } catch (error) {
    logger.error('save_card_data 오류:', error);
    return mcpError(`카드 데이터 저장 중 오류: ${error.message}`);
  }
}
