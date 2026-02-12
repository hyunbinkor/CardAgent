// ============================================================
// tools/schema/save-profitability.js — 수익성 분석 결과 저장
//
// 원본: card-file-schema-manager/index.js (handleSaveProfitability)
// ============================================================

import path from 'path';
import { mcpText, mcpError, safeParse, writeJson, cleanCardName } from '../../shared/utils.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('schema');

/**
 * 수익성 분석 결과를 JSON 파일로 저장
 *
 * @param {Object} args - { analysisData, cardName, date }
 * @param {Object} ctx - { basePath }
 * @returns {Promise<Object>} MCP 응답
 */
export async function saveProfitabilityAnalysis(args, ctx) {
  try {
    const { analysisData, cardName, date } = args;
    const { basePath } = ctx;

    // 1. JSON 파싱
    const parsed = safeParse(analysisData, '분석 데이터 JSON 파싱 오류');
    if (!parsed.ok) return parsed.response;

    // 2. 파일명 생성
    const profitDir = process.env.PROFITABILITY_DATA_DIR || path.join(basePath, 'profitability');
    const cleanName = cleanCardName(cardName);
    const dateStr = date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `${cleanName}_analysis_${dateStr}.json`;
    const filePath = path.join(profitDir, fileName);

    // 3. 저장
    await writeJson(filePath, parsed.data);

    logger.info(`save_profitability_analysis 완료: ${fileName}`);
    return mcpText(
      `✅ 수익성 분석 결과가 저장되었습니다!\n` +
      `파일: ${fileName}\n` +
      `경로: profitability/${fileName}`
    );

  } catch (error) {
    logger.error('save_profitability_analysis 오류:', error);
    return mcpError(`수익성 분석 저장 중 오류: ${error.message}`);
  }
}
