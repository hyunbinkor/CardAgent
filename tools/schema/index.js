// ============================================================
// tools/schema/index.js — 카드 데이터 관리 도메인 (6개 도구)
//
// 도구: save_card_data, save_profitability_analysis, list_files,
//       get_card_schema, validate_service_ids, get_oracle_requirements
//
// 초기화: AJV 스키마 컴파일 + 별칭 맵 로드
// ============================================================

import path from 'path';
import Ajv from 'ajv';
import { createLogger } from '../../shared/logger.js';
import { mcpText, mcpError } from '../../shared/utils.js';
import { isValidServiceId, findDuplicateIds } from '../../shared/validators.js';
import {
  SERVICE_ID_PATTERN_STR,
  PRODUCT_CODE_PATTERN_STR,
  ALLOWED_ISSUERS,
  LIMITS
} from '../../shared/constants.js';
import { buildCardSchema, getOracleRequirementsText } from './schema-builder.js';
import { AliasMapManager } from './normalization.js';
import { saveCardData } from './save-card-data.js';
import { saveProfitabilityAnalysis } from './save-profitability.js';
import { listFiles } from './list-files.js';

const logger = createLogger('schema');

// ── 초기화: AJV + 별칭 맵 ──────────────────────────────────

const ajv = new Ajv({ allErrors: true });
const cardSchema = buildCardSchema();
ajv.addSchema(cardSchema, 'card-schema');
const ajvValidate = ajv.getSchema('card-schema');

// 환경변수에서 경로 참조
const basePath = process.env.ASSETS_PATH || 'C:/Projects/Opering_Demo/asset';
const aliasMapPath = process.env.ALIAS_MAP_PATH || path.join(basePath, 'schemas', 'alias-map.json');
const poolPath = process.env.CANONICAL_POOLS_PATH || path.join(basePath, 'schemas', 'canonical-pools.json');

const alias = new AliasMapManager(aliasMapPath);

// 별칭 맵 비동기 로드 (서버 시작 시 자동)
let aliasLoaded = false;
async function ensureAliasLoaded() {
  if (!aliasLoaded) {
    await alias.load();
    aliasLoaded = true;
  }
}

// 공유 컨텍스트 (핸들러에 전달)
const ctx = { ajvValidate, alias, poolPath, basePath };

// ── 도구 스키마 정의 ────────────────────────────────────────

export const tools = [
  {
    name: 'save_card_data',
    description: 'Oracle DB 호환 카드 데이터를 검증·정규화 후 JSON 파일로 저장합니다',
    inputSchema: {
      type: 'object',
      properties: {
        cardData: { type: 'string', description: '카드 데이터 JSON 문자열' },
        cardName: { type: 'string', description: '카드명 (파일명에 사용)' },
        version: { type: 'string', description: '버전 (예: v1, v2)', default: 'v1' }
      },
      required: ['cardData', 'cardName']
    }
  },
  {
    name: 'save_profitability_analysis',
    description: '수익성 분석 결과를 JSON 파일로 저장합니다',
    inputSchema: {
      type: 'object',
      properties: {
        analysisData: { type: 'string', description: '분석 결과 JSON 문자열' },
        cardName: { type: 'string', description: '카드명' },
        date: { type: 'string', description: '분석 날짜 (YYYYMMDD)', default: null }
      },
      required: ['analysisData', 'cardName']
    }
  },
  {
    name: 'list_files',
    description: '지정된 타입의 파일 목록을 조회합니다',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['pdf', 'card-data', 'profitability', 'schemas', 'all'],
          description: '파일 타입',
          default: 'all'
        }
      }
    }
  },
  {
    name: 'get_card_schema',
    description: 'Oracle DB 호환 카드 데이터 스키마를 반환합니다',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'validate_service_ids',
    description: '서비스 ID 형식 및 중복을 검증합니다 (알파벳 3자리 + 숫자 5자리, 중복 불가)',
    inputSchema: {
      type: 'object',
      properties: {
        serviceIds: {
          type: 'array',
          items: { type: 'string' },
          description: '검증할 서비스 ID 목록'
        }
      },
      required: ['serviceIds']
    }
  },
  {
    name: 'get_oracle_requirements',
    description: 'Oracle DB 삽입을 위한 필수 요구사항을 반환합니다',
    inputSchema: { type: 'object', properties: {} }
  }
];

// ── 핸들러 ──────────────────────────────────────────────────

async function handleGetCardSchema() {
  return mcpText(JSON.stringify(cardSchema, null, 2));
}

function handleValidateServiceIds(args) {
  const ids = args.serviceIds || [];
  if (ids.length === 0) {
    return mcpError('serviceIds가 비어 있습니다.');
  }

  const errors = [];

  // 형식 검증
  ids.forEach((id, i) => {
    if (!isValidServiceId(id)) {
      errors.push(`[${i + 1}] "${id}" — 형식 불일치 (필요: 알파벳 대문자 3자리 + 숫자 5자리, 예: SHN00001)`);
    }
  });

  // 중복 검출
  const duplicates = findDuplicateIds(ids);
  duplicates.forEach(d => {
    errors.push(`"${d.id}" — ${d.firstIndex}번째와 ${d.dupIndex}번째에서 중복`);
  });

  if (errors.length > 0) {
    return mcpText(`❌ 서비스 ID 검증 실패 (${errors.length}건):\n${errors.map(e => `  • ${e}`).join('\n')}`);
  }

  return mcpText(`✅ ${ids.length}개 서비스 ID 모두 형식 및 중복 검증 통과`);
}

function handleGetOracleRequirements() {
  return mcpText(getOracleRequirementsText());
}

// ── 라우터 ──────────────────────────────────────────────────

export async function handle(name, args) {
  logger.info(`${name} 호출`);

  // 별칭 맵이 필요한 도구는 로드 보장
  if (name === 'save_card_data') {
    await ensureAliasLoaded();
  }

  switch (name) {
    case 'save_card_data':
      return saveCardData(args, ctx);
    case 'save_profitability_analysis':
      return saveProfitabilityAnalysis(args, ctx);
    case 'list_files':
      return listFiles(args, ctx);
    case 'get_card_schema':
      return handleGetCardSchema();
    case 'validate_service_ids':
      return handleValidateServiceIds(args);
    case 'get_oracle_requirements':
      return handleGetOracleRequirements();
    default:
      return mcpError(`알 수 없는 도구: ${name}`);
  }
}
