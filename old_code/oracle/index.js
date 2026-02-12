/**
 * MCP Server for Oracle Card Data Processing
 * 기존 Oracle DB 삽입 로직을 MCP 서버로 변환
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import oracledb from 'oracledb';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const INSTANT_CLIENT_PATH = process.env.INSTANT_CLIENT_PATH || "D:/instantclient_19_27";

// Oracle DB 연결 설정
const DB_CONFIG = {
  user: process.env.DB_USER || 'cdapp2016',
  password: process.env.DB_PASSWORD || 'cdapp2016',
  connectString: process.env.DB_CONNECT_STRING || 'localhost:1523/fcamdb23',
  poolMin: 1,
  poolMax: 4,
  poolIncrement: 1,
  poolAlias: 'cardAppPool',
  homogeneous: false
};

export class OracleCardMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'oracle-card-processor',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'process_card_json',
            description: 'JSON 카드 데이터를 Oracle DB에 삽입합니다. JSON 데이터는 하나의 카드 상품과 그에 연결된 서비스를 포함해야 합니다.',
            inputSchema: {
              type: 'object',
              properties: {
                jsonData: {
                  type: 'string',
                  description: '카드 상품 및 서비스 JSON 데이터 (단일 상품)',
                },
                fileName: {
                  type: 'string',
                  description: '파일명 (로깅용)',
                  default: 'mcp_data.json',
                },
              },
              required: ['jsonData'],
            },
          },
          {
            name: 'process_card_file',
            description: '파일 경로의 JSON 데이터를 Oracle DB에 삽입합니다. 파일은 하나의 카드 상품과 그에 연결된 서비스를 포함해야 합니다.',
            inputSchema: {
              type: 'object',
              properties: {
                filePath: {
                  type: 'string',
                  description: 'JSON 파일 경로',
                },
              },
              required: ['filePath'],
            },
          },
          {
            name: 'batch_process_directory',
            description: '디렉토리 내 모든 JSON 파일을 배치 처리합니다. 각 JSON 파일은 하나의 카드 상품과 그에 연결된 서비스를 포함해야 합니다.',
            inputSchema: {
              type: 'object',
              properties: {
                directoryPath: {
                  type: 'string',
                  description: '처리할 디렉토리 경로',
                },
              },
              required: ['directoryPath'],
            },
          },
          {
            name: 'test_db_connection',
            description: 'Oracle DB 연결을 테스트합니다.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'process_card_json':
            return await this.processCardJson(args.jsonData, args.fileName);

          case 'process_card_file':
            return await this.processCardFile(args.filePath);

          case 'batch_process_directory':
            return await this.batchProcessDirectory(args.directoryPath);

          case 'test_db_connection':
            return await this.testDbConnection();

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        // Log the detailed error for debugging purposes on the server side
        console.error(`[Tool Execution Error] Tool: ${name}, Error:`, error);
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error.message}`
        );
      }
    });
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Server Error]', error);
    };

    process.on('SIGINT', async () => {
      console.error('SIGINT received. Shutting down MCP server...');
      await this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('SIGTERM received. Shutting down MCP server...');
      await this.cleanup();
      process.exit(0);
    });

    // Catch unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Application specific logging, throwing an error, or other logic here
    });

    // Catch uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.cleanup().finally(() => {
        process.exit(1); // Exit with a failure code
      });
    });
  }

  // DB 설정 (환경변수에서 가져오기)
  getDbConfig() {
    return {
      user: process.env.DB_USER || 'cdapp2016',
      password: process.env.DB_PASSWORD || 'cdapp2016',
      connectString: process.env.DB_CONNECT_STRING || 'localhost:1523/fcamdb23',
      poolMin: 1,
      poolMax: 10,
      poolIncrement: 1,
      poolAlias: 'cardAppPool',
      homogeneous: false
    };
  }

  // 코드 매핑 (기존 코드에서 가져옴)
  getCodeMappings() {
    return {
      ISSUER_CODE_MAP: {
        "신한카드": "201", // 실제 DB 코드에 맞게 조정 필요 (이전 json_to_cpdb.js와 동일하게 변경)
        "삼성카드": "202"  // 실제 DB 코드에 맞게 조정 필요 (이전 json_to_cpdb.js와 동일하게 변경)
      },
      CARD_GRADE_MAP: {
        "general": "10",
        "special": "20",
        "gold": "20",
        "platinum": "30",
        "signature": "40",
        "premium": "40",
        "black": "40"
      },
      CARD_BRAND_MAP: {
        "local": "1",
        "mastercard": "2",
        "visa": "3",
        "jcb": "4",
        "unionpay": "6"
      },
      SERVICE_CLASSIFICATION_MAP: {
        "discount": "10",
        "mileage": "20",
        "cashback": "60",
        "annual_fee_exclusion": "50"
      },
      PERFORMANCE_AMOUNT_MAP: {
        "last_month": "1",
        "this_month": "2",
        "none": "0",
      },
      PERFORMANCE_COUNT_MAP: {
        "last_year": "3",
        "last_month": "1",
        "this_month": "2",
        "none": "0",
      }
    };
  }

  /**
   * Oracle DB 연결 풀 초기화
   */
  async initializeDB() {
    try {
        // Thick 모드 초기화 시도
        if (INSTANT_CLIENT_PATH) {
            console.error(`🔧 Oracle Instant Client 경로: ${INSTANT_CLIENT_PATH}`);
            // initOracleClient는 한 번만 호출되어야 하므로, 이미 초기화되었는지 확인하는 로직 추가
            try {
                oracledb.initOracleClient({ libDir: INSTANT_CLIENT_PATH });
                console.error('✅ Oracle Client가 초기화되었습니다.');
            } catch (err) {
                if (err.message.includes('DPI-1047: Oracle Client library is already initialized')) {
                    console.error('⚠️ Oracle Client 초기화 건너뜀 (이미 초기화됨).');
                } else {
                    throw err; // 다른 종류의 init 에러는 다시 throw
                }
            }
        } else {
            // INSTANT_CLIENT_PATH가 없는 경우 Thin 모드 시도 (또는 initOracleClient() 호출 시도)
            try {
                oracledb.initOracleClient();
                console.error('✅ Oracle Client가 초기화되었습니다 (기본 경로).');
            } catch (err) {
                if (err.message.includes('DPI-1047')) {
                    console.error('⚠️ Oracle Client 초기화 건너뜀 (이미 초기화되었거나 경로 필요).');
                } else {
                    throw err;
                }
            }
        }

        console.error('📋 현재 DB_CONFIG:', DB_CONFIG); // DB_CONFIG 내용 확인

        // 1단계: 풀 생성 전, 직접 DB 연결 시도 (네트워크 및 기본 인증 확인)
        console.error('🔄 풀 생성 전, 직접 DB 연결 테스트 시도 중...');
        let directConnection = null; // 직접 연결 테스트를 위한 connection 변수를 여기에 선언
        try {
            directConnection = await oracledb.getConnection({ // 이 directConnection 변수에 할당
                user: DB_CONFIG.user,
                password: DB_CONFIG.password,
                connectString: DB_CONFIG.connectString
            });
            console.error('✅ 직접 DB 연결 성공! (풀 아님)');
            // 연결 닫기 (풀 테스트를 위해. 직접 연결은 이 테스트 후 바로 닫음)
            await directConnection.close();
            console.error('✅ 직접 DB 연결 종료됨.');
        } catch (directConnectError) {
            console.error('❌ 직접 DB 연결 실패:', directConnectError.message);
            // 직접 연결이 실패하면 더 이상 진행할 수 없으므로 여기서 오류 발생
            throw new Error(`직접 DB 연결 실패: ${directConnectError.message}`);
        } finally {
            // 이 블록은 directConnection이 성공적으로 할당되었을 때만 처리하도록 합니다.
            // 위에서 directConnection.close()를 이미 호출했으므로 여기서는 추가 작업 불필요.
            // 다만, 혹시나 directConnection 할당 전에 에러가 나면 여기로 오지 않도록 try-catch로 감쌉니다.
        }

        // 2단계: 풀 생성 및 테스트 시작
        // 풀 생성 전, "cardAppPool" 존재 여부 확인
        try {
            let existingPoolBeforeCreate = oracledb.getPool(DB_CONFIG.poolAlias);

            console.error(`📋 풀 생성 전, "${DB_CONFIG.poolAlias}" 존재 여부: true`);

            // 기존 풀이 있다면 먼저 닫기 (이전 시도에서 추가했던 임시 디버깅 코드 유지)
            if (existingPoolBeforeCreate) {
                console.error(`⚠️ 기존 "${DB_CONFIG.poolAlias}" 풀을 찾았습니다. 강제로 종료 후 재생성합니다.`);
                await existingPoolBeforeCreate.close(0);
                console.error(`✅ 기존 "${DB_CONFIG.poolAlias}" 풀 종료 완료.`);
            }
        } catch {
            console.error(`📋 풀 생성 전, "${DB_CONFIG.poolAlias}" 존재 여부: false`);
        }

        // 풀 생성
        await oracledb.createPool(DB_CONFIG);
        console.error(`✅ Oracle DB 연결 풀 생성 호출 완료. 캐시 등록 확인 중...`);

        // 풀 생성 직후, "cardAppPool"이 캐시에 존재하는지 다시 확인
        let connection = await oracledb.getConnection(DB_CONFIG.poolAlias); // pool alias 명시
        console.error(`📋 풀 생성 직후, "${DB_CONFIG.poolAlias}" 캐시 존재 여부: ${!!connection}`);
        if (!connection) {
            throw new Error(`Critical Error: 풀 생성 직후 "${DB_CONFIG.poolAlias}" 풀을 캐시에서 찾을 수 없습니다. (NJS-047 이전 단계 오류)`);
        }

        // 연결 테스트
        try {
            console.error(`🔄 "${DB_CONFIG.poolAlias}" 풀에서 연결 가져오기 시도 중...`);
            const result = await connection.execute('SELECT SYSDATE FROM DUAL');
            console.error(`✅ DB 연결 테스트 성공: ${result.rows[0][0]}`);
            return true;
        } finally {
            if (connection) {
                console.error('🔄 DB 연결 반환 중...');
                await connection.close();
                console.error('✅ DB 연결 반환 완료.');
            }
        }

    } catch (error) {
        console.error('❌ DB 연결 실패:', error.message);
        if (error.message.includes('NJS-138')) {
            console.error(`
  🔧 해결 방법:
  1. Oracle Instant Client 다운로드 및 설치
  2. 환경변수 설정: ORACLE_CLIENT_PATH=/path/to/instantclient
  3. 재시도
            `);
        } else if (error.message.includes('NJS-047')) {
            console.error('⚠️ pool alias가 캐시에 없습니다. 풀 생성에 문제가 있었을 수 있습니다.');
        }

        return false;
    }
  }

  // DB 연결 테스트
  async testDbConnection() {
    let connection;
    try {
      // initializeDB가 먼저 호출되어 풀이 생성되어 있어야 함
      if (!oracledb.getPool(DB_CONFIG.poolAlias)) {
        const initialized = await this.initializeDB();
        if (!initialized) {
          throw new Error('DB 연결 초기화 실패');
        }
      }

      connection = await oracledb.getConnection(DB_CONFIG.poolAlias);
      const result = await connection.execute('SELECT SYSDATE FROM DUAL');

      return {
        content: [{
          type: 'text',
          text: `✅ DB 연결 성공: ${result.rows[0][0]}`
        }]
      };
    } catch (error) {
      console.error('❌ DB 연결 테스트 실패:', error.message);
      return {
        content: [{
          type: 'text',
          text: `❌ DB 연결 실패: ${error.message}`
        }]
      };
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('❌ DB 연결 테스트 후 연결 종료 실패:', err.message);
        }
      }
    }
  }

  // JSON 데이터 직접 처리 (단일 카드 상품)
  async processCardJson(jsonDataString, fileName = 'mcp_data.json') {
    let connection; // connection 변수 선언 위치 변경
    const { date, time } = this.getCurrentDateTime(); // 날짜 시간 미리 가져오기
    const CODE_MAPPINGS = this.getCodeMappings(); // 매핑 데이터 미리 가져오기
    const serviceIdPattern = /^[A-Z]{3}\d{5}$/; // CDSV_NO 유효성 검사를 위한 정규식

    try {
      const jsonData = JSON.parse(jsonDataString);

      // Validate the structure to ensure it has card_products and card_services
      if (!jsonData.card_products || !Array.isArray(jsonData.card_products) || jsonData.card_products.length === 0) {
        throw new Error('JSON 데이터에 유효한 card_products 배열이 없거나 비어 있습니다.');
      }
      if (!jsonData.card_services || !Array.isArray(jsonData.card_services)) {
        throw new Error('JSON 데이터에 card_services 배열이 없거나 유효하지 않습니다.');
      }

      // Process only the first card product and its associated services from the provided JSON data
      const singleProductToInsert = jsonData.card_products[0];
      const servicesForSingleProduct = jsonData.card_services.filter(service =>
          singleProductToInsert.card_service_mapping.includes(service.service_id)
      );

      if (!singleProductToInsert) {
        throw new Error('삽입할 단일 카드 상품 데이터가 JSON에 없습니다.');
      }

      const result = await this.insertSingleCardProductToOracle(singleProductToInsert, servicesForSingleProduct, fileName);

      return {
        content: [{
          type: 'text',
          text: result.success
            ? `✅ 성공: 1개 카드 상품 및 관련 서비스 (${result.insertCount}개 레코드) 삽입됨 (${fileName})`
            : `❌ 실패: ${result.error} (${fileName})`
        }]
      };
    } catch (error) {
      console.error(`❌ JSON 처리 실패 (${fileName}):`, error.message);
      return {
        content: [{
          type: 'text',
          text: `❌ JSON 처리 실패: ${error.message}`
        }]
      };
    }
  }

  // 파일 처리 (단일 카드 상품 JSON 파일)
  async processCardFile(filePath) {
    try {
      const fileContent = await fs.readFile(path.join('C:/Projects/Opering_Demo/asset', filePath), 'utf8');
      const fileName = path.basename(filePath);

      return await this.processCardJson(fileContent, fileName);
    } catch (error) {
      console.error(`❌ 파일 처리 실패 (${filePath}):`, error.message);
      return {
        content: [{
          type: 'text',
          text: `❌ 파일 처리 실패: ${error.message}`
        }]
      };
    }
  }

  // 배치 처리 (디렉토리 내 모든 JSON 파일 - 각 파일이 단일 카드 상품을 가정)
  async batchProcessDirectory(directoryPath) {
    try {
      const files = await fs.readdir(directoryPath);
      const jsonFiles = files.filter(file => path.extname(file).toLowerCase() === '.json');

      if (jsonFiles.length === 0) {
        return {
          content: [{
            type: 'text',
            text: '❌ JSON 파일이 없습니다.'
          }]
        };
      }

      const results = [];
      let successCount = 0;
      let failCount = 0;

      for (const file of jsonFiles) {
        if (file === 'processing_summary.json') continue; // 요약 파일은 건너뛰기

        const filePath = path.join(directoryPath, file);
        try {
          const fileContent = await fs.readFile(filePath, 'utf8');
          const jsonData = JSON.parse(fileContent);

          // 배치 처리 시에도 각 파일이 단일 상품 JSON 구조를 가진다고 가정
          if (!jsonData.card_products || !Array.isArray(jsonData.card_products) || jsonData.card_products.length === 0) {
            results.push(`❌ ${file}: 유효한 card_products 배열이 없거나 비어 있습니다.`);
            failCount++;
            continue;
          }
          if (!jsonData.card_services || !Array.isArray(jsonData.card_services)) {
            results.push(`❌ ${file}: card_services 배열이 없거나 유효하지 않습니다.`);
            failCount++;
            continue;
          }

          const singleProductToInsert = jsonData.card_products[0];
          const servicesForSingleProduct = jsonData.card_services.filter(service =>
              singleProductToInsert.card_service_mapping.includes(service.service_id)
          );

          if (!singleProductToInsert) {
            results.push(`❌ ${file}: 삽입할 단일 카드 상품 데이터가 JSON에 없습니다.`);
            failCount++;
            continue;
          }

          const result = await this.insertSingleCardProductToOracle(singleProductToInsert, servicesForSingleProduct, file);

          results.push(`${result.success ? '✅' : '❌'} ${file}: ${result.success ? `1개 카드 상품 및 ${result.insertCount}개 레코드` : result.error}`);

          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          results.push(`❌ ${file}: ${error.message}`);
          failCount++;
        }
      }

      const summary = [
        `📊 배치 처리 결과`,
        `📁 처리 디렉토리: ${directoryPath}`,
        `📋 전체 파일: ${successCount + failCount}개`,
        `✅ 성공: ${successCount}개`,
        `❌ 실패: ${failCount}개`,
        `📈 성공률: ${((successCount / (successCount + failCount)) * 100).toFixed(1)}%`,
        '',
        '📋 개별 파일 결과:',
        ...results
      ].join('\n');

      return {
        content: [{
          type: 'text',
          text: summary
        }]
      };
    } catch (error) {
      console.error(`❌ 배치 처리 실패 (${directoryPath}):`, error.message);
      return {
        content: [{
          type: 'text',
          text: `❌ 배치 처리 실패: ${error.message}`
        }]
      };
    }
  }

  // 핵심 DB 삽입 로직 (단일 카드 상품 및 서비스) - 수정된 버전
  async insertSingleCardProductToOracle(cardProduct, cardServices, fileName = 'unknown') {
    let connection;
    const { date, time } = this.getCurrentDateTime();
    const CODE_MAPPINGS = this.getCodeMappings();

    // CDSV_NO 유효성 검사를 위한 정규식 (알파벳 3자리 + 숫자 5자리)
    const serviceIdPattern = /^[A-Z]{3}\d{5}$/;

    try {
      // 풀이 이미 initializeDB에서 생성되었는지 확인
      const pool = oracledb.getPool(DB_CONFIG.poolAlias);
      if (!pool) {
          throw new Error('Oracle DB 연결 풀이 초기화되지 않았습니다.');
      }
      connection = await oracledb.getConnection(DB_CONFIG.poolAlias);
      console.error(`\n🔄 처리 시작: ${fileName}`);
      connection.autoCommit = false; // 자동 커밋 비활성화
      let insertCount = 0;

      // 1. 카드상품 데이터 INSERT (CISU_CDGD_M)
      console.error('    📋 카드상품 데이터 삽입 중...');
      const product = cardProduct; // 단일 상품 객체
      const mbcmNoProduct = CODE_MAPPINGS.ISSUER_CODE_MAP[product.issuer] || "999";
      const customerType = this.determineCustomerType(product.product_name);
      const cardGrade = CODE_MAPPINGS.CARD_GRADE_MAP[product.grade] || "10";
      const cardBrand = CODE_MAPPINGS.CARD_BRAND_MAP[product.brand] || "1";
      
      try {
          await connection.execute(`
              INSERT INTO CISU_CDGD_M (
                  MBCM_NO, CARD_GDS_CD, CARD_GDS_NM, CARD_GDS_SLE_STDT, CARD_GDS_SLE_ENDT,
                  IDVD_CORP_DVCD, CARD_GDS_DVCD, CARD_GRAD_DVCD, CARD_BRND_DVCD, ADMB_RSTRC_YN,
                  BIN_NO, EMCD_CD, BSIC_ANF, ALNC_ANF, FRST_REG_DT, FRST_REG_TIME,
                  FRST_REG_USER_NO, LAST_PROCS_DT, LAST_PROCS_TIME, LAST_PROCS_USER_NO
              ) VALUES (
                  :v1, :v2, :v3, :v4, :v5,
                  :v6, :v7, :v8, :v9, :v10,
                  :v11, :v12, :v13, :v14, :v15, :v16,
                  :v17, :v18, :v19, :v20
              )
          `, {
              v1: '701',// mbcmNoProduct,
              v2: product.product_code,
              v3: product.product_name,
              v4: product.issue_date.replace(/-/g, ''),
              v5: product.expire_date ? product.expire_date.replace(/-/g, '') : '29991231',
              v6: customerType,
              v7: '01', // 카드상품구분코드 (일반적으로 '01' 카드)
              v8: cardGrade,
              v9: cardBrand,
              v10: product.application_restriction ? 'Y' : 'N',
              v11: '552087', // BIN_NO (예시 값, 실제 값으로 대체 필요)
              v12: '8101',   // EMCD_CD (예시 값, 실제 값으로 대체 필요)
              v13: product.annual_fee.basic,
              v14: product.annual_fee.brand,
              v15: date,
              v16: time,
              v17: 'SYSTEM',
              v18: date,
              v19: time,
              v20: 'SYSTEM'
          });
          insertCount++;
          console.error(`    ✓ 카드상품: ${product.product_name}`);
      } catch (error) {
          console.error(`    ❌ 카드상품 삽입 실패 (${product.product_name}):`, error.message);
          throw error;
      }

      // 2. 카드서비스 기본 데이터 INSERT (CGDS_CDSV_M)
      console.error('    🎯 카드서비스 기본 데이터 삽입 중...');
      for (const service of cardServices) {
          const mbcmNoService = mbcmNoProduct; // 상품의 MBCM_NO와 동일하게 설정
          const serviceClass = CODE_MAPPINGS.SERVICE_CLASSIFICATION_MAP[service.service_classification]
          || CODE_MAPPINGS.SERVICE_CLASSIFICATION_MAP[service.service_classificaion] || "01";
          
          // CDSV_NO 유효성 검사 (알파벳 3자리 + 숫자 5자리)
          if (!serviceIdPattern.test(service.service_id)) {
              console.error(`    ❌ 서비스 삽입 실패 (CDSV_NO 형식 오류 - CGDS_CDSV_M): ${service.service_name} (ID: ${service.service_id}) - '알파벳 3자리 + 숫자 5자리' 형식이 아닙니다.`);
              continue; // Skip this service if ID is invalid
          }

          // CDSV_NM 길이 제한 처리 (UTF-8 기준 100 바이트)
          let serviceName = service.service_name;
          const MAX_CDSV_NM_BYTES = 100;

          let serviceNameBuffer = Buffer.from(serviceName, 'utf8');
          if (serviceNameBuffer.byteLength > MAX_CDSV_NM_BYTES) {
              let trimmedName = '';
              let byteLength = 0;
              for (let i = 0; i < serviceName.length; i++) {
                  const char = serviceName[i];
                  const charByteLength = Buffer.byteLength(char, 'utf8');
                  if (byteLength + charByteLength <= MAX_CDSV_NM_BYTES) {
                      trimmedName += char;
                      byteLength += charByteLength;
                  } else {
                      break;
                  }
              }
              console.error(`    ⚠️  CDSV_NM '${serviceName}' (원래 길이: ${serviceNameBuffer.byteLength} 바이트)이 최대 ${MAX_CDSV_NM_BYTES} 바이트를 초과하여 '${trimmedName}'으로 잘랐습니다.`);
              serviceName = trimmedName;
          }

          try {
              await connection.execute(`
                  INSERT INTO CGDS_CDSV_M (
                      MBCM_NO, CDSV_NO, CDSV_NM, CDSV_DESC, CDSV_LCCD, CDSV_MCCD, CDSV_SCCD,
                      PNT_KNCD, SRVC_MPNG_LOGIC_EXP_CHRS, ALNC_ADJS_CO_CD, CDSV_ADJS_PNTM_CD,
                      CDSV_ADJS_FNNS_CD, ONCM_BRRT, CO_BRRT, CDSV_DVCD, DEL_YN,
                      FRST_REG_DT, FRST_REG_TIME, FRST_REG_USER_NO, LAST_PROCS_DT, LAST_PROCS_TIME, LAST_PROCS_USER_NO
                  ) VALUES (
                      :s1, :s2, :s3, :s4, :s5, :s6, :s7,
                      :s8, :s9, :s10, :s11, :s12, :s13, :s14, :s15, :s16,
                      :s17, :s18, :s19, :s20, :s21, :s22
                  )
              `, {
                  s1: '701', // mbcmNoService,
                  s2: service.service_id,
                  s3: serviceName, // 길이 제한 처리된 serviceName 사용
                  s4: service.description,
                  s5: serviceClass,
                  s6: ' ', // 중분류코드 (사용하지 않을 경우 공백)
                  s7: ' ', // 소분류코드 (사용하지 않을 경우 공백)
                  s8: serviceClass === '20' ? 'PT01' : ' ', // 포인트종류코드 (마일리지 서비스일 경우 PT01)
                  s9: this.getServiceMappingLogicExpression(
                      (service.merchants ? service.merchants.length : 0) +
                      (service.merchant_codes ? service.merchant_codes.length : 0)
                  ),
                  s10: ' ', // 제휴조정회사코드 (사용하지 않을 경우 공백)
                  s11: '0', // 카드서비스조정시점코드 (사용하지 않을 경우 '0')
                  s12: ' ', // 카드서비스조정금융사코드 (사용하지 않을 경우 공백)
                  s13: 100, // 당사분담율 (예시 값, 실제 값으로 대체 필요)
                  s14: 0,   // 회사분담율 (예시 값, 실제 값으로 대체 필요)
                  s15: '1', // 카드서비스구분코드 (1: 일반 서비스)
                  s16: 'N', // 삭제여부
                  s17: date,
                  s18: time,
                  s19: 'SYSTEM',
                  s20: date,
                  s21: time,
                  s22: 'SYSTEM'
              });
              insertCount++;
              console.error(`    ✓ 서비스: ${service.service_name}`);
          } catch (error) {
              console.error(`    ❌ 서비스 삽입 실패 (${service.service_name}):`, error.message);
              throw error;
          }
      }

      // 3. 카드서비스 산출기준 INSERT (CGDS_CSCL_B)
      console.error('    💰 서비스 산출기준 데이터 삽입 중...');
      for (const service of cardServices) {
          const mbcmNo = mbcmNoProduct; // 상품의 MBCM_NO와 동일하게 설정
          const rateValues = this.calculateRateValues(service.rate);
          const minSpend = service.minimum_spend?.amount || 0;
          const maxSpend = service.maximum_spend?.amount || 999999999;
          const performanceAmount = CODE_MAPPINGS.PERFORMANCE_AMOUNT_MAP[service.minimum_spend?.period] || "1";
          const performanceCount = CODE_MAPPINGS.PERFORMANCE_COUNT_MAP[service.minimum_spend?.period] || "1";
          
          // CDSV_NO 유효성 검사
          if (!serviceIdPattern.test(service.service_id)) {
              console.error(`    ❌ 산출기준 삽입 실패 (CDSV_NO 형식 오류 - CGDS_CSCL_B): ${service.service_name} (ID: ${service.service_id}) - '알파벳 3자리 + 숫자 5자리' 형식이 아닙니다.`);
              continue; // Skip this service if ID is invalid
          }

          try {
              await connection.execute(`
                  INSERT INTO CGDS_CSCL_B (
                      MBCM_NO, CDSV_NO, RSLTS_MIN_AMT, RSLTS_MAX_AMT, RSLTS_MIN_TMCNT, RSLTS_MAX_TMCNT,
                      CDSV_UZ_RSLTS_AMT_DVCD, CDSV_UZ_RSLTS_TMCNT_DVCD, CDSV_APLY_MIN_AMT, CDSV_APLY_MAX_AMT,
                      FRIN_INS_APLY_MIN_MCNT, FRIN_INS_APLY_MAX_MCNT, CDSV_APLY_MIN_INS_NTH, CDSV_APLY_MAX_INS_NTH,
                      CDSV_APLY_EXCP_AMT, CDSV_APLY_DIVI, CDSV_APLY_MLTP, CDSV_APLY_FXAM, APRXM_PROCS_CD, DEL_YN,
                      FRST_REG_DT, FRST_REG_TIME, FRST_REG_USER_NO, LAST_PROCS_DT, LAST_PROCS_TIME, LAST_PROCS_USER_NO
                  ) VALUES (
                      :c1, :c2, :c3, :c4, :c5, :c6,
                      :c7, :c8, :c9, :c10, :c11, :c12, :c13, :c14, :c15,
                      :c16, :c17, :c18, :c19, :c20,
                      :c21, :c22, :c23, :c24, :c25, :c26
                  )
              `, {
                  c1: '701', // mbcmNo,
                  c2: service.service_id,
                  c3: minSpend, // 실적최소금액 (원)
                  c4: maxSpend, // 실적최대금액 (원)
                  c5: 0,        // 실적최소횟수
                  c6: 99999,    // 실적최대횟수
                  c7: performanceAmount, // 카드서비스이용실적금액구분코드 (1:전월, 2:당월, 0:없음)
                  c8: performanceCount, // 카드서비스이용실적횟수구분코드 (1:전월, 2:당월, 3:전년, 0:없음)
                  c9: 0,        // 카드서비스적용최소금액 (원)
                  c10: 999999999, // 카드서비스적용최대금액 (원)
                  c11: 0,       // 할부개월수적용최소개월
                  c12: 0,       // 할부개월수적용최대개월
                  c13: 0,       // 카드서비스적용최소할부개월
                  c14: 0,       // 카드서비스적용최대할부개월
                  c15: 0,       // 카드서비스적용제외금액
                  c16: rateValues.CDSV_APLY_DIVI, // 카드서비스적용나누기값
                  c17: rateValues.CDSV_APLY_MLTP, // 카드서비스적용곱하기값
                  c18: rateValues.CDSV_APLY_FXAM, // 카드서비스적용정액금액
                  c19: '1', // 산출처리코드 (1: 일반 산출)
                  c20: 'N', // 삭제여부
                  c21: date,
                  c22: time,
                  c23: 'SYSTEM',
                  c24: date,
                  c25: time,
                  c26: 'SYSTEM'
              });
              insertCount++;
              console.error(`    ✓ 산출기준: ${service.service_id} (${rateValues.CDSV_APLY_MLTP}/${rateValues.CDSV_APLY_DIVI})`);
          } catch (error) {
              console.error(`    ❌ 산출기준 삽입 실패 (${service.service_id}):`, error.message);
              throw error;
          }
      }

      // 4. 카드서비스 제한기준 INSERT (CGDS_CSLM_B)
      console.error('    🚫 서비스 제한기준 데이터 삽입 중...');
      for (const service of cardServices) {
          const mbcmNo = mbcmNoProduct; // 상품의 MBCM_NO와 동일하게 설정
          const limits = service.service_limit || {};

          // CDSV_NO 유효성 검사
          if (!serviceIdPattern.test(service.service_id)) {
              console.error(`    ❌ 제한기준 삽입 실패 (CDSV_NO 형식 오류 - CGDS_CSLM_B): ${service.service_name} (ID: ${service.service_id}) - '알파벳 3자리 + 숫자 5자리' 형식이 아닙니다.`);
              continue; // Skip this service if ID is invalid
          }

          // SRVC_RSTRC_COND_NM 생성 및 길이 제한 처리 (UTF-8 기준 92 바이트)
          const baseServiceName = this.extractServiceName(service.service_name);
          let restrictionConditionName = `${baseServiceName} 제한`;
          const MAX_SRVC_RSTRC_COND_NM_BYTES = 92;

          let restrictionNameBuffer = Buffer.from(restrictionConditionName, 'utf8');
          if (restrictionNameBuffer.byteLength > MAX_SRVC_RSTRC_COND_NM_BYTES) {
              let trimmedRestrictionName = '';
              let byteLength = 0;
              for (let i = 0; i < restrictionConditionName.length; i++) {
                  const char = restrictionConditionName[i];
                  const charByteLength = Buffer.byteLength(char, 'utf8');
                  if (byteLength + charByteLength <= MAX_SRVC_RSTRC_COND_NM_BYTES) {
                          trimmedRestrictionName += char;
                          byteLength += charByteLength;
                      } else {
                          break;
                      }
                  }
                  console.error(`    ⚠️  SRVC_RSTRC_COND_NM '${restrictionConditionName}' (원래 길이: ${restrictionNameBuffer.byteLength} 바이트)이 최대 ${MAX_SRVC_RSTRC_COND_NM_BYTES} 바이트를 초과하여 '${trimmedRestrictionName}'으로 잘랐습니다.`);
                  restrictionConditionName = trimmedRestrictionName;
              }

              try {
                  await connection.execute(`
                      INSERT INTO CGDS_CSLM_B (
                          MBCM_NO, CDSV_NO, SRVC_RSTRC_COND_NM, ONE_TM_RSTRC_AMT, DAILY_RSTRC_TMCNT, DAILY_RSTRC_AMT, MTLY_RSTRC_TMCNT, MTLY_RSTRC_AMT, ANUL_RSTRC_TMCNT, ANUL_RSTRC_AMT, DEL_YN,
                          FRST_REG_DT, FRST_REG_TIME, FRST_REG_USER_NO, LAST_PROCS_DT, LAST_PROCS_TIME, LAST_PROCS_USER_NO
                      ) VALUES (
                          :l1, :l2, :l3, :l4, :l5, :l6, :l7, :l8, :l9, :l10, :l11, :l12, :l13, :l14, :l15, :l16, :l17
                      )
                  `, {
                      l1: '701', // mbcmNo,
                      l2: service.service_id,
                      l3: restrictionConditionName, // 길이 제한 처리된 restrictionConditionName 사용
                      l4: limits.transaction_limit_amount || 999999999, // 1회제한금액
                      l5: limits.daily_limit_count || 99999,           // 일간제한횟수
                      l6: limits.daily_limit_amount || 999999999,       // 일간제한금액
                      l7: limits.monthly_limit_count || 99999,          // 월간제한횟수
                      l8: limits.monthly_limit_amount || 999999999,     // 월간제한금액
                      l9: limits.annual_limit_count || 99999,           // 연간제한횟수
                      l10: limits.annual_limit_amount || 999999999,     // 연간제한금액
                      l11: 'N', // 삭제여부
                      l12: date,
                      l13: time,
                      l14: 'SYSTEM',
                      l15: date,
                      l16: time,
                      l17: 'SYSTEM'
                  });
                  insertCount++;
                  console.error(`    ✓ 제한기준: ${service.service_id}`);
              } catch (error) {
                  console.error(`    ❌ 제한기준 삽입 실패 (${service.service_id}):`, error.message);
                  throw error;
              }
      } // for 루프 제한기준 종료

      // 5. 카드서비스 대상기준 INSERT (CGDS_CSTG_B)
      console.error('    🏪 서비스 대상기준 데이터 삽입 중...');
      for (const service of cardServices) {
          const mbcmNo = mbcmNoProduct; // 상품의 MBCM_NO와 동일하게 설정
          let seqNo = 1;
          
          // CDSV_NO 유효성 검사
          if (!serviceIdPattern.test(service.service_id)) {
              console.error(`    ❌ 대상기준 삽입 실패 (CDSV_NO 형식 오류 - CGDS_CSTG_B): ${service.service_name} (ID: ${service.service_id}) - '알파벳 3자리 + 숫자 5자리' 형식이 아닙니다.`);
              continue; // Skip this service if ID is invalid
          }

          // 가맹점 정보 처리
          if (service.merchants && service.merchants.length > 0) {
              for (const merchant of service.merchants) {
                  try {
                      await connection.execute(`
                          INSERT INTO CGDS_CSTG_B (
                              MBCM_NO, CDSV_NO, CDSV_MPNG_SEQNO, SRVC_MPNG_GROUP_ALS, CDSV_MPNG_TYCD, SRVC_MPNG_OPS_CD, CDSV_MPNG_VAL_DVCD, CDSV_MPNG_VAL, SRVC_MPNG_DTTP_CD, SRVC_MPNG_RNG_STRT_VAL, SRVC_MPNG_RNG_END_VAL, DEL_YN,
                              FRST_REG_DT, FRST_REG_TIME, FRST_REG_USER_NO, LAST_PROCS_DT, LAST_PROCS_TIME, LAST_PROCS_USER_NO
                          ) VALUES (
                              :t1, :t2, :t3, :t4, :t5, :t6, :t7, :t8, :t9, :t10, :t11, :t12, :t13, :t14, :t15, :t16, :t17, :t18
                          )
                      `, {
                          t1: '701', // mbcmNo,
                          t2: service.service_id,
                          t3: seqNo,
                          t4: this.getExcelColumnName(seqNo - 1),
                          t5: '21', // 카드서비스매핑유형코드 (21: 가맹점)
                          t6: '07', // 카드서비스매핑연산코드 (07: EQUAL)
                          t7: '1',  // 카드서비스매핑값구분코드 (1: 가맹점명)
                          t8: merchant,
                          t9: 'S',  // 카드서비스매핑데이터타입코드 (S: 문자열)
                          t10: 0,
                          t11: 0,
                          t12: 'N', // 삭제여부
                          t13: date,
                          t14: time,
                          t15: 'SYSTEM',
                          t16: date,
                          t17: time,
                          t18: 'SYSTEM'
                      });
                      seqNo++;
                      insertCount++;
                      console.error(`    ✓ 가맹점: ${merchant}`);
                  } catch (error) {
                      console.error(`    ❌ 가맹점 삽입 실패 (${merchant}):`, error.message);
                      throw error;
                  }
              }
          }

          // 가맹점 코드 정보 처리
          if (service.merchant_codes && service.merchant_codes.length > 0) {
              for (const merchantCode of service.merchant_codes) {
                  try {
                      await connection.execute(`
                          INSERT INTO CGDS_CSTG_B (
                              MBCM_NO, CDSV_NO, CDSV_MPNG_SEQNO, SRVC_MPNG_GROUP_ALS, CDSV_MPNG_TYCD, SRVC_MPNG_OPS_CD, CDSV_MPNG_VAL_DVCD, CDSV_MPNG_VAL, SRVC_MPNG_DTTP_CD, SRVC_MPNG_RNG_STRT_VAL, SRVC_MPNG_RNG_END_VAL, DEL_YN,
                              FRST_REG_DT, FRST_REG_TIME, FRST_REG_USER_NO, LAST_PROCS_DT, LAST_PROCS_TIME, LAST_PROCS_USER_NO
                          ) VALUES (
                              :t1, :t2, :t3, :t4, :t5, :t6, :t7, :t8, :t9, :t10, :t11, :t12, :t13, :t14, :t15, :t16, :t17, :t18
                          )
                      `, {
                          t1: '701', // mbcmNo,
                          t2: service.service_id,
                          t3: seqNo,
                          t4: this.getExcelColumnName(seqNo - 1),
                          t5: '09', // 카드서비스매핑유형코드 (09: 가맹점코드)
                          t6: '01', // 카드서비스매핑연산코드 (01: EQUAL)
                          t7: '2',  // 카드서비스매핑값구분코드 (2: 가맹점번호)
                          t8: merchantCode,
                          t9: 'S',  // 카드서비스매핑데이터타입코드 (S: 문자열)
                          t10: 0,
                          t11: 0,
                          t12: 'N', // 삭제여부
                          t13: date,
                          t14: time,
                          t15: 'SYSTEM',
                          t16: date,
                          t17: time,
                          t18: 'SYSTEM'
                      });
                      seqNo++;
                      insertCount++;
                      console.error(`    ✓ 가맹점 코드: ${merchantCode}`);
                  } catch (error) {
                      console.error(`    ❌ 가맹점 코드 삽입 실패 (${merchantCode}):`, error.message);
                      throw error;
                  }
              }
          }
      } // for 루프 대상기준 종료

      // 6. 상품-서비스 매핑 INSERT (CGDS_GDMP_L)
      console.error('    🔗 상품-서비스 매핑 데이터 삽입 중...');
      for (const service of cardServices) {
        try {
          // CDSV_NO 유효성 검사 (매핑 테이블도 유효성 검사 필요)
          if (!serviceIdPattern.test(service.service_id)) {
              console.error(`    ❌ 매핑 삽입 실패 (CDSV_NO 형식 오류 - CGDS_GDMP_L): ${product.product_code} - ${service.service_id} - '알파벳 3자리 + 숫자 5자리' 형식이 아닙니다.`);
              continue; // Skip this mapping if Service ID is invalid
          }

          await connection.execute(`
            INSERT INTO CGDS_GDMP_L (
                MBCM_NO, CARD_GDS_CD, CDSV_NO, CDSV_DUP_APLY_DVCD, DEL_YN, FRST_REG_DT, FRST_REG_TIME, FRST_REG_USER_NO, LAST_PROCS_DT, LAST_PROCS_TIME, LAST_PROCS_USER_NO
            ) VALUES (
                :m1, :m2, :m3, :m4, :m5, :m6, :m7, :m8, :m9, :m10, :m11
            )
          `, {
            m1: '701', // mbcmNoProduct, // 상품의 MBCM_NO
            m2: product.product_code, // 상품의 CARD_GDS_CD
            m3: service.service_id,
            m4: '1',
            m5: 'N',
            m6: date,
            m7: time,
            m8: 'SYSTEM',
            m9: date,
            m10: time,
            m11: 'SYSTEM'
          });
          insertCount++;
          console.error(`    ✓ 매핑: ${product.product_code} - ${service.service_id}`);
        } catch (error) {
          console.error(`    ❌ 매핑 삽입 실패 (${product.product_code} - ${service.service_id}):`, error.message);
          throw error;
        }
      }

      // 최종 검증: 예상된 테이블 수만큼 삽입되었는지 확인
      const expectedTables = 6; // CISU_CDGD_M(1) + CGDS_CDSV_M + CGDS_CSCL_B + CGDS_CSLM_B + CGDS_CSTG_B + CGDS_GDMP_L
      const expectedMinInserts = 1 + cardServices.length * (expectedTables - 1); // 최소 예상 삽입 수
      
      if (insertCount < expectedMinInserts) {
          throw new Error(`삽입 레코드 수가 예상보다 적습니다. 예상: ${expectedMinInserts}개 이상, 실제: ${insertCount}개`);
      }

      await connection.commit(); // 모든 삽입 성공 시 커밋
      console.error(`✅ 모든 테이블 삽입 완료: ${insertCount}개 레코드`);
      return { success: true, insertCount, fileName };

    } catch (error) {
        if (connection) {
            await connection.rollback(); // 오류 발생 시 롤백
        }
        console.error(`❌ ${fileName} 처리 중 오류 발생:`, error.message);
        return { success: false, error: error.message, fileName };
    } finally {
        if (connection) {
            try {
                await connection.close(); // 연결 반환
            } catch (err) {
                console.error('❌ 연결 종료 실패:', err.message);
            }
        }
    }
  }

  // 유틸리티 함수들
  determineCustomerType(productName) {
      const corporateKeywords = ["법인", "사업비", "연구비", "전용", "기업"];
      const isCompany = corporateKeywords.some(keyword => productName.includes(keyword));
      return isCompany ? "2" : "1";
  }

  getCurrentDateTime() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const time = now.toISOString().slice(11, 19).replace(/:/g, '').slice(0, 6);
    return { date, time };
  }

  calculateRateValues(rate) {
      if (!rate) {
          return { CDSV_APLY_DIVI: 100, CDSV_APLY_MLTP: 0, CDSV_APLY_FXAM: 0 };
      }
      if (rate.unit === "fixed_amount" || rate.unit === "per_transaction") {
          return {
              CDSV_APLY_DIVI: 100,
              CDSV_APLY_MLTP: 0,
              CDSV_APLY_FXAM: rate.value
          };
      } else if (rate.unit === "percentage") {
          let divi = 100;
          let mltp = rate.value;

          // 소수점 퍼센트 처리를 위해 divi와 mltp 조정
          if (typeof mltp === 'number' && mltp % 1 !== 0) {
              const decimalPlaces = (mltp.toString().split('.')[1] || '').length;
              divi = Math.pow(10, decimalPlaces + 2); // 예: 0.5% -> 소수점 1자리 + 2 = 1000
              mltp = mltp * Math.pow(10, decimalPlaces); // 예: 0.5 * 10 = 5
          }

          return {
              CDSV_APLY_DIVI: divi,
              CDSV_APLY_MLTP: mltp ?? 1,
              CDSV_APLY_FXAM: 0
          };
      }

      return {
          CDSV_APLY_DIVI: 100,
          CDSV_APLY_MLTP: rate.value,
          CDSV_APLY_FXAM: 0
      };
  }

  getExcelColumnName(sequenceNumber) {
      if (sequenceNumber < 0) {
          return "음수 시퀀스 번호는 지원하지 않습니다.";
      }

      let result = '';
      let num = sequenceNumber;
      // 0부터 시작하는 시퀀스 번호

      // 최대 ZZ (701)까지 지원 (26 * 26 + 26 - 1)
      if (num > 701) { // 0부터 시작하므로 ZZ는 701번째 값 (0-indexed)
          return "ZZ를 초과하는 시퀀스 번호는 지원하지 않습니다.";
      }

      do {
          const remainder = num % 26;
          result = String.fromCharCode(65 + remainder) + result;
          num = Math.floor(num / 26) - 1;
      } while (num >= 0);

      return result;
  }

  getServiceMappingLogicExpression(seqNo) {
      if (seqNo <= 1) {
          return " ";
      }

      const aliases = [];
      for (let i = 0; i < seqNo - 1; i++) {
          aliases.push(this.getExcelColumnName(i));
      }

      return aliases.join('|');
  }

  extractServiceName(restrictionConditionName) {
      if (restrictionConditionName && restrictionConditionName.includes('_')) {
          return restrictionConditionName.split('_')[0];
      }
      return restrictionConditionName;
  }

  // 정리 함수
  async cleanup() {
    try {
      // 풀이 존재하는지 확인 후 종료 시도
      const pool = oracledb.getPool(DB_CONFIG.poolAlias);
      if (pool) {
        console.error('DB 연결 풀 종료 중...');
        await pool.close(0);
        console.error('✅ DB 연결 풀 종료됨');
      } else {
        console.error('ℹ️ DB 연결 풀이 존재하지 않아 종료할 필요가 없습니다.');
      }
    } catch (error) {
      console.error('❌ DB 종료 실패:', error.message);
    }
  }

  async run() {
    // MCP 서버 시작 전 DB 연결 풀 초기화 시도
    console.error('Initializing DB connection pool...');
    const dbInitialized = await this.initializeDB();
    if (!dbInitialized) {
      console.error("⛔ DB 연결 초기화 실패. 서버를 시작할 수 없습니다.");
      process.exit(1); // DB 연결 실패 시 프로세스 종료
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Oracle Card MCP Server running on stdio');

    // 서버가 준비되었음을 클라이언트에게 알리는 신호 (stdout으로 출력)
    console.error('MCP_SERVER_READY');
  }
}

// 서버 실행
const server = new OracleCardMCPServer();
server.run().catch(console.error);