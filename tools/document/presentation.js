// ============================================================
// tools/document/presentation.js — 카드 사업 기획서 생성
//
// 원본: presentation_creation.js → generateCardPresentation()
// 개선:
//   - BedrockModel 클래스 → 공유 BedrockClient 사용
//   - 하드코딩 경로 → process.env.ASSETS_PATH
//   - console.error → createLogger('document')
//   - McpError throw → mcpError() 래퍼 반환
// ============================================================

import { promises as fs } from 'fs';
import path from 'path';
import { BedrockClient } from '../../shared/bedrock-client.js';
import { BEDROCK_PRESETS } from '../../shared/constants.js';
import { mcpText, mcpError } from '../../shared/utils.js';
import { createLogger } from '../../shared/logger.js';
import { getPresentationPrompt } from './presentation-prompt.js';

const logger = createLogger('document');

// ── 유틸리티 ────────────────────────────────────────────────

/**
 * 파일 존재 여부 검증
 * @param {string} filePath - 검증할 파일 경로
 * @throws {Error} 파일이 없을 경우
 */
async function validateFilePath(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`);
  }
}

/**
 * JSON 파일 읽기 + 유효성 검증
 * @param {Buffer} buffer - 파일 버퍼
 * @param {string} label - 로깅용 라벨
 * @returns {Object} 파싱된 JSON 객체
 */
function validateJsonContent(buffer, label) {
  try {
    const data = JSON.parse(buffer.toString('utf-8'));
    if (!data || typeof data !== 'object') {
      throw new Error('JSON 데이터가 객체가 아닙니다');
    }
    return data;
  } catch (error) {
    throw new Error(`${label} JSON 파싱 실패: ${error.message}`);
  }
}

// ── 메인 핸들러 ─────────────────────────────────────────────

/**
 * 카드 사업 기획서 생성
 *
 * 플로우: JSON 파일 2개 읽기 → Bedrock 호출 → 마크다운 기획서 반환
 *
 * @param {Object} args
 * @param {string} args.jsonDataFilePath     - 카드 데이터 JSON (assets 상대 경로)
 * @param {string} args.jsonAnalysisFilePath - 분석 데이터 JSON (assets 상대 경로)
 * @returns {Promise<Object>} MCP 응답 ({ content: [{ type: 'text', text }] })
 */
export async function generatePresentation(args) {
  try {
    const { jsonDataFilePath, jsonAnalysisFilePath } = args;

    // 1. 파라미터 검증
    if (!jsonDataFilePath || typeof jsonDataFilePath !== 'string') {
      return mcpError('jsonDataFilePath는 필수 문자열 파라미터입니다');
    }
    if (!jsonAnalysisFilePath || typeof jsonAnalysisFilePath !== 'string') {
      return mcpError('jsonAnalysisFilePath는 필수 문자열 파라미터입니다');
    }

    // 2. 절대 경로 구성
    const assetsPath = process.env.ASSETS_PATH;
    if (!assetsPath) {
      return mcpError('환경변수 ASSETS_PATH가 설정되지 않았습니다');
    }

    const absoluteDataPath = path.join(assetsPath, jsonDataFilePath);
    const absoluteAnalysisPath = path.join(assetsPath, jsonAnalysisFilePath);

    logger.info(`카드 데이터: ${absoluteDataPath}`);
    logger.info(`분석 데이터: ${absoluteAnalysisPath}`);

    // 3. 파일 읽기 + 유효성 검증 (병렬)
    await Promise.all([
      validateFilePath(absoluteDataPath),
      validateFilePath(absoluteAnalysisPath)
    ]);

    const [jsonDocumentBytes, jsonAnalysisDocumentBytes] = await Promise.all([
      fs.readFile(absoluteDataPath),
      fs.readFile(absoluteAnalysisPath)
    ]);

    const cardData = validateJsonContent(jsonDocumentBytes, '카드 데이터');
    const analysisData = validateJsonContent(jsonAnalysisDocumentBytes, '분석 데이터');

    logger.info(`카드 데이터 필드 수: ${Object.keys(cardData).length}`);
    logger.info(`분석 데이터 필드 수: ${Object.keys(analysisData).length}`);

    // 4. Bedrock 메시지 구성
    const messages = [
      {
        role: 'user',
        content: [
          {
            document: {
              name: 'Card details in json',
              format: 'txt',
              source: { bytes: jsonDocumentBytes }
            }
          },
          {
            document: {
              name: 'Card analysis in json',
              format: 'txt',
              source: { bytes: jsonAnalysisDocumentBytes }
            }
          },
          { text: getPresentationPrompt() }
        ]
      }
    ];

    // 5. Bedrock 호출
    logger.info('기획서 생성 중...');
    const client = new BedrockClient(BEDROCK_PRESETS.presentation, logger);
    const generatedContent = await client.converse(messages);

    logger.info(`기획서 생성 완료 (${generatedContent.length}자)`);

    return mcpText(generatedContent);

  } catch (error) {
    logger.error('기획서 생성 실패:', error.message);
    return mcpError(`기획서 생성 실패: ${error.message}`);
  }
}
