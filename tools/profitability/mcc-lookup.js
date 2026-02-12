// ============================================================
// tools/profitability/mcc-lookup.js — MCC 코드 조회
//
// 원본: mcp_profitability_analysis/useClaude.js
// 개선:
//   - 하드코딩 API 키/엔드포인트 → process.env 참조
//   - console.error → createLogger('profitability')
//   - 에러 처리 강화 (타임아웃, 네트워크 오류 등)
// ============================================================

import axios from 'axios';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('profitability');

// ── 설정 ────────────────────────────────────────────────────

function getConfig() {
  return {
    endpoint: process.env.INDUSTRY_BOT_ENDPOINT,
    apiKey: process.env.INDUSTRY_BOT_API_KEY,
    timeoutSeconds: parseInt(process.env.INDUSTRY_BOT_TIMEOUT) || 60,
    pollInterval: 3000 // ms
  };
}

// ── 응답 파싱 ───────────────────────────────────────────────

/**
 * 외부 API 응답에서 MCC 코드 정보 추출
 *
 * @param {string} content - API 응답 텍스트
 * @returns {Object} { 가맹점명: { industry_code, certainty } }
 */
function trimIndustryCode(content) {
  const pattern = /"([^"]+)":\s*\{\s*"industry_code":\s*"([^"]+)",\s*"certainty":\s*([0-9.]+)\s*\}/g;
  let matches;
  const result = {};

  while ((matches = pattern.exec(content)) !== null) {
    const [, name, code, certainty] = matches;
    result[name] = {
      industry_code: parseInt(code) || code,
      certainty: parseFloat(certainty)
    };
  }
  return result;
}

// ── 폴링 ────────────────────────────────────────────────────

/**
 * 대화 ID + 메시지 ID로 응답 폴링
 *
 * @param {string} conversationId
 * @param {string} messageId
 * @param {Object} config
 * @returns {Promise<string|null>} 응답 콘텐츠 또는 null
 */
async function getResponseFromId(conversationId, messageId, config) {
  try {
    const url = `${config.endpoint}/conversation/${conversationId}/${messageId}`;
    const headers = { 'x-api-key': config.apiKey };

    const res = await axios.get(url, { headers });
    if (res.status === 200) {
      return res.data.message.content;
    }
    return null;
  } catch (error) {
    logger.error(`폴링 중 예외: ${error.message}`);
    return null;
  }
}

/**
 * API 요청 페이로드 생성
 *
 * @param {string} prompt - 가맹점 목록 텍스트
 * @param {string|null} conversationId - 기존 대화 ID
 * @returns {Object}
 */
function getApiFormat(prompt, conversationId) {
  const payload = {
    text: prompt,
    mode: 'chat'
  };
  if (conversationId) {
    payload.conversationId = conversationId;
  }
  return payload;
}

// ── API 호출 ────────────────────────────────────────────────

/**
 * 외부 업종 분류 API 호출 + 폴링
 *
 * @param {string[]} merchantList - 가맹점명 배열
 * @param {Object} idTracker - { conversationId, messageId } 추적 객체
 * @param {Object} config
 * @returns {Promise<Object>} MCC 코드 매핑 객체
 */
async function callIndustryApi(merchantList, idTracker, config) {
  const prompt = merchantList.join('\n');
  const payload = getApiFormat(prompt, idTracker.conversationId);
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey
  };

  try {
    // Step 1: POST 요청 → conversationId, messageId 수신
    const response = await axios.post(
      `${config.endpoint}/conversation`,
      payload,
      { headers, timeout: config.timeoutSeconds * 1000 }
    );

    const resJson = response.data;
    idTracker.conversationId = resJson.conversationId || idTracker.conversationId;
    idTracker.messageId = resJson.messageId || idTracker.messageId;

    // Step 2: 폴링으로 응답 대기
    logger.info(
      `MCC 응답 대기 중... (conversationId=${idTracker.conversationId}, ` +
      `messageId=${idTracker.messageId})`
    );

    const startTime = Date.now();
    while (Date.now() - startTime < config.timeoutSeconds * 1000) {
      const content = await getResponseFromId(
        idTracker.conversationId,
        idTracker.messageId,
        config
      );
      if (content) {
        logger.info('MCC 응답 수신 완료');
        return trimIndustryCode(content);
      }
      // 대기 후 재시도
      await new Promise(resolve => setTimeout(resolve, config.pollInterval));
    }

    logger.warn('MCC API 타임아웃');
    return {};

  } catch (error) {
    logger.error(`MCC API 호출 실패: ${error.message}`);
    return {};
  }
}

// ── 공개 API ────────────────────────────────────────────────

/**
 * 가맹점 목록에 대한 MCC 코드를 외부 API로 조회
 *
 * 가맹점 수가 30개를 초과하면 배치로 분할하여 호출
 *
 * @param {string[]} merchantList - 조회할 가맹점명 배열
 * @returns {Promise<Object>} { 가맹점명: { industry_code, certainty } }
 */
export async function getMccCodesFromApi(merchantList) {
  const config = getConfig();

  if (!config.endpoint || !config.apiKey) {
    logger.warn('INDUSTRY_BOT_ENDPOINT 또는 INDUSTRY_BOT_API_KEY가 미설정, MCC 조회 건너뜀');
    return {};
  }

  if (!merchantList || merchantList.length === 0) {
    return {};
  }

  const BATCH_SIZE = 30;
  const allResults = {};
  const idTracker = { conversationId: null, messageId: null };

  // 배치 분할 처리
  for (let i = 0; i < merchantList.length; i += BATCH_SIZE) {
    const batch = merchantList.slice(i, i + BATCH_SIZE);
    logger.info(`MCC 코드 조회 배치 ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length}건`);

    const batchResult = await callIndustryApi(batch, idTracker, config);
    Object.assign(allResults, batchResult);
  }

  logger.info(`MCC 코드 조회 완료: ${Object.keys(allResults).length}건`);
  return allResults;
}