// ============================================================
// shared/llm/client.js — LLM 클라이언트 팩토리
//
// 프로바이더 추상화 계층. 현재는 OpenRouter 단일 백엔드.
// 향후 다른 백엔드(예: Anthropic 직접, OpenAI 직접) 추가 시 이 파일에서 분기.
//
// 호출처는 항상 createLLMClient()를 통해 클라이언트를 얻고
// .complete(messages) 메서드만 사용한다.
// ============================================================

import { OpenRouterClient } from './openrouter.js';

/**
 * LLM 클라이언트 팩토리.
 *
 * @param {Object} preset - LLM_PRESETS 항목 ({ modelId, maxTokens, temperature, requestTimeout })
 * @param {Object} [logger]
 * @returns {OpenRouterClient}
 */
export function createLLMClient(preset, logger) {
  return new OpenRouterClient(preset, logger);
}
