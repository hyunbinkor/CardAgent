// ============================================================
// tools/schema/normalization.js — 3단계 정규화 파이프라인
//
// 원본: card-file-schema-manager/lib/normalization.js
//
// Phase 1: 별칭 맵 → 정규형 치환 (즉시, 코드)
// Phase 2: 정규 풀 대조 (즉시, 코드)
// Phase 3: 미식별 값 → LLM 판단 (OpenRouter chat completions)
//
// [v3.0.1] load() 방어 + save() 디렉토리 자동 생성
// ============================================================

import path from 'path';
import fs from 'fs/promises';
import { readJson, writeJson } from '../../shared/utils.js';
import { createLLMClient } from '../../shared/llm/client.js';
import { LLM_PRESETS } from '../../shared/constants.js';
import { createLogger } from '../../shared/logger.js';
import { getDefaultAliasMap } from './alias-defaults.js';

const logger = createLogger('normalize');

// ============================================================
// AliasMapManager — 별칭 맵 로드/저장/조회
// ============================================================

export class AliasMapManager {
  /**
   * @param {string} mapPath - alias-map.json 경로 (환경변수 ALIAS_MAP_PATH)
   */
  constructor(mapPath) {
    this.mapPath = mapPath;
    this.map = null;
  }

  /** 별칭 맵 로드 (없으면 기본 맵 생성) */
  async load() {
    try {
      this.map = await readJson(this.mapPath);
      const counts = Object.keys(this.map).filter(k => k !== 'version' && k !== 'last_updated');
      logger.info(`별칭 맵 로드 완료 (v${this.map.version})`);
    } catch {
      logger.warn('별칭 맵 파일 없음 — 기본 맵으로 초기화');
      this.map = getDefaultAliasMap();
      // [v3.0.1] save 실패해도 메모리 맵으로 계속 동작
      try {
        await this.save();
        logger.info('기본 별칭 맵 파일 생성 완료');
      } catch (saveErr) {
        logger.warn(`기본 별칭 맵 저장 실패 (메모리 맵으로 계속 동작): ${saveErr.message}`);
      }
    }
  }

  /** 별칭 맵 저장 */
  async save() {
    this.map.last_updated = new Date().toISOString().slice(0, 10);
    // [v3.0.1] 디렉토리가 없으면 자동 생성
    const dir = path.dirname(this.mapPath);
    await fs.mkdir(dir, { recursive: true });
    await writeJson(this.mapPath, this.map);
    logger.info('별칭 맵 저장 완료');
  }

  /**
   * 값에 대한 정규형 조회
   * canonical-centered 구조: key=정규형, value=[정규형, 별칭1, 별칭2, ...]
   *
   * @param {string} field - 'brands' | 'categories' | 'merchants'
   * @param {string} value - 조회할 값
   * @returns {string|null} 정규형 또는 null
   */
  findCanonical(field, value) {
    const fieldMap = this.map?.[field];
    if (!fieldMap) return null;

    // 정규형 자체인지 확인 (O(1))
    if (fieldMap[value]) return value;

    // 별칭 배열 순회 (O(전체 별칭 수))
    for (const [canonical, aliases] of Object.entries(fieldMap)) {
      if (aliases.includes(value)) return canonical;
    }

    return null;
  }

  /**
   * 기존 정규형에 새 별칭 추가 (map_to_existing)
   */
  addAlias(field, canonical, alias) {
    if (!this.map[field]) this.map[field] = {};
    if (!this.map[field][canonical]) {
      this.map[field][canonical] = [canonical];
    }
    if (!this.map[field][canonical].includes(alias)) {
      this.map[field][canonical].push(alias);
      logger.debug(`별칭 추가: ${field}/${canonical} ← "${alias}"`);
    }
  }

  /**
   * 새 정규형 등록 (new_entry)
   */
  addCanonical(field, canonical, originalValue) {
    if (!this.map[field]) this.map[field] = {};
    if (!this.map[field][canonical]) {
      this.map[field][canonical] = [canonical];
      if (originalValue && originalValue !== canonical && !this.map[field][canonical].includes(originalValue)) {
        this.map[field][canonical].push(originalValue);
      }
      logger.debug(`정규형 등록: ${field}/"${canonical}"`);
    }
  }
}

// ============================================================
// LLM 분류 — OpenRouter chat completions
// ============================================================

async function classifyUnknownValues(unknowns, pools) {
  try {
    const client = createLLMClient(LLM_PRESETS.normalization, logger);

    const prompt = `다음은 카드 상품 데이터의 정규화되지 않은 값들입니다.
각 값에 대해 판단해주세요:

1. 기존 정규 목록 중 같은 의미의 항목이 있으면 → action: "map_to_existing", target: "기존 항목"
2. 기존 목록에 없는 완전히 새로운 항목이면 → action: "new_entry", target: "정규화된 표현"

미식별 값:
${JSON.stringify(unknowns, null, 2)}

기존 정규 목록:
- brands: ${JSON.stringify(pools.brands?.slice(0, 50) || [])}
- categories: ${JSON.stringify(pools.categories?.slice(0, 50) || [])}
- merchants: ${JSON.stringify(pools.merchants?.slice(0, 50) || [])}

반드시 JSON 배열로만 응답하세요. 각 항목에 field, value, action, target, reason 포함.
예시: [{"field":"brands","value":"스벅","action":"map_to_existing","target":"스타벅스","reason":"스벅은 스타벅스의 약칭"}]`;

    const result = await client.complete([
      { role: 'user', content: prompt }
    ]);

    // JSON 추출
    const jsonMatch = result.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn('LLM 응답에서 JSON 배열을 찾을 수 없음');
      return unknowns.map(u => ({
        ...u, action: 'new_entry', target: u.value, reason: 'LLM 응답 파싱 실패'
      }));
    }

    const decisions = JSON.parse(jsonMatch[0]);
    return decisions.map(d => ({
      field: d.field,
      value: d.value,
      action: d.action === 'map_to_existing' ? 'map_to_existing' : 'new_entry',
      target: d.target || d.value || '',
      reason: d.reason || ''
    }));

  } catch (error) {
    logger.error('LLM 정규화 판단 실패:', error.message);
    return unknowns.map(u => ({
      ...u, action: 'new_entry', target: u.value,
      reason: 'LLM 호출 실패 — 원본 값 그대로 등록'
    }));
  }
}

// ── 헬퍼: 데이터 내 특정 필드 값 일괄 치환 ─────────────────

function applyMapping(data, field, from, to) {
  if (field === 'brands') {
    data.card_products.forEach(p => {
      p.partnership_brands = p.partnership_brands.map(b => b === from ? to : b);
    });
  } else if (field === 'categories') {
    data.card_services.forEach(s => {
      if (s.service_category === from) s.service_category = to;
    });
  } else if (field === 'merchants') {
    data.card_services.forEach(s => {
      if (s.merchants && Array.isArray(s.merchants)) {
        s.merchants = s.merchants.map(m => m === from ? to : m);
      }
    });
  }
}

// ============================================================
// 3단계 정규화 파이프라인 (메인 export)
// ============================================================

/**
 * @param {Object} data - 카드 데이터 (직접 변경됨)
 * @param {AliasMapManager} alias - 별칭 맵 관리자
 * @param {string} poolPath - canonical-pools.json 경로
 * @returns {Promise<{data: Object, log: Object}>}
 */
export async function normalizeCardData(data, alias, poolPath) {
  const log = { phase1: [], phase3_decisions: [] };
  const unresolved = { brands: [], categories: [], merchants: [] };

  // === Phase 1: 별칭 맵 → 정규형 치환 ===
  if (alias.map) {
    // partnership_brands
    data.card_products.forEach(p => {
      p.partnership_brands = p.partnership_brands.map(b => {
        const c = alias.findCanonical('brands', b);
        if (c) {
          if (c !== b) log.phase1.push({ field: 'brands', from: b, to: c });
          return c;
        }
        unresolved.brands.push(b);
        return b;
      });
    });

    // service_category + merchants
    data.card_services.forEach(s => {
      const cc = alias.findCanonical('categories', s.service_category);
      if (cc) {
        if (cc !== s.service_category) {
          log.phase1.push({ field: 'categories', from: s.service_category, to: cc });
          s.service_category = cc;
        }
      } else {
        unresolved.categories.push(s.service_category);
      }

      if (s.merchants && Array.isArray(s.merchants)) {
        s.merchants = s.merchants.map(m => {
          const mc = alias.findCanonical('merchants', m);
          if (mc) {
            if (mc !== m) log.phase1.push({ field: 'merchants', from: m, to: mc });
            return mc;
          }
          unresolved.merchants.push(m);
          return m;
        });
      }
    });
  }

  // === Phase 2: 정규 풀 대조 (Phase 1 미해결 값만) ===
  let pools;
  try {
    pools = await readJson(poolPath);
  } catch {
    logger.warn('정규 풀 파일 없음 — Phase 2 스킵, Phase 3에서 LLM으로 판단합니다.');
    pools = { brands: [], categories: [], merchants: [] };
  }

  const unknowns = [];
  for (const [field, values] of Object.entries(unresolved)) {
    const pool = pools[field] || [];
    values.forEach(v => {
      if (pool.length === 0 || !pool.includes(v)) {
        unknowns.push({ field, value: v });
      }
    });
  }

  // 중복 제거
  const uniqueUnknowns = [...new Map(
    unknowns.map(u => [`${u.field}:${u.value}`, u])
  ).values()];

  // === Phase 3: 미식별 값 → LLM 판단 ===
  if (uniqueUnknowns.length > 0) {
    logger.info(`미식별 값 ${uniqueUnknowns.length}건 발견 — LLM 정규화 판단 요청`);
    const decisions = await classifyUnknownValues(uniqueUnknowns, pools);
    log.phase3_decisions = decisions;

    let updated = false;
    for (const d of decisions) {
      if (d.action === 'map_to_existing' && d.target) {
        applyMapping(data, d.field, d.value, d.target);
        alias.addAlias(d.field, d.target, d.value);
        updated = true;
      } else if (d.action === 'new_entry' && d.target) {
        alias.addCanonical(d.field, d.target, d.value);
        if (d.value !== d.target) applyMapping(data, d.field, d.value, d.target);
        updated = true;
      }
    }
    if (updated) await alias.save();
  }

  return { data, log };
}

// ============================================================
// 정규화 로그 → 사람이 읽을 수 있는 메시지
// ============================================================

export function formatNormalizationLog(log) {
  let msg = '';

  if (log.phase1.length > 0) {
    msg += '\n\n🔄 자동 정규화 (별칭 맵):';
    const unique = [...new Map(log.phase1.map(l => [`${l.from}→${l.to}`, l])).values()];
    unique.forEach(l => { msg += `\n  • ${l.field}: "${l.from}" → "${l.to}"`; });
  }

  if (log.phase3_decisions && log.phase3_decisions.length > 0) {
    const mapped = log.phase3_decisions.filter(d => d.action === 'map_to_existing');
    const newEntries = log.phase3_decisions.filter(d => d.action === 'new_entry');

    if (mapped.length > 0) {
      msg += '\n\n🤖 AI 판단 정규화:';
      mapped.forEach(d => { msg += `\n  • ${d.field}: "${d.value}" → "${d.target}" (${d.reason})`; });
    }
    if (newEntries.length > 0) {
      msg += '\n\n🆕 새 항목 등록:';
      newEntries.forEach(d => { msg += `\n  • ${d.field}: "${d.target}" (${d.reason})`; });
    }
  }

  return msg;
}