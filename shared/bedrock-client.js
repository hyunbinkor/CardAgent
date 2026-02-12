// ============================================================
// shared/bedrock-client.js — AWS Bedrock 통합 클라이언트
//
// 사용 도메인: schema (정규화), document (기획서·설명서)
//
// @example
//   import { BedrockClient } from '../shared/bedrock-client.js';
//   import { BEDROCK_PRESETS } from '../shared/constants.js';
//   const client = new BedrockClient(BEDROCK_PRESETS.presentation, logger);
// ============================================================

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

export class BedrockClient {
  /**
   * @param {Object} config - BEDROCK_PRESETS 중 하나
   * @param {Object} [logger] - Logger 인스턴스 (없으면 console.error 사용)
   */
  constructor(config, logger) {
    this.modelId = config.modelId;
    this.inferenceConfig = {
      maxTokens: config.maxTokens,
      temperature: config.temperature
    };
    this.client = new BedrockRuntimeClient({
      region: config.region,
      requestTimeout: config.requestTimeout
    });
    this.logger = logger || {
      info: (...args) => console.error('[INFO]', ...args),
      error: (...args) => console.error('[ERROR]', ...args)
    };
  }

  /**
   * Bedrock Converse API 호출
   * @param {Array} messages - Bedrock 메시지 배열
   * @returns {Promise<string>} text 타입 응답만 결합하여 반환
   */
  async converse(messages) {
    this.logger.info('Bedrock 모델 호출 시작');

    const command = new ConverseCommand({
      modelId: this.modelId,
      inferenceConfig: this.inferenceConfig,
      messages
    });

    const result = await this.client.send(command);

    const textContent = (result.output?.message?.content || [])
      .filter(block => block.text)
      .map(block => block.text)
      .join('\n');

    this.logger.info(`응답 수신 완료 (${textContent.length}자)`);
    return textContent;
  }
}
