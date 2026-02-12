#!/usr/bin/env node
// ============================================================
// index.js — card-mcp-server v3.0.3 통합 진입점
//
// 6개 분리 MCP 서버 → 1개 통합 서버
//   1. benefit       (5 tools) — 카드 혜택 검색 (MySQL)
//   2. schema        (6 tools) — 카드 데이터 관리 (File I/O + AJV)
//   3. document      (2 tools) — 문서 생성 (Bedrock + Puppeteer)
//   4. profitability (1 tool)  — 수익성 분석
//   5. oracle        (2 tools) — Oracle DB 삽입
//   6. batch         (2 tools) — 혜택 시뮬레이션 배치 (REST API)
//
// 원본 서버:
//   card-benefit, card-file-schema-manager,
//   card-document-generator, card-profitability-analysis,
//   oracle-card-processor, card-batch-server
//
// v3.0.2 수정:
//   - dotenv: import 'dotenv/config' → 명시적 __dirname 기반 경로 지정
//     (Claude Desktop에서 cwd가 서버 루트가 아닐 수 있으므로)
// v3.0.3 수정:
//   - batch 도메인 추가 (혜택 시뮬레이션 배치 등록/결과 조회)
// ============================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// [v3.0.2] dotenv 명시적 경로 로드
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import { createLogger } from './shared/logger.js';

// ── 도메인 모듈 임포트 ──────────────────────────────────────

import {
  tools as benefitTools,
  handle as handleBenefit
} from './tools/benefit/index.js';

import {
  tools as schemaTools,
  handle as handleSchema
} from './tools/schema/index.js';

import {
  tools as documentTools,
  handle as handleDocument
} from './tools/document/index.js';

import {
  tools as profitabilityTools,
  handle as handleProfitability
} from './tools/profitability/index.js';

import {
  tools as oracleTools,
  handle as handleOracle
} from './tools/oracle/index.js';

// [v3.0.3] 혜택 시뮬레이션 배치
import {
  tools as batchTools,
  handle as handleBatch
} from './tools/batch/index.js';

const logger = createLogger('server');

// ── 도메인 레지스트리 ───────────────────────────────────────

/**
 * 도구명 → 도메인 핸들러 매핑 (자동 구성)
 *
 * 각 도메인의 tools 배열에서 도구명을 추출하여
 * { toolName → { domain, handler } } 맵을 구성
 */
const DOMAINS = [
  { name: 'benefit',       tools: benefitTools,       handler: handleBenefit },
  { name: 'schema',        tools: schemaTools,        handler: handleSchema },
  { name: 'document',      tools: documentTools,      handler: handleDocument },
  { name: 'profitability', tools: profitabilityTools,  handler: handleProfitability },
  { name: 'oracle',        tools: oracleTools,        handler: handleOracle },
  { name: 'batch',         tools: batchTools,         handler: handleBatch },       // [v3.0.3]
];

// 도구명 → 핸들러 라우팅 맵
const toolRouter = new Map();

// 전체 도구 스키마 목록 (ListTools 응답용)
const allTools = [];

for (const domain of DOMAINS) {
  for (const tool of domain.tools) {
    // 중복 도구명 검출
    if (toolRouter.has(tool.name)) {
      logger.warn(
        `도구명 중복 감지: '${tool.name}' — ` +
        `기존: ${toolRouter.get(tool.name).domain}, 신규: ${domain.name}`
      );
    }

    toolRouter.set(tool.name, {
      domain: domain.name,
      handler: domain.handler
    });

    allTools.push(tool);
  }
}

logger.info(
  `도메인 ${DOMAINS.length}개, 도구 ${allTools.length}개 등록 완료`
);

// ── MCP 서버 생성 ───────────────────────────────────────────

const server = new Server(
  {
    name: 'card-mcp-server',
    version: '3.0.3',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── ListTools 핸들러 ────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.info(`ListTools 요청: ${allTools.length}개 도구 반환`);
  return { tools: allTools };
});

// ── CallTool 핸들러 (통합 라우터) ────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const route = toolRouter.get(name);
  if (!route) {
    logger.error(`알 수 없는 도구: ${name}`);
    return {
      content: [{
        type: 'text',
        text: `❌ 알 수 없는 도구: ${name}\n` +
              `사용 가능한 도구: ${allTools.map(t => t.name).join(', ')}`
      }]
    };
  }

  logger.info(`[${route.domain}] ${name} 실행`);

  try {
    const result = await route.handler(name, args || {});
    return result;
  } catch (error) {
    logger.error(`[${route.domain}] ${name} 실행 중 예외:`, error.message);
    return {
      content: [{
        type: 'text',
        text: `❌ ${name} 실행 실패: ${error.message}`
      }]
    };
  }
});

// ── 에러 핸들링 ─────────────────────────────────────────────

server.onerror = (error) => {
  logger.error('MCP 서버 오류:', error);
};

process.on('unhandledRejection', (reason) => {
  logger.error('처리되지 않은 Promise 거부:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('처리되지 않은 예외:', error);
  process.exit(1);
});

// ── Graceful Shutdown ───────────────────────────────────────

async function shutdown(signal) {
  logger.info(`${signal} 수신, 서버 종료 중...`);

  try {
    // MySQL 풀 종료
    const { closePool: closeMysqlPool } = await import('./shared/db/mysql-pool.js');
    await closeMysqlPool();
    logger.info('MySQL 풀 종료 완료');
  } catch {
    // MySQL 미사용 시 무시
  }

  try {
    // Oracle 풀 종료
    const { closePool: closeOraclePool } = await import('./shared/db/oracle-pool.js');
    await closeOraclePool();
    logger.info('Oracle 풀 종료 완료');
  } catch {
    // Oracle 미사용 시 무시
  }

  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── 서버 시작 ───────────────────────────────────────────────

async function main() {
  logger.info('card-mcp-server v3.0.3 시작 중...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info(
    `card-mcp-server v3.0.3 실행 중 — ` +
    `${DOMAINS.length}개 도메인, ${allTools.length}개 도구`
  );
}

main().catch((error) => {
  logger.error('서버 시작 실패:', error);
  process.exit(1);
});