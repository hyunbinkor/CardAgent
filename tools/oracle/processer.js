// ============================================================
// tools/oracle/processor.js — 카드 데이터 Oracle DB 삽입
//
// 원본: oracle-card-processor/index.js
//       insertSingleCardProductToOracle(), processCardJson()
// 개선:
//   - 클래스 메서드 → 독립 함수 모듈
//   - 인라인 DB 초기화 → 공유 oracle-pool.js
//   - 인라인 코드 매핑 → 공유 ORACLE_CODE_MAPS
//   - 삽입 전 검증 → 공유 preValidateForOracle()
//   - console.error → createLogger('oracle')
//   - throw → mcpError() 래퍼 반환
//   - 하드코딩 경로 → process.env 참조
//
// 삽입 대상 테이블 (6개):
//   1. CISU_CDGD_M   — 카드상품 마스터
//   2. CGDS_CDSV_M   — 카드서비스 마스터
//   3. CGDS_CSCL_B   — 카드서비스 산출기준
//   4. CGDS_CSLM_B   — 카드서비스 제한기준
//   5. CGDS_CSTG_B   — 카드서비스 대상기준 (가맹점/코드)
//   6. CGDS_GDMP_L   — 상품-서비스 매핑
// ============================================================

import fs from 'fs';
import path from 'path';
import { getConnection } from '../../shared/db/oracle-pool.js';
import { ORACLE_CODE_MAPS } from '../../shared/constants.js';
import { preValidateForOracle } from '../../shared/validators.js';
import { mcpText, mcpError } from '../../shared/utils.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('oracle');

// CDSV_NO 유효성 검사 정규식 (알파벳 3자리 + 숫자 5자리)
const SERVICE_ID_PATTERN = /^[A-Z]{3}\d{5}$/;

// ── 유틸리티 함수 ───────────────────────────────────────────

/**
 * 현재 날짜/시간을 Oracle 형식으로 반환
 * @returns {{ date: string, time: string }} YYYYMMDD, HHMMSS
 */
function getCurrentDateTime() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '').slice(0, 6);
  return { date, time };
}

/**
 * 상품명에서 개인/법인 구분
 * @param {string} productName - 카드 상품명
 * @returns {string} '1'(개인) 또는 '2'(법인)
 */
function determineCustomerType(productName) {
  const corporateKeywords = ['법인', '사업비', '연구비', '전용', '기업'];
  const isCorporate = corporateKeywords.some(keyword => productName.includes(keyword));
  return isCorporate ? '2' : '1';
}

/**
 * rate 객체에서 Oracle 산출 값 계산
 *
 * @param {Object} rate - { unit, value }
 * @returns {{ CDSV_APLY_DIVI: number, CDSV_APLY_MLTP: number, CDSV_APLY_FXAM: number }}
 */
function calculateRateValues(rate) {
  if (!rate) {
    return { CDSV_APLY_DIVI: 100, CDSV_APLY_MLTP: 0, CDSV_APLY_FXAM: 0 };
  }

  if (rate.unit === 'fixed_amount' || rate.unit === 'per_transaction') {
    return {
      CDSV_APLY_DIVI: 100,
      CDSV_APLY_MLTP: 0,
      CDSV_APLY_FXAM: rate.value
    };
  }

  if (rate.unit === 'percentage') {
    let divi = 100;
    let mltp = rate.value;

    // 소수점 퍼센트 처리 (예: 0.5% → divi=1000, mltp=5)
    if (typeof mltp === 'number' && mltp % 1 !== 0) {
      const decimalPlaces = (mltp.toString().split('.')[1] || '').length;
      divi = Math.pow(10, decimalPlaces + 2);
      mltp = mltp * Math.pow(10, decimalPlaces);
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

/**
 * 시퀀스 번호를 엑셀 컬럼명으로 변환 (0→A, 25→Z, 26→AA, ...)
 * @param {number} sequenceNumber - 0부터 시작하는 시퀀스
 * @returns {string} 엑셀 컬럼명
 */
function getExcelColumnName(sequenceNumber) {
  if (sequenceNumber < 0) return 'A';
  if (sequenceNumber > 701) return 'ZZ';

  let result = '';
  let num = sequenceNumber;

  do {
    const remainder = num % 26;
    result = String.fromCharCode(65 + remainder) + result;
    num = Math.floor(num / 26) - 1;
  } while (num >= 0);

  return result;
}

/**
 * 서비스 매핑 로직 표현식 생성 (A|B|C 형태)
 * @param {number} seqNo - 총 매핑 항목 수
 * @returns {string} 로직 표현식
 */
function getServiceMappingLogicExpression(seqNo) {
  if (seqNo <= 1) return ' ';

  const aliases = [];
  for (let i = 0; i < seqNo - 1; i++) {
    aliases.push(getExcelColumnName(i));
  }
  return aliases.join('|');
}

/**
 * 서비스명에서 제한 조건 기본명 추출
 * @param {string} serviceName - 서비스명
 * @returns {string} 기본명
 */
function extractServiceName(serviceName) {
  if (serviceName && serviceName.includes('_')) {
    return serviceName.split('_')[0];
  }
  return serviceName;
}

/**
 * UTF-8 바이트 수 기준 문자열 자르기
 * @param {string} str - 원본 문자열
 * @param {number} maxBytes - 최대 바이트 수
 * @returns {string} 잘린 문자열
 */
function truncateToBytes(str, maxBytes) {
  const buf = Buffer.from(str, 'utf8');
  if (buf.byteLength <= maxBytes) return str;

  let trimmed = '';
  let byteLength = 0;
  for (let i = 0; i < str.length; i++) {
    const charBytes = Buffer.byteLength(str[i], 'utf8');
    if (byteLength + charBytes <= maxBytes) {
      trimmed += str[i];
      byteLength += charBytes;
    } else {
      break;
    }
  }

  logger.warn(
    `문자열 '${str}' (${buf.byteLength}바이트)을 ${maxBytes}바이트로 절삭: '${trimmed}'`
  );
  return trimmed;
}

// ── 테이블별 INSERT 함수 ────────────────────────────────────

/**
 * 1. CISU_CDGD_M — 카드상품 마스터 INSERT
 */
async function insertCardProduct(connection, product, date, time) {
  const customerType = determineCustomerType(product.product_name);
  const cardGrade = ORACLE_CODE_MAPS.CARD_GRADE_MAP[product.grade] || '10';
  const cardBrand = ORACLE_CODE_MAPS.CARD_BRAND_MAP[product.brand] || '1';

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
    v1: '701',
    v2: product.product_code,
    v3: product.product_name,
    v4: product.issue_date.replace(/-/g, ''),
    v5: product.expire_date ? product.expire_date.replace(/-/g, '') : '29991231',
    v6: customerType,
    v7: '01',
    v8: cardGrade,
    v9: cardBrand,
    v10: product.application_restriction ? 'Y' : 'N',
    v11: '552087',
    v12: '8101',
    v13: product.annual_fee.basic,
    v14: product.annual_fee.brand,
    v15: date,
    v16: time,
    v17: 'SYSTEM',
    v18: date,
    v19: time,
    v20: 'SYSTEM'
  });

  logger.info(`✓ 카드상품: ${product.product_name}`);
  return 1;
}

/**
 * 2. CGDS_CDSV_M — 카드서비스 마스터 INSERT
 */
async function insertServiceMaster(connection, service, date, time) {
  if (!SERVICE_ID_PATTERN.test(service.service_id)) {
    logger.warn(
      `서비스 삽입 건너뜀 (CDSV_NO 형식 오류): ${service.service_name} (${service.service_id})`
    );
    return 0;
  }

  const serviceClass =
    ORACLE_CODE_MAPS.SERVICE_CLASSIFICATION_MAP[service.service_classification] ||
    ORACLE_CODE_MAPS.SERVICE_CLASSIFICATION_MAP[service.service_classificaion] ||
    '01';

  // CDSV_NM 길이 제한 (UTF-8 100바이트)
  const serviceName = truncateToBytes(service.service_name, 100);

  // 매핑 로직 표현식 생성
  const merchantCount = (service.merchants?.length || 0) + (service.merchant_codes?.length || 0);

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
    s1: '701',
    s2: service.service_id,
    s3: serviceName,
    s4: service.description,
    s5: serviceClass,
    s6: ' ',
    s7: ' ',
    s8: serviceClass === '20' ? 'PT01' : ' ',
    s9: getServiceMappingLogicExpression(merchantCount),
    s10: ' ',
    s11: '0',
    s12: ' ',
    s13: 100,
    s14: 0,
    s15: '1',
    s16: 'N',
    s17: date,
    s18: time,
    s19: 'SYSTEM',
    s20: date,
    s21: time,
    s22: 'SYSTEM'
  });

  logger.info(`✓ 서비스: ${service.service_name}`);
  return 1;
}

/**
 * 3. CGDS_CSCL_B — 카드서비스 산출기준 INSERT
 */
async function insertServiceCalculation(connection, service, date, time) {
  if (!SERVICE_ID_PATTERN.test(service.service_id)) {
    logger.warn(
      `산출기준 삽입 건너뜀 (CDSV_NO 형식 오류): ${service.service_name} (${service.service_id})`
    );
    return 0;
  }

  const rateValues = calculateRateValues(service.rate);
  const minSpend = service.minimum_spend?.amount || 0;
  const maxSpend = service.maximum_spend?.amount || 999999999;
  const performanceAmount =
    ORACLE_CODE_MAPS.PERFORMANCE_AMOUNT_MAP[service.minimum_spend?.period] || '1';
  const performanceCount =
    ORACLE_CODE_MAPS.PERFORMANCE_COUNT_MAP[service.minimum_spend?.period] || '1';

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
    c1: '701',
    c2: service.service_id,
    c3: minSpend,
    c4: maxSpend,
    c5: 0,
    c6: 99999,
    c7: performanceAmount,
    c8: performanceCount,
    c9: 0,
    c10: 999999999,
    c11: 0,
    c12: 0,
    c13: 0,
    c14: 0,
    c15: 0,
    c16: rateValues.CDSV_APLY_DIVI,
    c17: rateValues.CDSV_APLY_MLTP,
    c18: rateValues.CDSV_APLY_FXAM,
    c19: '1',
    c20: 'N',
    c21: date,
    c22: time,
    c23: 'SYSTEM',
    c24: date,
    c25: time,
    c26: 'SYSTEM'
  });

  logger.info(
    `✓ 산출기준: ${service.service_id} (${rateValues.CDSV_APLY_MLTP}/${rateValues.CDSV_APLY_DIVI})`
  );
  return 1;
}

/**
 * 4. CGDS_CSLM_B — 카드서비스 제한기준 INSERT
 */
async function insertServiceLimit(connection, service, date, time) {
  if (!SERVICE_ID_PATTERN.test(service.service_id)) {
    logger.warn(
      `제한기준 삽입 건너뜀 (CDSV_NO 형식 오류): ${service.service_name} (${service.service_id})`
    );
    return 0;
  }

  const limits = service.service_limit || {};

  // SRVC_RSTRC_COND_NM 생성 + 길이 제한 (UTF-8 92바이트)
  const baseServiceName = extractServiceName(service.service_name);
  const restrictionConditionName = truncateToBytes(`${baseServiceName} 제한`, 92);

  await connection.execute(`
    INSERT INTO CGDS_CSLM_B (
      MBCM_NO, CDSV_NO, SRVC_RSTRC_COND_NM, ONE_TM_RSTRC_AMT,
      DAILY_RSTRC_TMCNT, DAILY_RSTRC_AMT, MTLY_RSTRC_TMCNT, MTLY_RSTRC_AMT,
      ANUL_RSTRC_TMCNT, ANUL_RSTRC_AMT, DEL_YN,
      FRST_REG_DT, FRST_REG_TIME, FRST_REG_USER_NO,
      LAST_PROCS_DT, LAST_PROCS_TIME, LAST_PROCS_USER_NO
    ) VALUES (
      :l1, :l2, :l3, :l4,
      :l5, :l6, :l7, :l8,
      :l9, :l10, :l11,
      :l12, :l13, :l14,
      :l15, :l16, :l17
    )
  `, {
    l1: '701',
    l2: service.service_id,
    l3: restrictionConditionName,
    l4: limits.transaction_limit_amount || 999999999,
    l5: limits.daily_limit_count || 99999,
    l6: limits.daily_limit_amount || 999999999,
    l7: limits.monthly_limit_count || 99999,
    l8: limits.monthly_limit_amount || 999999999,
    l9: limits.annual_limit_count || 99999,
    l10: limits.annual_limit_amount || 999999999,
    l11: 'N',
    l12: date,
    l13: time,
    l14: 'SYSTEM',
    l15: date,
    l16: time,
    l17: 'SYSTEM'
  });

  logger.info(`✓ 제한기준: ${service.service_id}`);
  return 1;
}

/**
 * 5. CGDS_CSTG_B — 카드서비스 대상기준 INSERT (가맹점명 + 가맹점코드)
 */
async function insertServiceTargets(connection, service, date, time) {
  if (!SERVICE_ID_PATTERN.test(service.service_id)) {
    logger.warn(
      `대상기준 삽입 건너뜀 (CDSV_NO 형식 오류): ${service.service_name} (${service.service_id})`
    );
    return 0;
  }

  let seqNo = 1;
  let insertCount = 0;

  // 5-1. 가맹점명 처리
  if (service.merchants && service.merchants.length > 0) {
    for (const merchant of service.merchants) {
      await connection.execute(`
        INSERT INTO CGDS_CSTG_B (
          MBCM_NO, CDSV_NO, CDSV_MPNG_SEQNO, SRVC_MPNG_GROUP_ALS,
          CDSV_MPNG_TYCD, SRVC_MPNG_OPS_CD, CDSV_MPNG_VAL_DVCD, CDSV_MPNG_VAL,
          SRVC_MPNG_DTTP_CD, SRVC_MPNG_RNG_STRT_VAL, SRVC_MPNG_RNG_END_VAL, DEL_YN,
          FRST_REG_DT, FRST_REG_TIME, FRST_REG_USER_NO,
          LAST_PROCS_DT, LAST_PROCS_TIME, LAST_PROCS_USER_NO
        ) VALUES (
          :t1, :t2, :t3, :t4, :t5, :t6, :t7, :t8, :t9, :t10, :t11, :t12,
          :t13, :t14, :t15, :t16, :t17, :t18
        )
      `, {
        t1: '701',
        t2: service.service_id,
        t3: seqNo,
        t4: getExcelColumnName(seqNo - 1),
        t5: '21',  // 가맹점
        t6: '07',  // EQUAL
        t7: '1',   // 가맹점명
        t8: merchant,
        t9: 'S',
        t10: 0,
        t11: 0,
        t12: 'N',
        t13: date,
        t14: time,
        t15: 'SYSTEM',
        t16: date,
        t17: time,
        t18: 'SYSTEM'
      });

      seqNo++;
      insertCount++;
      logger.info(`✓ 가맹점: ${merchant}`);
    }
  }

  // 5-2. 가맹점 코드 처리
  if (service.merchant_codes && service.merchant_codes.length > 0) {
    for (const merchantCode of service.merchant_codes) {
      await connection.execute(`
        INSERT INTO CGDS_CSTG_B (
          MBCM_NO, CDSV_NO, CDSV_MPNG_SEQNO, SRVC_MPNG_GROUP_ALS,
          CDSV_MPNG_TYCD, SRVC_MPNG_OPS_CD, CDSV_MPNG_VAL_DVCD, CDSV_MPNG_VAL,
          SRVC_MPNG_DTTP_CD, SRVC_MPNG_RNG_STRT_VAL, SRVC_MPNG_RNG_END_VAL, DEL_YN,
          FRST_REG_DT, FRST_REG_TIME, FRST_REG_USER_NO,
          LAST_PROCS_DT, LAST_PROCS_TIME, LAST_PROCS_USER_NO
        ) VALUES (
          :t1, :t2, :t3, :t4, :t5, :t6, :t7, :t8, :t9, :t10, :t11, :t12,
          :t13, :t14, :t15, :t16, :t17, :t18
        )
      `, {
        t1: '701',
        t2: service.service_id,
        t3: seqNo,
        t4: getExcelColumnName(seqNo - 1),
        t5: '09',  // 가맹점코드
        t6: '01',  // EQUAL
        t7: '2',   // 가맹점번호
        t8: merchantCode,
        t9: 'S',
        t10: 0,
        t11: 0,
        t12: 'N',
        t13: date,
        t14: time,
        t15: 'SYSTEM',
        t16: date,
        t17: time,
        t18: 'SYSTEM'
      });

      seqNo++;
      insertCount++;
      logger.info(`✓ 가맹점 코드: ${merchantCode}`);
    }
  }

  return insertCount;
}

/**
 * 6. CGDS_GDMP_L — 상품-서비스 매핑 INSERT
 */
async function insertProductServiceMapping(connection, product, service, date, time) {
  if (!SERVICE_ID_PATTERN.test(service.service_id)) {
    logger.warn(
      `매핑 삽입 건너뜀 (CDSV_NO 형식 오류): ${product.product_code} - ${service.service_id}`
    );
    return 0;
  }

  await connection.execute(`
    INSERT INTO CGDS_GDMP_L (
      MBCM_NO, CARD_GDS_CD, CDSV_NO, CDSV_DUP_APLY_DVCD, DEL_YN,
      FRST_REG_DT, FRST_REG_TIME, FRST_REG_USER_NO,
      LAST_PROCS_DT, LAST_PROCS_TIME, LAST_PROCS_USER_NO
    ) VALUES (
      :m1, :m2, :m3, :m4, :m5, :m6, :m7, :m8, :m9, :m10, :m11
    )
  `, {
    m1: '701',
    m2: product.product_code,
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

  logger.info(`✓ 매핑: ${product.product_code} - ${service.service_id}`);
  return 1;
}

// ── 메인 INSERT 오케스트레이터 ──────────────────────────────

/**
 * 단일 카드 상품 + 연결 서비스를 6개 테이블에 INSERT
 *
 * 트랜잭션 관리: autoCommit=false → 전체 성공 시 commit, 실패 시 rollback
 *
 * @param {Object} cardProduct - 카드 상품 객체
 * @param {Array} cardServices - 연결 서비스 배열
 * @param {string} fileName - 원본 파일명 (로깅용)
 * @returns {Promise<{ success: boolean, insertCount: number, fileName: string, error?: string }>}
 */
async function insertSingleCardProduct(cardProduct, cardServices, fileName) {
  let connection;
  const { date, time } = getCurrentDateTime();

  try {
    connection = await getConnection();
    connection.autoCommit = false;
    let insertCount = 0;

    logger.info(`🔄 처리 시작: ${fileName}`);

    // 1. 카드상품 마스터
    logger.info('📋 카드상품 데이터 삽입 중...');
    insertCount += await insertCardProduct(connection, cardProduct, date, time);

    // 2. 카드서비스 마스터
    logger.info('🎯 카드서비스 기본 데이터 삽입 중...');
    for (const service of cardServices) {
      insertCount += await insertServiceMaster(connection, service, date, time);
    }

    // 3. 카드서비스 산출기준
    logger.info('💰 서비스 산출기준 데이터 삽입 중...');
    for (const service of cardServices) {
      insertCount += await insertServiceCalculation(connection, service, date, time);
    }

    // 4. 카드서비스 제한기준
    logger.info('🚫 서비스 제한기준 데이터 삽입 중...');
    for (const service of cardServices) {
      insertCount += await insertServiceLimit(connection, service, date, time);
    }

    // 5. 카드서비스 대상기준 (가맹점 + 가맹점코드)
    logger.info('🏪 서비스 대상기준 데이터 삽입 중...');
    for (const service of cardServices) {
      insertCount += await insertServiceTargets(connection, service, date, time);
    }

    // 6. 상품-서비스 매핑
    logger.info('🔗 상품-서비스 매핑 데이터 삽입 중...');
    for (const service of cardServices) {
      insertCount += await insertProductServiceMapping(connection, cardProduct, service, date, time);
    }

    // 최종 검증: 예상 최소 INSERT 수 확인
    const expectedTables = 6;
    const expectedMinInserts = 1 + cardServices.length * (expectedTables - 1);

    if (insertCount < expectedMinInserts) {
      throw new Error(
        `삽입 레코드 수가 예상보다 적습니다. 예상: ${expectedMinInserts}개 이상, 실제: ${insertCount}개`
      );
    }

    await connection.commit();
    logger.info(`✅ 모든 테이블 삽입 완료: ${insertCount}개 레코드`);

    return { success: true, insertCount, fileName };

  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
        logger.info('🔄 롤백 완료');
      } catch (rbErr) {
        logger.error('롤백 실패:', rbErr.message);
      }
    }

    logger.error(`❌ ${fileName} 처리 중 오류:`, error.message);
    return { success: false, error: error.message, fileName };

  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        logger.error('연결 종료 실패:', err.message);
      }
    }
  }
}

// ── 메인 핸들러 ─────────────────────────────────────────────

/**
 * process_card_file 도구 핸들러
 *
 * 플로우: JSON 파일 읽기 → 사전 검증 → 6개 테이블 INSERT → 결과 반환
 *
 * @param {Object} args
 * @param {string} args.filePath - JSON 파일 경로
 * @returns {Promise<Object>} MCP 응답
 */
export async function processCardFile(args) {
  try {
    const { filePath } = args;

    if (!filePath || typeof filePath !== 'string') {
      return mcpError('filePath는 필수 문자열 파라미터입니다');
    }

    // 1. 파일 읽기
    if (!fs.existsSync(filePath)) {
      return mcpError(`파일을 찾을 수 없습니다: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    let jsonData;
    try {
      jsonData = JSON.parse(fileContent);
    } catch (parseErr) {
      return mcpError(`JSON 파싱 실패: ${parseErr.message}`);
    }

    const fileName = path.basename(filePath);

    // 2. 사전 검증
    const validation = preValidateForOracle(jsonData);
    if (!validation.valid) {
      return mcpError(
        `⛔ 검증 실패 (${fileName}):\n${validation.errors.join('\n')}`
      );
    }

    // 3. 상품 + 서비스 추출
    const cardProduct = jsonData.card_products[0];
    const cardServices = jsonData.card_services.filter(service =>
      cardProduct.card_service_mapping?.includes(service.service_id)
    );

    if (cardServices.length === 0) {
      return mcpError('카드 상품에 매핑된 서비스가 없습니다');
    }

    // 4. DB 삽입 실행
    const result = await insertSingleCardProduct(cardProduct, cardServices, fileName);

    if (result.success) {
      return mcpText(
        `✅ ${fileName}: 1개 카드 상품 및 ${result.insertCount}개 레코드 삽입 완료`
      );
    } else {
      return mcpError(`❌ ${fileName}: ${result.error}`);
    }

  } catch (error) {
    logger.error('process_card_file 실패:', error.message);
    return mcpError(`process_card_file 실패: ${error.message}`);
  }
}