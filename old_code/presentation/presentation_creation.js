#!/usr/bin/env node

console.error('=== 카드 기획서 서버 시작 ===');

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { promises as fs } from 'fs';
import path from 'path';
import 'dotenv/config';

console.error('=== 모든 import 완료 ===');

/**
 * AWS Bedrock 모델을 사용한 카드 기획서 생성 클래스
 */
class BedrockModel {
  constructor(modelId, inferenceConfig, toolList = null) {
    this.modelId = modelId;
    this.inferenceConfig = inferenceConfig;
    this.toolList = toolList;

    // Read Timeout 방지를 위한 타임아웃 값 설정
    this.client = new BedrockRuntimeClient({
      region: 'us-east-1',
      requestTimeout: 50000,
      socketTimeout: 50000
    });
  }

  /**
   * Bedrock 모델 호출
   * @param {Array} messages - 대화 메시지 배열
   * @returns {Promise<Object>} 모델 응답
   */
  async callModel(messages) {
    console.error('=== Bedrock 모델 호출 시작 ===');

    const params = {
      modelId: this.modelId,
      inferenceConfig: this.inferenceConfig,
      messages: messages
    };

    if (this.toolList) {
      params.toolConfig = { tools: this.toolList };
    }

    const command = new ConverseCommand(params);
    const result = await this.client.send(command);

    console.error('=== Bedrock 모델 호출 완료 ===');
    return result;
  }
}

/**
 * 카드 기획서 생성을 위한 프롬프트 생성
 * @returns {string} 기획서 생성 프롬프트
 */
function generatePrompt() {
  return `JSON 형식으로 주어진 카드 상품서에 대한 기획서를 만들어줘. 직장 상사한테 발표하는 자료니까 설득력이 있는 기획서여야해.
JSON 형태로 주어진 카드에 대한 분석 자료도 사용해서 기획서를 만들어줘.

다음 내용을 포함해서 작성해줘:
1. 이 카드가 어떻게 회사측에 이익을 가져다 줄 지 확실하게 명시
2. 어떠한 방법들로 고객들을 유치할 것인지에 대한 전략
3. 이 사업으로 얻을 수 있는 사측의 이익 및 향후 발전 동향
4. 시장 분석 및 경쟁사 대비 우위점
5. 예상 수익성 및 ROI 분석

일반적인 홍보 자료가 아니라 사업을 기획하는 자료이기 때문에 조금 더 격식있게 작성해줘.
기획서는 카드사 입장에서 작성해줘.`;
}

/**
 * 파일 존재 여부 및 접근 권한 확인
 * @param {string} filePath - 확인할 파일 경로
 * @throws {McpError} 파일이 존재하지 않거나 접근할 수 없는 경우
 */
async function validateFilePath(filePath) {
  console.error(`=== 파일 경로 검증: ${filePath} ===`);

  try {
    await fs.access(filePath, fs.constants.R_OK);
    const stats = await fs.stat(filePath);

    if (!stats.isFile()) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `경로가 파일이 아닙니다: ${filePath}`
      );
    }

    console.error(`=== 파일 검증 완료: ${filePath} ===`);
  } catch (error) {
    console.error(`=== 파일 검증 실패: ${filePath} ===`, error.message);

    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InvalidParams,
      `파일에 접근할 수 없습니다: ${filePath} (${error.message})`
    );
  }
}

/**
 * JSON 파일 내용 유효성 검사
 * @param {Buffer} fileContent - 파일 내용
 * @param {string} fileName - 파일명 (로깅용)
 * @returns {Object} 파싱된 JSON 객체
 */
function validateJsonContent(fileContent, fileName) {
  console.error(`=== JSON 유효성 검사: ${fileName} ===`);

  try {
    const jsonData = JSON.parse(fileContent.toString('utf-8'));

    if (!jsonData || typeof jsonData !== 'object') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `${fileName}이 유효한 JSON 객체가 아닙니다`
      );
    }

    console.error(`=== JSON 검증 완료: ${fileName} ===`);
    return jsonData;
  } catch (error) {
    console.error(`=== JSON 검증 실패: ${fileName} ===`, error.message);

    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(
      ErrorCode.InvalidParams,
      `${fileName} JSON 파싱 오류: ${error.message}`
    );
  }
}

/**
 * 카드 기획서 생성 함수
 * @param {string} jsonDataFilePath - 카드 데이터 JSON 파일 경로 (assets 폴더 내부의 상대 경로)
 * @param {string} jsonAnalysisFilePath - 카드 분석 데이터 JSON 파일 경로 (assets 폴더 내부의 상대 경로)
 * @returns {Promise<string>} 생성된 기획서 내용
 */
async function generateCardPresentation(jsonDataFilePath, jsonAnalysisFilePath) {
  console.error('=== 기획서 생성 함수 시작 ===');

  // 입력 파라미터 유효성 검사
  if (!jsonDataFilePath || typeof jsonDataFilePath !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'jsonDataFilePath는 필수 문자열 파라미터입니다'
    );
  }

  if (!jsonAnalysisFilePath || typeof jsonAnalysisFilePath !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'jsonAnalysisFilePath는 필수 문자열 파라미터입니다'
    );
  }

  // `assets` 폴더를 기준으로 파일 경로를 구성
  const assetsPath = process.env.ASSETS_PATH || 'C:/CardAgent/asset'; // 현재 작업 디렉토리에 있는 'assets' 폴더를 기준으로 함
  const absoluteDataPath = path.join(assetsPath, jsonDataFilePath);
  const absoluteAnalysisPath = path.join(assetsPath, jsonAnalysisFilePath);

  console.error(`카드 데이터 파일 경로: ${absoluteDataPath}`);
  console.error(`분석 데이터 파일 경로: ${absoluteAnalysisPath}`);

  try {
    // 파일 존재 여부 확인
    await validateFilePath(absoluteDataPath);
    await validateFilePath(absoluteAnalysisPath);

    // 파일 읽기
    console.error('=== 파일 읽기 시작 ===');
    const [jsonDocumentBytes, jsonAnalysisDocumentBytes] = await Promise.all([
      fs.readFile(absoluteDataPath),
      fs.readFile(absoluteAnalysisPath)
    ]);
    console.error('=== 파일 읽기 완료 ===');

    // JSON 유효성 검사
    const cardData = validateJsonContent(jsonDocumentBytes, '카드 데이터');
    const analysisData = validateJsonContent(jsonAnalysisDocumentBytes, '분석 데이터');

    console.error('파일 읽기 및 유효성 검사 완료');
    console.error(`카드 데이터 크기: ${Object.keys(cardData).length}개 필드`);
    console.error(`분석 데이터 크기: ${Object.keys(analysisData).length}개 필드`);

    // Bedrock 모델 설정
    const modelId = "arn:aws:bedrock:us-east-1:484907498824:inference-profile/us.anthropic.claude-opus-4-6-v1:0";
    const inferenceConfig = {
      maxTokens: 100000,
      temperature: 0.1
    };

    const model = new BedrockModel(modelId, inferenceConfig);

    // 메시지 구성
    const messages = [{
      role: "user",
      content: [
        {
          document: {
            name: "Card details in json",
            format: "txt",
            source: { bytes: jsonDocumentBytes }
          }
        },
        {
          document: {
            name: "Card analysis in json",
            format: "txt",
            source: { bytes: jsonAnalysisDocumentBytes }
          }
        },
        { text: generatePrompt() }
      ]
    }];

    console.error('기획서 생성 중...');

    // 모델 호출
    const result = await model.callModel(messages);
    const generatedContent = result.output.message.content[0].text;

    console.error('기획서 생성 완료');
    console.error(`생성된 내용 길이: ${generatedContent.length}자`);

    return generatedContent;

  } catch (error) {
    console.error('=== 기획서 생성 중 오류 ===', error);

    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `기획서 생성 실패: ${error.message}`
    );
  }
}

/**
 * MCP 서버 생성 및 설정
 */
class CardPresentationServer {
  constructor() {
    console.error('=== CardPresentationServer 생성자 시작 ===');

    this.server = new Server(
      {
        name: 'card-presentation-generator',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    console.error('=== Server 객체 생성 완료 ===');
    this.setupToolHandlers();
    this.setupErrorHandling();
    console.error('=== CardPresentationServer 생성 완료 ===');
  }

  setupToolHandlers() {
    console.error('=== 핸들러 설정 시작 ===');

    // Initialize 핸들러 추가
    this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
      console.error('=== Initialize 요청 받음 ===', request.params);
      return {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "card-presentation-generator",
          version: "1.0.0"
        }
      };
    });

    // 도구 목록 핸들러
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error('=== ListTools 요청 받음 ===');
      return {
        tools: [
          {
            name: 'generate_card_presentation',
            description: '카드 상품 데이터와 분석 데이터를 기반으로 사업 기획서를 생성합니다. 카드사 입장에서 상사에게 발표할 수 있는 전문적이고 설득력 있는 기획서를 만들어줍니다.',
            inputSchema: {
              type: 'object',
              properties: {
                jsonDataFilePath: {
                  type: 'string',
                  description: '카드 상품 정보가 담긴 JSON 파일의 assets 폴더 내 상대 경로입니다. 카드명, 연회비, 혜택, 서비스 등의 상세 정보가 포함되어야 합니다.',
                  examples: [
                    'card-data/card_product.json',
                    'card-data/shinhan_card.json',
                    'card-data/premium_card.json'
                  ]
                },
                jsonAnalysisFilePath: {
                  type: 'string',
                  description: '카드 상품에 대한 분석 데이터가 담긴 JSON 파일의 assets 폴더 내 상대 경로입니다. 시장 분석, 수익성 분석, 타겟 고객 분석 등이 포함되어야 합니다.',
                  examples: [
                    'profitability/card_analysis.json',
                    'profitability/market_research.json',
                    'profitability/profitability_study.json'
                  ]
                }
              },
              required: ['jsonDataFilePath', 'jsonAnalysisFilePath'],
              additionalProperties: false
            }
          }
        ],
      };
    });

    // 도구 호출 핸들러
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      console.error('=== CallTool 요청 받음 ===', request.params.name);

      const { name, arguments: args } = request.params;

      if (name === 'generate_card_presentation') {
        try {
          const result = await generateCardPresentation(
            args.jsonDataFilePath,
            args.jsonAnalysisFilePath
          );

          return {
            content: [
              {
                type: 'text',
                text: result,
              },
            ],
          };
        } catch (error) {
          console.error('=== 도구 실행 오류 ===', error);

          if (error instanceof McpError) {
            throw error;
          }

          throw new McpError(
            ErrorCode.InternalError,
            `도구 실행 중 예상치 못한 오류가 발생했습니다: ${error.message}`
          );
        }
      } else {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `알 수 없는 도구입니다: ${name}`
        );
      }
    });

    console.error('=== 모든 핸들러 설정 완료 ===');
  }

  setupErrorHandling() {
    console.error('=== Error handlers 설정 중 ===');

    // 전역 에러 핸들러
    process.on('unhandledRejection', (reason, promise) => {
      console.error('=== 처리되지 않은 Promise 거부 ===', reason);
      process.exit(1);
    });

    process.on('uncaughtException', (error) => {
      console.error('=== 처리되지 않은 예외 ===', error);
      process.exit(1);
    });
  }

  async run() {
    console.error('=== Transport 연결 시작 ===');
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('=== 카드 기획서 생성 MCP 서버가 시작되었습니다 ===');
  }
}

/**
 * 서버 시작
 */
async function main() {
  try {
    console.error('=== 서버 메인 시작 ===');
    const server = new CardPresentationServer();
    await server.run();
  } catch (error) {
    console.error('=== 서버 시작 실패 ===', error);
    process.exit(1);
  }
}

console.error('=== main 실행 시작 ===');
main().catch((error) => {
  console.error('=== 메인 실행 실패 ===', error);
  process.exit(1);
});