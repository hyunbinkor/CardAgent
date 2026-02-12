// ============================================================
// tools/profitability/analyzer.js — 수익성 분석 엔진
//
// 원본: mcp_profitability_analysis/index.js
//       CardProfitabilityAnalysisMCPServer 클래스 메서드 전체
// 개선:
//   - 클래스 메서드 → 독립 함수 (모듈 패턴)
//   - 하드코딩 경로 → process.env 참조
//   - console.error → createLogger('profitability')
//   - fs.readFileSync → 동기 유지 (원본 로직 보존)
//   - McpError throw → mcpError() / mcpText() 래퍼 반환
//   - card_services 배열 처리 수정 (원본은 Object.values 사용)
//   - PROFITABILITY_THRESHOLDS 상수 참조
// ============================================================

import fs from 'fs';
import path from 'path';
import { mcpText, mcpError } from '../../shared/utils.js';
import { PROFITABILITY_THRESHOLDS } from '../../shared/constants.js';
import { createLogger } from '../../shared/logger.js';
import { getMccCodesFromApi } from './mcc-lookup.js';

const logger = createLogger('profitability');

// ── JSON 파일 로드 ──────────────────────────────────────────

/**
 * JSON 파일을 동기적으로 로드 + 파싱
 *
 * @param {string} filePath - 파일 절대 경로
 * @param {string[]} debugLog - 디버그 로그 배열
 * @returns {Object|null} 파싱된 JSON 또는 null
 */
function loadJsonFile(filePath, debugLog) {
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

// ── 거래 데이터 검증 ────────────────────────────────────────

/**
 * 거래 데이터 배열 유효성 검증
 *
 * @param {Array} transactionData - 거래 JSON 배열
 * @returns {boolean}
 */
function validateTransactionData(transactionData) {
  if (!Array.isArray(transactionData)) return false;
  if (transactionData.length === 0) return false;
  const sample = transactionData[0];
  return (
    (sample.hasOwnProperty('amount') || sample.hasOwnProperty('sale_amount')) &&
    sample.hasOwnProperty('merchant_name')
  );
}

// ── 카페 거래 판별 ──────────────────────────────────────────

/**
 * 카페 관련 거래인지 판별 (가맹점명 + MCC 코드)
 *
 * @param {string} merchantName - 가맹점명
 * @param {Object} saleData - 거래 데이터
 * @returns {boolean}
 */
function isCafeTransaction(merchantName, saleData) {
  const cafeKeywords = [
    '스타벅스', '투썸플레이스', '이디야', '메가커피', '폴바셋',
    '파리바게뜨', '뚜레쥬르', '던킨도너츠', '카페', '커피',
    '개인카페', '브런치카페', '동네빵집'
  ];
  const nameMatch = cafeKeywords.some(keyword => merchantName.includes(keyword));
  const codeMatch = (
    saleData.sale_category_code === '5462' ||
    saleData.category_code === '5462' ||
    saleData.mcc === '5462'
  );
  return nameMatch || codeMatch;
}

// ── 가맹점 수수료율 조회 ────────────────────────────────────

/**
 * 가맹점명으로 수수료율 조회 (3단계 매칭)
 *
 * 1단계: merchantTypes에서 정확 매칭
 * 2단계: merchantTypes에서 부분 매칭
 * 3단계: 카테고리 키워드 매칭
 * fallback: 업계 전체 평균
 *
 * @param {string} merchantName - 가맹점명
 * @param {Object} merchantFees - merchant_fee.json 데이터
 * @returns {number} 수수료율 (0~1)
 */
function getMerchantFee(merchantName, merchantFees) {
  // 1단계: merchantTypes 정확 매칭
  for (const categoryName in merchantFees.categories) {
    const categoryData = merchantFees.categories[categoryName];
    if (categoryData.merchantTypes && categoryData.merchantTypes[merchantName]) {
      return categoryData.merchantTypes[merchantName];
    }
  }

  // 2단계: merchantTypes 부분 매칭
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

  // 3단계: 카테고리 키워드 매칭
  const categoryKeywords = {
    '카페': ['스타벅스', '투썸', '이디야', '메가커피', '커피', '카페'],
    '편의점': ['CU', 'GS25', '세븐일레븐', '이마트24', '미니스톱'],
    '패스트푸드': ['맥도날드', '버거킹', '롯데리아', 'KFC', '맘스터치'],
    '대형마트': ['이마트', '홈플러스', '롯데마트', '코스트코'],
    '온라인쇼핑': ['쿠팡', '11번가', 'G마켓', '옥션', '네이버쇼핑']
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => merchantName.includes(keyword))) {
      return (
        merchantFees.categories[category]?.baseRate ||
        merchantFees.industryBenchmarks.averageRates.전체평균
      );
    }
  }

  // fallback: 업계 전체 평균
  return merchantFees.industryBenchmarks.averageRates.전체평균;
}

// ── 할인 금액 계산 ──────────────────────────────────────────

/**
 * 단일 거래에 대한 할인 금액 계산
 *
 * @param {number} saleAmount - 거래 금액
 * @param {Object} service - 카드 서비스 객체
 * @param {Map} monthlyDiscountMap - 해당 월의 서비스별 누적 할인 맵
 * @param {string[]} customerLog - 고객별 로그 배열
 * @returns {{ discountAmount: number, benefitRate: number }}
 */
function calculateDiscount(saleAmount, service, monthlyDiscountMap, customerLog) {
  try {
    const { service_id, rate, service_limit } = service;

    if (!rate || !rate.value || !rate.unit) {
      return { discountAmount: 0, benefitRate: 0 };
    }

    // 월간 한도 초과 확인
    const currentDiscount = monthlyDiscountMap.get(service_id) || 0;
    const monthlyLimit = service_limit?.monthly_limit_amount;
    if (monthlyLimit && currentDiscount >= monthlyLimit) {
      return { discountAmount: 0, benefitRate: 0 };
    }

    // 건별 최소 금액 미달 확인
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

    // 월간 한도 초과분 절삭
    if (monthlyLimit && (currentDiscount + discountAmount) > monthlyLimit) {
      discountAmount = monthlyLimit - currentDiscount;
      benefitRate = (discountAmount / saleAmount) * 100;
    }

    if (discountAmount <= 0) {
      return { discountAmount: 0, benefitRate: 0 };
    }

    customerLog.push(
      `    - 거래액: ${saleAmount.toLocaleString()}원, ` +
      `혜택 적용율: ${benefitRate.toFixed(2)}%, ` +
      `혜택 금액: ${discountAmount.toLocaleString()}원`
    );

    return { discountAmount, benefitRate };
  } catch {
    return { discountAmount: 0, benefitRate: 0 };
  }
}

// ── 고객별 분석 ─────────────────────────────────────────────

/**
 * 단일 고객의 거래 데이터를 분석
 *
 * @param {string} filePath - 거래 JSON 파일 절대 경로
 * @param {Object} cardProduct - 카드 상품 객체
 * @param {Object} cardServices - { service_id: service } 맵
 * @param {string} groupDir - 고객 그룹 디렉토리명
 * @returns {Promise<Object|null>} 분석 결과 또는 null
 */
async function analyzeCustomer(filePath, cardProduct, cardServices, groupDir) {
  const customerLog = [];
  const logDir = process.env.PROFITABILITY_LOG_DIR;

  const transactionData = loadJsonFile(filePath, customerLog);
  if (!transactionData || !validateTransactionData(transactionData)) {
    return null;
  }

  let totalSales = 0;
  let totalBenefitCost = 0;
  const totalTransactions = transactionData.length;
  let transactionsWithBenefit = 0;

  // 월별 할인 맵 관리 (년-월 → Map(serviceId → 누적할인액))
  const monthlyDiscountMaps = new Map();

  const fileName = path.basename(filePath, '.json');
  customerLog.push(`[고객] ${fileName} 분석 시작...`);
  customerLog.push(`분석 시간: ${new Date().toISOString()}`);
  customerLog.push(`총 거래 건수: ${totalTransactions}건`);
  customerLog.push('');

  for (const saleData of transactionData) {
    const amount = saleData.amount || saleData.sale_amount;
    const merchantName = saleData.merchant_name;

    // 거래 날짜 추출 (다양한 형식 지원)
    let transactionDate;
    if (saleData.transaction_date) {
      transactionDate = new Date(saleData.transaction_date);
    } else if (saleData.date) {
      transactionDate = new Date(saleData.date);
    } else if (saleData.sale_date) {
      transactionDate = new Date(saleData.sale_date);
    } else {
      transactionDate = new Date();
    }

    // 년-월 키 생성
    const yearMonth = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyDiscountMaps.has(yearMonth)) {
      monthlyDiscountMaps.set(yearMonth, new Map());
    }
    const monthlyDiscountMap = monthlyDiscountMaps.get(yearMonth);

    if (!amount || !merchantName) continue;

    const saleAmountNum = typeof amount === 'number' ? amount : parseFloat(amount);
    if (isNaN(saleAmountNum) || saleAmountNum <= 0) continue;

    totalSales += saleAmountNum;

    // 서비스 매칭 + 할인 계산
    let discountThisTransaction = 0;

    if (cardProduct.card_service_mapping && cardServices) {
      for (const serviceId of cardProduct.card_service_mapping) {
        const service = cardServices[serviceId];
        if (service && service.merchants) {
          const isMatched = service.merchants.some(serviceMerchant => {
            return (
              merchantName.includes(serviceMerchant) ||
              serviceMerchant.includes(merchantName) ||
              (serviceMerchant === '카페' && isCafeTransaction(merchantName, saleData))
            );
          });

          if (isMatched) {
            customerLog.push(
              `  [혜택 매칭] ${merchantName} (${yearMonth}) -> 서비스: ${service.service_name || serviceId}`
            );

            const { discountAmount } = calculateDiscount(
              saleAmountNum, service, monthlyDiscountMap, customerLog
            );

            if (discountAmount > 0) {
              discountThisTransaction += discountAmount;
              monthlyDiscountMap.set(
                serviceId,
                (monthlyDiscountMap.get(serviceId) || 0) + discountAmount
              );
              break; // 첫 매칭 서비스만 적용
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
  const benefitApplicationRate = totalTransactions > 0
    ? (transactionsWithBenefit / totalTransactions) * 100
    : 0;

  // 월별 할인 현황 로그
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

  // 고객별 분석 결과 로그
  customerLog.push('');
  customerLog.push('=== 분석 결과 ===');
  customerLog.push(`총 거래액: ${totalSales.toLocaleString()}원`);
  customerLog.push(`총 혜택 비용: ${totalBenefitCost.toLocaleString()}원`);
  customerLog.push(`당사비용율: ${ourCostRatio.toFixed(2)}%`);
  customerLog.push(`혜택 적용 거래: ${transactionsWithBenefit}건`);
  customerLog.push(`혜택 적용율: ${benefitApplicationRate.toFixed(2)}%`);

  // 로그 파일 저장
  if (logDir) {
    const logGroupDir = path.join(logDir, groupDir);
    if (!fs.existsSync(logGroupDir)) {
      fs.mkdirSync(logGroupDir, { recursive: true });
    }
    const logFilePath = path.join(logGroupDir, `${fileName}_analysis.log`);
    fs.writeFileSync(logFilePath, customerLog.join('\n'), 'utf-8');
  }

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

// ── MCC 코드 업데이트 ───────────────────────────────────────

/**
 * 카드 서비스의 가맹점 중 MCC 코드가 없는 항목을 외부 API로 조회 후 캐시 갱신
 *
 * @param {Array} cardServicesList - card_services 배열
 * @param {Object} mccCode - 기존 MCC 코드 캐시
 * @returns {Promise<Object>} 업데이트된 MCC 코드 캐시
 */
async function updateMccCodeCache(cardServicesList, mccCode) {
  const mccCodePath = process.env.MCC_CODE_PATH;

  // 모든 서비스의 가맹점 추출
  const allMerchants = new Set();
  for (const service of cardServicesList) {
    if (service.merchants) {
      service.merchants.forEach(m => allMerchants.add(m));
    }
  }

  // 캐시에 없는 새 가맹점 필터링
  const newMerchants = Array.from(allMerchants).filter(
    merchant => !mccCode[merchant]
  );

  if (newMerchants.length > 0) {
    logger.info(`MCC 코드 미등록 가맹점 ${newMerchants.length}건 조회 시작`);

    const newMccCodes = await getMccCodesFromApi(newMerchants);
    const updatedMccCode = { ...mccCode, ...newMccCodes };

    // 캐시 파일 갱신
    if (mccCodePath) {
      try {
        fs.writeFileSync(mccCodePath, JSON.stringify(updatedMccCode, null, 2));
        logger.info('MCC 코드 캐시 파일 갱신 완료');
      } catch (error) {
        logger.warn(`MCC 코드 캐시 파일 저장 실패: ${error.message}`);
      }
    }

    return updatedMccCode;
  }

  return mccCode;
}

// ── 분석 결과 포맷팅 ────────────────────────────────────────

/**
 * 그룹별 분석 결과를 텍스트 리포트로 포맷팅
 *
 * @param {Object} cardProduct - 카드 상품 객체
 * @param {Object} cardServices - 서비스 맵
 * @param {Array} allGroupResults - 그룹별 집계 결과 배열
 * @param {string} logDir - 로그 디렉토리 경로
 * @returns {string} 포맷된 분석 리포트 텍스트
 */
function formatAnalysisReport(cardProduct, cardServices, allGroupResults, logDir) {
  const result = [];

  const annualFee = cardProduct.annual_fee?.basic || cardProduct.annual_fee?.total || 0;
  result.push(`=== 카드 수익성 분석 시작 (v3.0) ===`);
  result.push(`분석 시작 시간: ${new Date().toISOString()}`);
  result.push(``);
  result.push(`📊 카드 정보`);
  result.push(`├─ 카드명: ${cardProduct.product_name}`);
  result.push(`├─ 연회비: ${annualFee.toLocaleString()}원`);
  result.push(`├─ 서비스 수: ${Object.keys(cardServices).length}개`);
  result.push(`└─ 서비스 매핑: ${cardProduct.card_service_mapping?.length || 0}개`);
  result.push(``);

  // 그룹별 결과
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

  // 전체 평균
  const totalCostRatio = allGroupResults.reduce((sum, g) => sum + g.ourCostRatio, 0);
  const averageCostRatio = allGroupResults.length > 0
    ? totalCostRatio / allGroupResults.length
    : 0;

  const totalBenefitRate = allGroupResults.reduce((sum, g) => sum + g.benefitApplicationRate, 0);
  const averageBenefitRate = allGroupResults.length > 0
    ? totalBenefitRate / allGroupResults.length
    : 0;

  result.push(`${'='.repeat(60)}`);
  result.push(`📈 전체 고객 그룹 평균`);
  result.push(`├─ 평균 당사비용율: ${averageCostRatio.toFixed(2)}%`);
  result.push(`└─ 평균 혜택 적용율: ${averageBenefitRate.toFixed(2)}%`);
  result.push(``);
  result.push(
    `💡 참고: 일반적으로 고객그룹 중 최대 당사비용율은 ` +
    `${PROFITABILITY_THRESHOLDS.AVG_COST_RATE_MAX}% ~ ` +
    `${PROFITABILITY_THRESHOLDS.GROUP_COST_RATE_MAX}% 수준에 들어가야 합니다.`
  );
  result.push(
    `💡 참고: 일반적으로 고객그룹 총 평균 당사비용율은 ` +
    `${PROFITABILITY_THRESHOLDS.AVG_COST_RATE_MIN}% ~ ` +
    `${PROFITABILITY_THRESHOLDS.AVG_COST_RATE_MAX}% 수준을 유지해야 합니다.`
  );
  result.push(`💡 참고: 당사비용율이 너무 낮아도 혜택이 적어 고객들이 사용할 유인이 적어질 수 있습니다.`);
  result.push(
    `💡 주의: 한도 제한 없는 혜택을 제외하고 월간 한도 합계가 ` +
    `${PROFITABILITY_THRESHOLDS.MONTHLY_LIMIT_MAX.toLocaleString()}원을 초과하는 경우 한도를 재조정하세요.`
  );
  if (logDir) {
    result.push(`🔍 상세 로그 위치: ${logDir}`);
  }
  result.push(`${'='.repeat(60)}`);

  return result.join('\n');
}

// ── 메인 핸들러 ─────────────────────────────────────────────

/**
 * 카드 상품 수익성 분석 실행
 *
 * 플로우:
 *   1. 카드 데이터 + 수수료 데이터 로드
 *   2. MCC 코드 캐시 갱신 (새 가맹점 있으면 외부 API 호출)
 *   3. 고객 그룹별 거래 데이터 순회 → 혜택 비용 계산
 *   4. 그룹별·전체 평균 당사비용율/혜택적용율 집계
 *   5. 분석 리포트 텍스트 반환
 *
 * @param {Object} args
 * @param {string} args.card_file_name - 카드 데이터 JSON 파일명
 * @returns {Promise<Object>} MCP 응답
 */
export async function analyzeProfitability(args) {
  try {
    const { card_file_name } = args;
    const debugLog = [];

    // 1. 환경변수 검증
    const cardDataDir = process.env.CARD_DATA_DIR;
    const merchantFeePath = process.env.MERCHANT_FEE_PATH;
    const mccCodePath = process.env.MCC_CODE_PATH;
    const mydataDir = process.env.MYDATA_DIR;
    const logDir = process.env.PROFITABILITY_LOG_DIR;

    if (!cardDataDir) return mcpError('환경변수 CARD_DATA_DIR가 설정되지 않았습니다');
    if (!merchantFeePath) return mcpError('환경변수 MERCHANT_FEE_PATH가 설정되지 않았습니다');
    if (!mydataDir) return mcpError('환경변수 MYDATA_DIR가 설정되지 않았습니다');

    // 2. 카드 데이터 + 수수료 데이터 로드
    const cardFilePath = path.join(cardDataDir, card_file_name);
    const cardInfo = loadJsonFile(cardFilePath, debugLog);
    const merchantFees = loadJsonFile(merchantFeePath, debugLog);

    if (!cardInfo || !merchantFees) {
      return mcpError(`⛔ 필수 데이터 파일을 로드할 수 없습니다.\n${debugLog.join('\n')}`);
    }

    if (!cardInfo.card_products || cardInfo.card_products.length === 0) {
      return mcpError(`⛔ 카드 상품 정보가 없습니다\n${debugLog.join('\n')}`);
    }

    // 3. 카드 서비스 맵 구성 + MCC 코드 캐시 갱신
    const cardProduct = cardInfo.card_products[0];
    const cardServices = {};

    if (cardInfo.card_services) {
      cardInfo.card_services.forEach(service => {
        cardServices[service.service_id] = service;
      });
    }

    // MCC 코드 캐시 로드 + 갱신
    let mccCode = {};
    if (mccCodePath) {
      mccCode = loadJsonFile(mccCodePath, debugLog) || {};
    }
    await updateMccCodeCache(cardInfo.card_services || [], mccCode);

    // 4. 거래 데이터 디렉토리 확인
    if (!fs.existsSync(mydataDir)) {
      return mcpError(`⛔ 거래 데이터 디렉토리를 찾을 수 없음: ${mydataDir}`);
    }

    // 로그 디렉토리 생성
    if (logDir && !fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // 5. 고객 그룹 목록 조회
    const customerGroups = fs.readdirSync(mydataDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (customerGroups.length === 0) {
      return mcpError('⛔ 고객 그룹이 없습니다');
    }

    const MAX_GROUPS = Math.min(50, customerGroups.length);
    logger.info(`분석 시작: ${MAX_GROUPS}개 그룹, 카드: ${cardProduct.product_name}`);

    // 6. 그룹별 분석 실행
    const allGroupResults = [];

    for (const groupDir of customerGroups.slice(0, MAX_GROUPS)) {
      const groupPath = path.join(mydataDir, groupDir);
      const transactionFiles = fs.readdirSync(groupPath)
        .filter(file => file.endsWith('.json'));

      // 고객별 병렬 분석
      const customerPromises = transactionFiles.map(fileName =>
        analyzeCustomer(
          path.join(groupPath, fileName),
          cardProduct,
          cardServices,
          groupDir
        )
      );

      const customerResults = (await Promise.all(customerPromises)).filter(r => r !== null);

      // 그룹 집계
      const groupTotalSales = customerResults.reduce((sum, c) => sum + c.totalSales, 0);
      const groupTotalBenefitCost = customerResults.reduce((sum, c) => sum + c.totalBenefitCost, 0);
      const groupTotalTransactions = customerResults.reduce((sum, c) => sum + c.totalTransactions, 0);
      const groupTransactionsWithBenefit = customerResults.reduce((sum, c) => sum + c.transactionsWithBenefit, 0);

      const groupOurCostRatio = groupTotalSales > 0
        ? (groupTotalBenefitCost / groupTotalSales) * 100
        : 0;
      const groupBenefitApplicationRate = groupTotalTransactions > 0
        ? (groupTransactionsWithBenefit / groupTotalTransactions) * 100
        : 0;

      // 그룹 요약 로그 저장
      if (logDir) {
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
            `${cust.fileName}: 거래액 ${cust.totalSales.toLocaleString()}원, ` +
            `당사비용율 ${cust.ourCostRatio.toFixed(2)}%, ` +
            `혜택적용율 ${cust.benefitApplicationRate.toFixed(2)}%`
          )
        ];

        const logGroupDir = path.join(logDir, groupDir);
        if (!fs.existsSync(logGroupDir)) {
          fs.mkdirSync(logGroupDir, { recursive: true });
        }
        fs.writeFileSync(
          path.join(logGroupDir, 'group_summary.log'),
          groupSummaryLog.join('\n'),
          'utf-8'
        );
      }

      allGroupResults.push({
        groupDir,
        totalSales: groupTotalSales,
        totalBenefitCost: groupTotalBenefitCost,
        ourCostRatio: groupOurCostRatio,
        benefitApplicationRate: groupBenefitApplicationRate
      });
    }

    // 7. 리포트 생성 + 반환
    logger.info(`분석 완료: ${allGroupResults.length}개 그룹`);
    const report = formatAnalysisReport(cardProduct, cardServices, allGroupResults, logDir);
    return mcpText(report);

  } catch (error) {
    logger.error('수익성 분석 실패:', error.message);
    return mcpError(`수익성 분석 실패: ${error.message}`);
  }
}