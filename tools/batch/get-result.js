// ============================================================
// tools/batch/get-result.js — 혜택 시뮬레이션 배치 결과 조회
//
// 원본: card-batch-server/index.js → getBatchResult()
// 개선:
//   - 클래스 메서드 → 독립 함수
//   - throw McpError → mcpError() 래퍼 반환
//   - console.error → createLogger('batch')
// ============================================================

import axios from 'axios';
import { mcpText, mcpError } from '../../shared/utils.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('batch');

// ── 상수 (submit-job.js와 동일) ────────────────────────────

const API_BASE_URL = 'http://127.0.0.1:11080/finastcard2023/cardcorapi.json';
const API_TIMEOUT = 30000;

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

// ── 메인 핸들러 ─────────────────────────────────────────────

/**
 * 배치 작업 결과 조회
 *
 * @param {Object} args
 * @param {string} args.batch_id - 배치 작업 ID
 * @returns {Promise<Object>} MCP 응답
 */
export async function getBatchResult(args) {
  try {
    const { batch_id } = args;

    if (!batch_id || typeof batch_id !== 'string') {
      return mcpError('batch_id는 필수 문자열 파라미터입니다');
    }

    const requestBody = {
      systemHeader: {
        ...DEFAULT_SYSTEM_HEADER,
        RECV_SVC_CD: 'CGDSSA0304C',
        TMSG_WRTG_DT: new Date().toISOString().slice(0, 10).replace(/-/g, '')
      },
      body: {
        iCdsvAplyTaskInfoIqry: {
          btch_id: batch_id
        }
      }
    };

    logger.info(`배치 결과 조회: batch_id=${batch_id}`);

    const response = await axios.post(API_BASE_URL, JSON.stringify(requestBody), {
      headers: { 'Content-Type': 'application/json' },
      timeout: API_TIMEOUT
    });

    logger.info('배치 결과 조회 성공');

    return mcpText(
      `✅ 배치 결과 조회 완료:\n\n${JSON.stringify(response.data, null, 2)}`
    );

  } catch (error) {
    logger.error('배치 결과 조회 실패:', error.message);

    let detail = error.message;
    if (error.code === 'ECONNREFUSED') {
      detail += '\n\n🔧 혜택 시뮬레이션 API 서버가 실행 중인지 확인하세요.';
      detail += `\n   엔드포인트: ${API_BASE_URL}`;
    }

    return mcpError(`배치 결과 조회 실패: ${detail}`);
  }
}
