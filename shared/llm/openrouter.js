// ============================================================
// shared/llm/openrouter.js — OpenRouter 백엔드 구현체
//
// 공식 openai SDK를 baseURL=https://openrouter.ai/api/v1 로 설정해 사용.
//
// 호출 시점에 OPENROUTER_API_KEY 검사 — 누락 시 명확한 에러 발생.
// ============================================================

import OpenAI from 'openai';

export class OpenRouterClient {
  /**
   * @param {Object} preset - LLM_PRESETS 항목 ({ modelId, maxTokens, temperature, requestTimeout })
   * @param {Object} [logger]
   */
  constructor(preset, logger) {
    this.modelId = preset.modelId;
    this.maxTokens = preset.maxTokens;
    this.temperature = preset.temperature;
    this.logger = logger || {
      info: (...args) => console.error('[INFO]', ...args),
      error: (...args) => console.error('[ERROR]', ...args),
    };

    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error('OPENROUTER_API_KEY 환경변수가 설정되지 않았습니다');
    }

    this.client = new OpenAI({
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      timeout: preset.requestTimeout,
    });
  }

  /**
   * OpenAI Chat Completions 표준 포맷 호출.
   *
   * @param {Array<{role: string, content: string | Array<{type: 'text', text: string}>}>} messages
   * @returns {Promise<string>} 응답 텍스트
   */
  async complete(messages) {
    this.logger.info(`OpenRouter 호출: ${this.modelId}`);

    const response = await this.client.chat.completions.create({
      model: this.modelId,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    });

    const text = response.choices[0]?.message?.content || '';
    this.logger.info(`응답 수신 (${text.length}자)`);
    return text;
  }
}
