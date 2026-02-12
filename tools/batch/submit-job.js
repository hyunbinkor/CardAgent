// ============================================================
// tools/batch/submit-job.js — 혜택 시뮬레이션 배치 등록
//
// 원본: card-batch-server/index.js → submitBatchJob()
// 개선:
//   - 클래스 메서드 → 독립 함수
//   - throw McpError → mcpError() 래퍼 반환
//   - console.error → createLogger('batch')
// ============================================================

import axios from 'axios';
import { mcpText, mcpError } from '../../shared/utils.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('batch');

// ── 상수 ────────────────────────────────────────────────────

const API_BASE_URL = 'http://127.0.0.1:11080/finastcard2023/cardcorapi.json';
const API_TIMEOUT = 30000;

// 기본 systemHeader 템플릿
const DEFAULT_SYSTEM_HEADER = {
  STD_TMSG_LEN: null,
  TMSG_WRTG_DT: null,
  STD_TMSG_SEQ_NO: null,
  IPV_ADR: '10.65.70.150',
  RECV_SVC_CD: null,
  TMSG_RSPS_DTM: null,
  PROC_RSLT_DV_CD: null,
  RSLT_MSG: null,
  DSBL_SYS_CD: null,
  STD_TMSG_ERR_CD: null,
  LNGG_DV_CD: 'EN',
  LOGIN_MD5: null,
  COMP_ID: '090',
  EXT_FIELD0: null,
  USER_ID: '73560',
  USER_END_DD: null,
  BLNG_BR_NO: '0001',
  MBR_BR_DIV_CD: null,
  DEPT_CD: '0001',
  EXT_FIELD1: null,
  AC_DAY: null,
  EMP_NO: null,
  OFLV_CD: null,
  SCRN_ID: '',
  RESP_SVC_CD: null,
  ENV_TYPE: null,
  INTERFACE_ID: null,
  TOKEN_DATA: null,
  EXEC_FLAG: null,
  GLOB_ID: null,
  PGRS_NO: null,
  CHNL_TP_CD: null,
  FST_TRMS_SYS_CD: null,
  FEP_MAP_ORG_NM: null,
  REQ_RES_DVCD: null,
  SYN_DVCD: null,
  SIMULATION_YN: null,
  TMR_REQ_RES_DVCD: null,
  TMR_PROC_STAT_CD: null,
  EXT_FIELD: null
};

// 기본 회원 데이터
const DEFAULT_MEMBER_DATA = {
  mbcm_no: '701',
  memb_no: '7010001P100217',
  card_no: '5428791002189288',
  unq_card_no: '5428791002189288',
  card_gds_dvcd: '01',
  card_sale_gds_cd: '2110',
  uz_dt: '20250115',
  base_irate: '0',
  rslts_amt: '1000000',
  rslts_ccnt: '50',
  rslts_ledgr_chk_yn: 'N'
};

// 데모용 결제내역 (하드코딩)
const DEMO_SALE_DATA = [
  {
    mbcm_no: '701', memb_no: '7010001P100060', sale_no: 33264319,
    dmnd_setl_no: '001', cstno: '0001P', sale_dt: '20250122',
    card_gds_cd: 'S002', card_sale_gds_cd: '1110', chcr_yn: 'Y',
    merc_no: '701333456789028', card_idvd_corp_dvcd: '1', tx_cd: ' ',
    procs_time: '194756', buy_dt: '20250122', buy_time: '194756',
    dmfr_uz_dvcd: '1', card_gds_alnc_cd: ' ', uz_dt: '20250122',
    uz_amt: '189000', uz_fxamt: ' ', acpl_card_curn_cd: 'KRW',
    acpl_curn_uz_amt: '300000', card_tax_amt: '0', card_sfe: '0',
    merc_nat_cd: '410', merc_nm: '이마트', merc_lctn_nm: ' ',
    merc_tpbs_dvcd: ' ', merc_tpbs_cd: '5411', merc_fert: '0',
    merc_fee: 0, merc_ennm: ' ', aprv_dt: '20250122',
    card_no: '54287900009288', aprv_dtl_no: '83307676', aprv_no: '833076',
    aprv_time: '194756', sale_amt: '189000', sale_fxamt: ' ',
    ins_mcnt: '0', frst_setl_dt: '20250122'
  },
  {
    mbcm_no: '701', memb_no: '7010001P100060', sale_no: 94164654,
    dmnd_setl_no: '001', cstno: '0001P', sale_dt: '20250131',
    card_gds_cd: 'S002', card_sale_gds_cd: '1110', chcr_yn: 'Y',
    merc_no: '701333456789028', card_idvd_corp_dvcd: '1', tx_cd: ' ',
    procs_time: '102259', buy_dt: '20250131', buy_time: '102259',
    dmfr_uz_dvcd: '1', card_gds_alnc_cd: ' ', uz_dt: '20250131',
    uz_amt: '6960', uz_fxamt: ' ', acpl_card_curn_cd: 'KRW',
    acpl_curn_uz_amt: '11043', card_tax_amt: '0', card_sfe: '0',
    merc_nat_cd: '410', merc_nm: 'CU', merc_lctn_nm: ' ',
    merc_tpbs_dvcd: ' ', merc_tpbs_cd: '5411', merc_fert: '0',
    merc_fee: 0, merc_ennm: ' ', aprv_dt: '20250131',
    card_no: '54287900009288', aprv_dtl_no: '53457311', aprv_no: '534573',
    aprv_time: '102259', sale_amt: '6960', sale_fxamt: ' ',
    ins_mcnt: '0', frst_setl_dt: '20250131'
  },
  {
    mbcm_no: '701', memb_no: '7010001P100060', sale_no: 38152109,
    dmnd_setl_no: '001', cstno: '0001P', sale_dt: '20250213',
    card_gds_cd: 'S002', card_sale_gds_cd: '1110', chcr_yn: 'Y',
    merc_no: '701333456789028', card_idvd_corp_dvcd: '1', tx_cd: ' ',
    procs_time: '093459', buy_dt: '20250213', buy_time: '093459',
    dmfr_uz_dvcd: '1', card_gds_alnc_cd: ' ', uz_dt: '20250213',
    uz_amt: '7290', uz_fxamt: ' ', acpl_card_curn_cd: 'KRW',
    acpl_curn_uz_amt: '11578', card_tax_amt: '0', card_sfe: '0',
    merc_nat_cd: '410', merc_nm: 'CU', merc_lctn_nm: ' ',
    merc_tpbs_dvcd: ' ', merc_tpbs_cd: '5411', merc_fert: '0',
    merc_fee: 0, merc_ennm: ' ', aprv_dt: '20250213',
    card_no: '54287900009288', aprv_dtl_no: '64587061', aprv_no: '645870',
    aprv_time: '093459', sale_amt: '7290', sale_fxamt: ' ',
    ins_mcnt: '0', frst_setl_dt: '20250213'
  },
  {
    mbcm_no: '701', memb_no: '7010001P100060', sale_no: 87294596,
    dmnd_setl_no: '001', cstno: '0001P', sale_dt: '20250214',
    card_gds_cd: 'S002', card_sale_gds_cd: '1110', chcr_yn: 'Y',
    merc_no: '701333456789028', card_idvd_corp_dvcd: '1', tx_cd: ' ',
    procs_time: '130823', buy_dt: '20250214', buy_time: '130823',
    dmfr_uz_dvcd: '1', card_gds_alnc_cd: ' ', uz_dt: '20250214',
    uz_amt: '63000', uz_fxamt: ' ', acpl_card_curn_cd: 'KRW',
    acpl_curn_uz_amt: '100000', card_tax_amt: '0', card_sfe: '0',
    merc_nat_cd: '410', merc_nm: '11번가', merc_lctn_nm: ' ',
    merc_tpbs_dvcd: ' ', merc_tpbs_cd: '5964', merc_fert: '0',
    merc_fee: 0, merc_ennm: ' ', aprv_dt: '20250214',
    card_no: '54287900009288', aprv_dtl_no: '23918389', aprv_no: '239183',
    aprv_time: '130823', sale_amt: '63000', sale_fxamt: ' ',
    ins_mcnt: '0', frst_setl_dt: '20250214'
  },
  {
    mbcm_no: '701', memb_no: '7010001P100060', sale_no: 32430298,
    dmnd_setl_no: '001', cstno: '0001P', sale_dt: '20250214',
    card_gds_cd: 'S002', card_sale_gds_cd: '1110', chcr_yn: 'Y',
    merc_no: '701333456789028', card_idvd_corp_dvcd: '1', tx_cd: ' ',
    procs_time: '204909', buy_dt: '20250214', buy_time: '204909',
    dmfr_uz_dvcd: '1', card_gds_alnc_cd: ' ', uz_dt: '20250214',
    uz_amt: '15000', uz_fxamt: ' ', acpl_card_curn_cd: 'KRW',
    acpl_curn_uz_amt: '15131', card_tax_amt: '0', card_sfe: '0',
    merc_nat_cd: '410', merc_nm: '스타벅스', merc_lctn_nm: ' ',
    merc_tpbs_dvcd: ' ', merc_tpbs_cd: '5814', merc_fert: '0',
    merc_fee: 0, merc_ennm: ' ', aprv_dt: '20250214',
    card_no: '54287900009288', aprv_dtl_no: '87688258', aprv_no: '876882',
    aprv_time: '204909', sale_amt: '15000', sale_fxamt: ' ',
    ins_mcnt: '0', frst_setl_dt: '20250214'
  },
  {
    mbcm_no: '701', memb_no: '7010001P100060', sale_no: 54266213,
    dmnd_setl_no: '001', cstno: '0001P', sale_dt: '20250215',
    card_gds_cd: 'S002', card_sale_gds_cd: '1110', chcr_yn: 'Y',
    merc_no: '701333456789028', card_idvd_corp_dvcd: '1', tx_cd: ' ',
    procs_time: '153123', buy_dt: '20250215', buy_time: '153123',
    dmfr_uz_dvcd: '1', card_gds_alnc_cd: ' ', uz_dt: '20250215',
    uz_amt: '63000', uz_fxamt: ' ', acpl_card_curn_cd: 'KRW',
    acpl_curn_uz_amt: '100000', card_tax_amt: '0', card_sfe: '0',
    merc_nat_cd: '410', merc_nm: '네이버페이', merc_lctn_nm: ' ',
    merc_tpbs_dvcd: ' ', merc_tpbs_cd: '5964', merc_fert: '0',
    merc_fee: 0, merc_ennm: ' ', aprv_dt: '20250215',
    card_no: '54287900009288', aprv_dtl_no: '68787495', aprv_no: '687874',
    aprv_time: '153123', sale_amt: '63000', sale_fxamt: ' ',
    ins_mcnt: '0', frst_setl_dt: '20250215'
  },
  {
    mbcm_no: '701', memb_no: '7010001P100060', sale_no: 84525970,
    dmnd_setl_no: '001', cstno: '0001P', sale_dt: '20250216',
    card_gds_cd: 'S002', card_sale_gds_cd: '1110', chcr_yn: 'Y',
    merc_no: '701333456789028', card_idvd_corp_dvcd: '1', tx_cd: ' ',
    procs_time: '194826', buy_dt: '20250216', buy_time: '194826',
    dmfr_uz_dvcd: '1', card_gds_alnc_cd: ' ', uz_dt: '20250216',
    uz_amt: '24270', uz_fxamt: ' ', acpl_card_curn_cd: 'KRW',
    acpl_curn_uz_amt: '38529', card_tax_amt: '0', card_sfe: '0',
    merc_nat_cd: '410', merc_nm: '놀부부대찌개', merc_lctn_nm: ' ',
    merc_tpbs_dvcd: ' ', merc_tpbs_cd: '5812', merc_fert: '0',
    merc_fee: 0, merc_ennm: ' ', aprv_dt: '20250216',
    card_no: '54287900009288', aprv_dtl_no: '73542798', aprv_no: '735427',
    aprv_time: '194826', sale_amt: '24270', sale_fxamt: ' ',
    ins_mcnt: '0', frst_setl_dt: '20250216'
  },
  {
    mbcm_no: '701', memb_no: '7010001P100060', sale_no: 66975880,
    dmnd_setl_no: '001', cstno: '0001P', sale_dt: '20250217',
    card_gds_cd: 'S002', card_sale_gds_cd: '1110', chcr_yn: 'Y',
    merc_no: '701333456789028', card_idvd_corp_dvcd: '1', tx_cd: ' ',
    procs_time: '130502', buy_dt: '20250217', buy_time: '130502',
    dmfr_uz_dvcd: '1', card_gds_alnc_cd: ' ', uz_dt: '20250217',
    uz_amt: '51290', uz_fxamt: ' ', acpl_card_curn_cd: 'KRW',
    acpl_curn_uz_amt: '81408', card_tax_amt: '0', card_sfe: '0',
    merc_nat_cd: '410', merc_nm: 'SKT', merc_lctn_nm: ' ',
    merc_tpbs_dvcd: ' ', merc_tpbs_cd: '4814', merc_fert: '0',
    merc_fee: 0, merc_ennm: ' ', aprv_dt: '20250217',
    card_no: '54287900009288', aprv_dtl_no: '22753854', aprv_no: '227538',
    aprv_time: '130502', sale_amt: '51290', sale_fxamt: ' ',
    ins_mcnt: '0', frst_setl_dt: '20250217'
  },
  {
    mbcm_no: '701', memb_no: '7010001P100060', sale_no: 33022166,
    dmnd_setl_no: '001', cstno: '0001P', sale_dt: '20250217',
    card_gds_cd: 'S002', card_sale_gds_cd: '1110', chcr_yn: 'Y',
    merc_no: '701333456789028', card_idvd_corp_dvcd: '1', tx_cd: ' ',
    procs_time: '191129', buy_dt: '20250217', buy_time: '191129',
    dmfr_uz_dvcd: '1', card_gds_alnc_cd: ' ', uz_dt: '20250217',
    uz_amt: '5500', uz_fxamt: ' ', acpl_card_curn_cd: 'KRW',
    acpl_curn_uz_amt: '87379', card_tax_amt: '0', card_sfe: '0',
    merc_nat_cd: '410', merc_nm: '이디야커피', merc_lctn_nm: ' ',
    merc_tpbs_dvcd: ' ', merc_tpbs_cd: '5814', merc_fert: '0',
    merc_fee: 0, merc_ennm: ' ', aprv_dt: '20250217',
    card_no: '54287900009288', aprv_dtl_no: '64052228', aprv_no: '640522',
    aprv_time: '191129', sale_amt: '5500', sale_fxamt: ' ',
    ins_mcnt: '0', frst_setl_dt: '20250217'
  }
];

// ── 유틸리티 ────────────────────────────────────────────────

/**
 * 현재 날짜를 YYYYMMDD 형식으로 반환
 * @returns {string}
 */
function getTodayString() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * systemHeader 생성
 * @param {string} svcCd - RECV_SVC_CD
 * @returns {Object}
 */
function buildSystemHeader(svcCd) {
  return {
    ...DEFAULT_SYSTEM_HEADER,
    RECV_SVC_CD: svcCd,
    TMSG_WRTG_DT: getTodayString()
  };
}

// ── 메인 핸들러 ─────────────────────────────────────────────

/**
 * 혜택 시뮬레이션 배치 작업 등록
 *
 * 플로우:
 *   1. card_gds_cd를 회원 데이터에 주입
 *   2. 데모 결제내역 + 회원 데이터로 요청 본문 구성
 *   3. POST API 호출
 *   4. 응답 반환
 *
 * @param {Object} args
 * @param {string} args.card_gds_cd - 카드 상품 코드
 * @returns {Promise<Object>} MCP 응답
 */
export async function submitBatchJob(args) {
  try {
    const { card_gds_cd } = args;

    if (!card_gds_cd || typeof card_gds_cd !== 'string') {
      return mcpError('card_gds_cd는 필수 문자열 파라미터입니다');
    }

    // 회원 데이터에 card_gds_cd 주입
    const memberData = {
      ...DEFAULT_MEMBER_DATA,
      card_gds_cd
    };

    const requestBody = {
      systemHeader: buildSystemHeader('CGDSSA0303C'),
      body: {
        cdsvAplyCondInfoDto_cnt: 1,
        cdsvAplyCondInfoDto: [memberData],
        cdsvAplySaleInfoDto_cnt: DEMO_SALE_DATA.length,
        cdsvAplySaleInfoDto: DEMO_SALE_DATA
      }
    };

    logger.info(`배치 등록 요청: card_gds_cd=${card_gds_cd}, 결제내역 ${DEMO_SALE_DATA.length}건`);

    const response = await axios.post(API_BASE_URL, JSON.stringify(requestBody), {
      headers: { 'Content-Type': 'application/json' },
      timeout: API_TIMEOUT
    });

    logger.info('배치 등록 성공');

    return mcpText(
      `✅ 배치 작업이 성공적으로 등록되었습니다.\n\n` +
      `응답 데이터:\n${JSON.stringify(response.data, null, 2)}`
    );

  } catch (error) {
    logger.error('배치 등록 실패:', error.message);

    // 네트워크 오류 상세 안내
    let detail = error.message;
    if (error.code === 'ECONNREFUSED') {
      detail += '\n\n🔧 혜택 시뮬레이션 API 서버가 실행 중인지 확인하세요.';
      detail += `\n   엔드포인트: ${API_BASE_URL}`;
    }

    return mcpError(`배치 작업 등록 실패: ${detail}`);
  }
}
