import fs from 'fs';
import path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import 'dotenv/config';
import getMccCodeFromClaude from './useClaude.js';

let mccCode = {};
try {
  const fileContent = fs.readFileSync(
    process.env.MCC_PATH || "C:/Projects/Opering_Demo/card/mcp_profitability_analysis/mccCode.json",
    'utf-8'
  );
  mccCode = JSON.parse(fileContent);
} catch (error) {
  console.error('Failed to load mccCode.json:', error);
  // 오류 발생 시 빈 객체로 초기화하여 다음 로직이 진행될 수 있게 함
  mccCode = {};
}

// 환경 변수나 설정 파일에서 경로를 가져오도록 개선
const BASE_PATH = process.env.BASE_PATH || 'C:/Projects/Opering_Demo';
const MERCHANT_FEE_PATH = path.join(BASE_PATH, 'card', 'mcp_profitability_analysis', 'merchant_fee.json');
const CARD_DATA_DIR = path.join(BASE_PATH, 'asset', 'card-data');
const DATA_DIR = path.join(BASE_PATH, 'mydata', 'mydata_span', 'generated_data');
const LOG_BASE_DIR = path.join(BASE_PATH, 'card', 'mcp_profitability_analysis', 'log');

// 모든 서비스의 가맹점 MCC Code 업데이트
async function updateMccCodeFile(card_service_mapping) {
  // 1. 모든 서비스의 merchant 추출
  const allMerchants = new Set();
  for (const service of Object.values(card_service_mapping)) {
      if (service.merchants) {
          service.merchants.forEach(m => allMerchants.add(m));
      }
  }

  // 2. mccCode.json 로드 및 새 가맹점 필터링
  const newMerchants = Array.from(allMerchants).filter(
      merchant => !mccCode[merchant]
  );

  // 3. useClaude 호출 (비동기)
  if (newMerchants.length > 0) {
      console.error(`Updating MCC codes for ${newMerchants.length} new merchants...`);
      const newMccCodes = await getMccCodeFromClaude(newMerchants);

      // 4. mccCode.json 업데이트 및 저장
      const updatedMccCode = { ...mccCode, ...newMccCodes };
      fs.writeFileSync('./mccCode.json', JSON.stringify(updatedMccCode, null, 2));
      console.error('MCC Code file updated successfully.');
  }
}

export class CardProfitabilityAnalysisMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'card-profitability-analysis',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'card_profitability_analysis',
            description: '카드 상품의 수익성을 분석합니다.',
            inputSchema: {
              type: 'object',
              properties: {
                card_file_name: {
                  type: 'string',
                  description: '분석할 카드 상품 정보가 담긴 JSON 파일명'
                },
              },
              required: ['card_file_name']
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      let debugLog = [];

      try {
        switch (name) {
          case 'card_profitability_analysis':
            const cardFileName = args.card_file_name;
            const cardFilePath = path.join(CARD_DATA_DIR, cardFileName);
            const cardInfo = this.loadJsonFile(cardFilePath, debugLog);
            const merchantFees = this.loadJsonFile(MERCHANT_FEE_PATH, debugLog);

            if (!cardInfo || !merchantFees) {
              const errorMessage = `⛔ 필수 데이터 파일을 로드할 수 없습니다.\n${debugLog.join('\n')}`;
              return {
                content: [
                  {
                    type: 'text',
                    text: errorMessage
                  }
                ]
              };
            }

            if (!cardInfo.card_products || cardInfo.card_products.length === 0) {
              const errorMessage = `⛔ 카드 상품 정보가 없습니다\n${debugLog.join('\n')}`;
              return {
                content: [
                  {
                    type: 'text',
                    text: errorMessage
                  }
                ]
              };
            }
            
            await updateMccCodeFile(cardInfo.card_services);
            const result = await this.analyzeProfitability(cardInfo, merchantFees, debugLog);
            
            return {
              content: [
                {
                  type: 'text',
                  text: result
                }
              ]
            };
            
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing ${name}: ${error.message}`
        );
      }
    });
  }

  loadJsonFile(filePath, debugLog) {
    try {
      debugLog.push(`[FILE] 파일 로드 시도: ${filePath}`);
      if (!fs.existsSync(filePath)) {
        debugLog.push(`[FILE] ⛔ 파일이 존재하지 않음: ${filePath}`);
        return null;
      }
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      debugLog.push(`[FILE] 파일 읽기 성공: ${fileContent.length}bytes`);
      const jsonData = JSON.parse(fileContent);
      debugLog.push(`[FILE] ✅ JSON 파싱 성공`);
      return jsonData;
    } catch (error) {
      debugLog.push(`[FILE] ⛔ 파일 로드/파싱 실패: ${error.message}`);
      return null;
    }
  }

  getMerchantFee(merchantName, merchantFees) {
    for (const categoryName in merchantFees.categories) {
      const categoryData = merchantFees.categories[categoryName];
      if (categoryData.merchantTypes && categoryData.merchantTypes[merchantName]) {
        return categoryData.merchantTypes[merchantName];
      }
    }
    for (const categoryName in merchantFees.categories) {
      const categoryData = merchantFees.categories[categoryName];
      if (categoryData.merchantTypes) {
        for (const merchantType in categoryData.merchantTypes) {
          if (merchantName.includes(merchantType) || merchantType.includes(merchantName)) {
            return categoryData.merchantTypes[merchantType];
          }
        }
      }
    }
    const categoryKeywords = {
      '카페': ['스타벅스', '투썸', '이디야', '메가커피', '커피', '카페'],
      '편의점': ['CU', 'GS25', '세븐일레븐', '이마트24', '미니스톱'],
      '패스트푸드': ['맥도날드', '버거킹', '롯데리아', 'KFC', '맘스터치'],
      '대형마트': ['이마트', '홈플러스', '롯데마트', '코스트코'],
      '온라인쇼핑': ['쿠팡', '11번가', 'G마켓', '옥션', '네이버쇼핑']
    };
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => merchantName.includes(keyword))) {
        const rate = merchantFees.categories[category]?.baseRate || merchantFees.industryBenchmarks.averageRates.전체평균;
        return rate;
      }
    }
    const defaultRate = merchantFees.industryBenchmarks.averageRates.전체평균;
    return defaultRate;
  }

  calculateDiscount(saleAmount, service, monthlyDiscountMap, customerLog) {
    try {
      const { service_id, rate, service_limit } = service;
      if (!rate || !rate.value || !rate.unit) {
        return { discountAmount: 0, benefitRate: 0 };
      }
      const currentDiscount = monthlyDiscountMap.get(service_id) || 0;
      const monthlyLimit = service_limit?.monthly_limit_amount;
      if (monthlyLimit && currentDiscount >= monthlyLimit) {
        return { discountAmount: 0, benefitRate: 0 };
      }
      if (service_limit?.transaction_limit_amount && saleAmount < service_limit.transaction_limit_amount) {
        return { discountAmount: 0, benefitRate: 0 };
      }

      let discountAmount = 0;
      let benefitRate = 0;

      if (rate.unit === 'fixed_amount') {
        discountAmount = rate.value;
        benefitRate = (rate.value / saleAmount) * 100;
      } else if (rate.unit === 'percentage') {
        discountAmount = saleAmount * (rate.value / 100);
        benefitRate = rate.value;
      } else {
        return { discountAmount: 0, benefitRate: 0 };
      }

      if (monthlyLimit && (currentDiscount + discountAmount) > monthlyLimit) {
        discountAmount = monthlyLimit - currentDiscount;
        benefitRate = (discountAmount / saleAmount) * 100;
      }

      if (discountAmount <= 0) {
        return { discountAmount: 0, benefitRate: 0 };
      }

      // Log for this specific transaction (고객별 로그에 추가)
      customerLog.push(`    - 거래액: ${saleAmount.toLocaleString()}원, 혜택 적용율: ${benefitRate.toFixed(2)}%, 혜택 금액: ${discountAmount.toLocaleString()}원`);

      return { discountAmount, benefitRate };
    } catch (error) {
      return { discountAmount: 0, benefitRate: 0 };
    }
  }

  validateTransactionData(transactionData) {
    if (!Array.isArray(transactionData)) return false;
    if (transactionData.length === 0) return false;
    const sample = transactionData[0];
    return (sample.hasOwnProperty('amount') || sample.hasOwnProperty('sale_amount')) && sample.hasOwnProperty('merchant_name');
  }

  isCafeTransaction(merchantName, saleData) {
    const cafeKeywords = [
      '스타벅스', '투썸플레이스', '이디야', '메가커피', '폴바셋',
      '파리바게뜨', '뚜레쥬르', '던킨도너츠', '카페', '커피',
      '개인카페', '브런치카페', '동네빵집'
    ];
    const nameMatch = cafeKeywords.some(keyword => merchantName.includes(keyword));
    const codeMatch = saleData.sale_category_code === '5462' || saleData.category_code === '5462' || saleData.mcc === '5462';
    return nameMatch || codeMatch;
  }

  async analyzeCustomer(filePath, cardProduct, cardServices, groupDir) {
    // 고객별 로그 초기화
    const customerLog = [];
    
    const transactionData = this.loadJsonFile(filePath, customerLog);
    if (!transactionData || !this.validateTransactionData(transactionData)) {
      return null;
    }

    let totalSales = 0;
    let totalBenefitCost = 0;
    let totalTransactions = transactionData.length;
    let transactionsWithBenefit = 0;
    
    // 월별 할인 맵을 관리 (년-월을 키로 사용)
    const monthlyDiscountMaps = new Map(); // key: 'YYYY-MM', value: Map(serviceId -> discountAmount)
    
    // Log for this customer
    const fileName = path.basename(filePath, '.json');
    customerLog.push(`[고객] ${fileName} 분석 시작...`);
    customerLog.push(`분석 시간: ${new Date().toISOString()}`);
    customerLog.push(`총 거래 건수: ${totalTransactions}건`);
    customerLog.push('');
    
    for (const saleData of transactionData) {
      const amount = saleData.amount || saleData.sale_amount;
      const merchant_name = saleData.merchant_name;
      
      // 거래 날짜 추출 (다양한 날짜 형식 지원)
      let transactionDate;
      if (saleData.transaction_date) {
        transactionDate = new Date(saleData.transaction_date);
      } else if (saleData.date) {
        transactionDate = new Date(saleData.date);
      } else if (saleData.sale_date) {
        transactionDate = new Date(saleData.sale_date);
      } else {
        // 날짜가 없는 경우 현재 날짜 사용
        transactionDate = new Date();
      }
      
      // 년-월 키 생성 (YYYY-MM 형식)
      const yearMonth = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, '0')}`;
      
      // 해당 월의 할인 맵이 없으면 생성
      if (!monthlyDiscountMaps.has(yearMonth)) {
        monthlyDiscountMaps.set(yearMonth, new Map());
      }
      const monthlyDiscountMap = monthlyDiscountMaps.get(yearMonth);
      
      if (!amount || !merchant_name) continue;

      const saleAmountNum = typeof amount === 'number' ? amount : parseFloat(amount);
      if (isNaN(saleAmountNum) || saleAmountNum <= 0) continue;

      totalSales += saleAmountNum;
      
      let discountThisTransaction = 0;
      if (cardProduct.card_service_mapping && cardServices) {
        for (const serviceId of cardProduct.card_service_mapping) {
          const service = cardServices[serviceId];
          if (service && service.merchants) {
            const isMatched = service.merchants.some(serviceMerchant => {
              return merchant_name.includes(serviceMerchant) ||
                    serviceMerchant.includes(merchant_name) ||
                    (serviceMerchant === '카페' && this.isCafeTransaction(merchant_name, saleData));
            });

            if (isMatched) {
              customerLog.push(`  [혜택 매칭] ${merchant_name} (${yearMonth}) -> 서비스: ${service.service_name || serviceId}`);
              const { discountAmount, benefitRate } = this.calculateDiscount(saleAmountNum, service, monthlyDiscountMap, customerLog);
              if (discountAmount > 0) {
                discountThisTransaction += discountAmount;
                monthlyDiscountMap.set(serviceId, (monthlyDiscountMap.get(serviceId) || 0) + discountAmount);
                break;
              }
            }
          }
        }
      }
      if (discountThisTransaction > 0) {
        transactionsWithBenefit++;
      }
      totalBenefitCost += discountThisTransaction;
    }

    const ourCostRatio = totalSales > 0 ? (totalBenefitCost / totalSales) * 100 : 0;
    const benefitApplicationRate = totalTransactions > 0 ? (transactionsWithBenefit / totalTransactions) * 100 : 0;

    // 월별 할인 현황을 로그에 추가
    customerLog.push('');
    customerLog.push('=== 월별 할인 현황 ===');
    for (const [yearMonth, discountMap] of monthlyDiscountMaps.entries()) {
      customerLog.push(`[${yearMonth}]`);
      for (const [serviceId, totalDiscount] of discountMap.entries()) {
        const serviceName = cardServices[serviceId]?.service_name || serviceId;
        const monthlyLimit = cardServices[serviceId]?.service_limit?.monthly_limit_amount;
        const limitInfo = monthlyLimit ? ` (한도: ${monthlyLimit.toLocaleString()}원)` : '';
        customerLog.push(`  - ${serviceName}: ${totalDiscount.toLocaleString()}원${limitInfo}`);
      }
    }

    // 고객별 분석 결과를 로그에 추가
    customerLog.push('');
    customerLog.push('=== 분석 결과 ===');
    customerLog.push(`총 거래액: ${totalSales.toLocaleString()}원`);
    customerLog.push(`총 혜택 비용: ${totalBenefitCost.toLocaleString()}원`);
    customerLog.push(`당사비용율: ${ourCostRatio.toFixed(2)}%`);
    customerLog.push(`혜택 적용 거래: ${transactionsWithBenefit}건`);
    customerLog.push(`혜택 적용율: ${benefitApplicationRate.toFixed(2)}%`);

    // 로그 디렉토리 생성 및 파일 저장
    const logGroupDir = path.join(LOG_BASE_DIR, groupDir);
    if (!fs.existsSync(logGroupDir)) {
      fs.mkdirSync(logGroupDir, { recursive: true });
    }
    
    const logFilePath = path.join(logGroupDir, `${fileName}_analysis.log`);
    fs.writeFileSync(logFilePath, customerLog.join('\n'), 'utf-8');

    return {
      fileName,
      totalSales,
      totalBenefitCost,
      ourCostRatio,
      totalTransactions,
      transactionsWithBenefit,
      benefitApplicationRate
    };
  }

  async analyzeProfitability(cardInfo, merchantFees, debugLog) {
    let result = [];
    const cardProduct = cardInfo.card_products[0];
    const cardServices = {};

    result.push(`=== 카드 수익성 분석 시작 (v2.0) ===`);
    result.push(`분석 시작 시간: ${new Date().toISOString()}`);
    result.push(`입력 파일명: ${cardProduct.product_name}`);
    result.push(``);

    if (cardInfo.card_services) {
      cardInfo.card_services.forEach(service => {
        cardServices[service.service_id] = service;
      });
    }

    const annualFee = cardProduct.annual_fee?.basic || cardProduct.annual_fee?.total || 0;
    result.push(`📊 카드 정보`);
    result.push(`├─ 카드명: ${cardProduct.product_name}`);
    result.push(`├─ 연회비: ${annualFee.toLocaleString()}원`);
    result.push(`├─ 서비스 수: ${Object.keys(cardServices).length}개`);
    result.push(`└─ 서비스 매핑: ${cardProduct.card_service_mapping?.length || 0}개`);
    result.push(``);

    if (!fs.existsSync(DATA_DIR)) {
      result.push(`⛔ 거래 데이터 디렉토리를 찾을 수 없음: ${DATA_DIR}`);
      return result.join('\n');
    }

    // 로그 기본 디렉토리 생성
    if (!fs.existsSync(LOG_BASE_DIR)) {
      fs.mkdirSync(LOG_BASE_DIR, { recursive: true });
    }

    const customerGroups = fs.readdirSync(DATA_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (customerGroups.length === 0) {
      result.push(`⛔ 고객 그룹이 없습니다`);
      return result.join('\n');
    }

    const allGroupResults = [];
    const MAX_GROUPS = Math.min(50, customerGroups.length);

    result.push(`📄 분석 진행 중...`);
    result.push(`└─ 처리할 그룹 수: ${MAX_GROUPS}개`);
    result.push(`└─ 로그 저장 위치: ${LOG_BASE_DIR}`);
    result.push(``);

    // Process each customer group
    for (const groupDir of customerGroups.slice(0, MAX_GROUPS)) {
      const groupPath = path.join(DATA_DIR, groupDir);
      const transactionFiles = fs.readdirSync(groupPath).filter(file => file.endsWith('.json'));
      
      const customerPromises = transactionFiles.map(fileName =>
        this.analyzeCustomer(path.join(groupPath, fileName), cardProduct, cardServices, groupDir)
      );

      const customerResults = (await Promise.all(customerPromises)).filter(r => r !== null);

      // Aggregate group results
      const groupTotalSales = customerResults.reduce((sum, cust) => sum + cust.totalSales, 0);
      const groupTotalBenefitCost = customerResults.reduce((sum, cust) => sum + cust.totalBenefitCost, 0);
      const groupTotalTransactions = customerResults.reduce((sum, cust) => sum + cust.totalTransactions, 0);
      const groupTransactionsWithBenefit = customerResults.reduce((sum, cust) => sum + cust.transactionsWithBenefit, 0);

      const groupOurCostRatio = groupTotalSales > 0 ? (groupTotalBenefitCost / groupTotalSales) * 100 : 0;
      const groupBenefitApplicationRate = groupTotalTransactions > 0 ? (groupTransactionsWithBenefit / groupTotalTransactions) * 100 : 0;
      
      // 그룹별 요약 로그 파일 생성
      const groupSummaryLog = [
        `=== ${groupDir} 그룹 분석 요약 ===`,
        `분석 시간: ${new Date().toISOString()}`,
        `처리된 고객 수: ${customerResults.length}명`,
        `총 거래액: ${groupTotalSales.toLocaleString()}원`,
        `총 혜택 비용: ${groupTotalBenefitCost.toLocaleString()}원`,
        `그룹 당사비용율: ${groupOurCostRatio.toFixed(2)}%`,
        `그룹 혜택 적용율: ${groupBenefitApplicationRate.toFixed(2)}%`,
        '',
        '=== 고객별 상세 결과 ===',
        ...customerResults.map(cust => 
          `${cust.fileName}: 거래액 ${cust.totalSales.toLocaleString()}원, 당사비용율 ${cust.ourCostRatio.toFixed(2)}%, 혜택적용율 ${cust.benefitApplicationRate.toFixed(2)}%`
        )
      ];
      
      const logGroupDir = path.join(LOG_BASE_DIR, groupDir);
      if (!fs.existsSync(logGroupDir)) {
        fs.mkdirSync(logGroupDir, { recursive: true });
      }
      fs.writeFileSync(path.join(logGroupDir, 'group_summary.log'), groupSummaryLog.join('\n'), 'utf-8');
      
      allGroupResults.push({
        groupDir,
        totalSales: groupTotalSales,
        totalBenefitCost: groupTotalBenefitCost,
        ourCostRatio: groupOurCostRatio,
        benefitApplicationRate: groupBenefitApplicationRate
      });
    }

    // Overall summary
    const totalCostRatio = allGroupResults.reduce((sum, group) => sum + group.ourCostRatio, 0);
    const averageCostRatio = allGroupResults.length > 0 ? totalCostRatio / allGroupResults.length : 0;
    
    const totalBenefitRate = allGroupResults.reduce((sum, group) => sum + group.benefitApplicationRate, 0);
    const averageBenefitRate = allGroupResults.length > 0 ? totalBenefitRate / allGroupResults.length : 0;

    result.push(`└─ 분석 완료!`);
    result.push(``);
    result.push(`${'='.repeat(60)}`);
    result.push(`📊 그룹별 당사비용율 및 혜택 적용율 분석 결과`);
    result.push(`${'='.repeat(60)}`);
    result.push(``);

    for (const groupResult of allGroupResults) {
      result.push(`[ ${groupResult.groupDir} ]`);
      result.push(`├─ 총 거래액: ${groupResult.totalSales.toLocaleString()}원`);
      result.push(`├─ 혜택 제공 비용: ${groupResult.totalBenefitCost.toLocaleString()}원`);
      result.push(`├─ 당사비용율: ${groupResult.ourCostRatio.toFixed(2)}%`);
      result.push(`└─ 혜택 적용율: ${groupResult.benefitApplicationRate.toFixed(2)}%`);
      result.push(``);
    }

    result.push(`${'='.repeat(60)}`);
    result.push(`📈 전체 고객 그룹 평균`);
    result.push(`├─ 평균 당사비용율: ${averageCostRatio.toFixed(2)}%`);
    result.push(`└─ 평균 혜택 적용율: ${averageBenefitRate.toFixed(2)}%`);
    result.push(``);
    result.push(`💡 참고: 일반적으로 고객그룹 중 최대 당사비용율은 0.7% ~ 0.9% 수준에 들어가야 합니다.`);
    result.push(`💡 참고: 일반적으로 고객그룹 총 평균 당사비용율은 0.3% ~ 0.6% 수준을 유지해야 합니다.`);
    result.push(`💡 참고: 당사비용율이 너무 낮아도 혜택이 적어 고객들이 사용할 유인이 적어질 수 있습니다.`);
    result.push(`💡 주의: 한도 제한 없는 혜택을 제외하고 월간 한도 합계가 7만원을 초과하는 경우 한도를 재조정하세요.`);
    result.push(`🔍 상세 로그 위치: ${LOG_BASE_DIR}`);
    result.push(`${'='.repeat(60)}`);

    return result.join('\n');
  }

  async runServer() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Improved Card Profitability Analysis MCP Server v2.0 is running...');
  }
}

const serverInstance = new CardProfitabilityAnalysisMCPServer();
serverInstance.runServer().catch(console.error);