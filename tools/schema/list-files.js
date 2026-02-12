// ============================================================
// tools/schema/list-files.js — 파일 목록 조회
//
// 원본: card-file-schema-manager/index.js (handleListFiles)
// ============================================================

import fs from 'fs/promises';
import path from 'path';
import { mcpText, mcpError, ensureDir } from '../../shared/utils.js';
import { DIR_MAP, ALL_DIR_TYPES } from '../../shared/constants.js';
import { createLogger } from '../../shared/logger.js';

const logger = createLogger('schema');

/**
 * 환경변수에서 디렉토리 경로 결정
 * .env에 절대 경로가 설정된 경우 우선 사용
 */
function getDirPath(dirType, basePath) {
  const envMap = {
    'card-data': process.env.CARD_DATA_DIR,
    'profitability': process.env.PROFITABILITY_DATA_DIR,
    'pdf': process.env.CARD_PDF_DIR,
    'schemas': process.env.SCHEMA_DIR,
  };

  if (envMap[dirType]) return envMap[dirType];
  const dirName = DIR_MAP[dirType] || dirType;
  return path.join(basePath, dirName);
}

/**
 * 특정 디렉토리의 파일 목록 조회
 */
async function listDir(dirType, basePath) {
  const dirPath = getDirPath(dirType, basePath);

  try {
    await ensureDir(dirPath);
    const files = await fs.readdir(dirPath);
    const jsonFiles = files.filter(f => f.endsWith('.json') || f.endsWith('.pdf'));

    // 파일 상세 정보
    const fileInfos = await Promise.all(
      jsonFiles.map(async (f) => {
        try {
          const stat = await fs.stat(path.join(dirPath, f));
          return {
            name: f,
            size: stat.size,
            modified: stat.mtime.toISOString().slice(0, 19)
          };
        } catch {
          return { name: f, size: 0, modified: 'unknown' };
        }
      })
    );

    return { type: dirType, path: dirPath, files: fileInfos };

  } catch (error) {
    return { type: dirType, path: dirPath, error: error.message, files: [] };
  }
}

/**
 * 파일 목록 조회
 *
 * @param {Object} args - { type: 'card-data' | 'profitability' | 'pdf' | 'schemas' | 'all' }
 * @param {Object} ctx - { basePath }
 * @returns {Promise<Object>} MCP 응답
 */
export async function listFiles(args, ctx) {
  try {
    const type = args?.type || 'all';
    const { basePath } = ctx;

    if (type === 'all') {
      const results = await Promise.all(
        ALL_DIR_TYPES.map(t => listDir(t, basePath))
      );

      let msg = '📂 전체 파일 목록:\n';
      for (const r of results) {
        msg += `\n[${r.type}] ${r.path}\n`;
        if (r.error) {
          msg += `  ⚠️ ${r.error}\n`;
        } else if (r.files.length === 0) {
          msg += `  (비어 있음)\n`;
        } else {
          r.files.forEach(f => {
            msg += `  • ${f.name} (${(f.size / 1024).toFixed(1)}KB, ${f.modified})\n`;
          });
        }
      }

      return mcpText(msg);
    }

    // 단일 타입 조회
    if (!ALL_DIR_TYPES.includes(type)) {
      return mcpError(`지원되지 않는 파일 타입: ${type}\n사용 가능: ${ALL_DIR_TYPES.join(', ')}, all`);
    }

    const result = await listDir(type, basePath);
    logger.info(`list_files (${type}): ${result.files.length}건`);
    return mcpText(JSON.stringify(result, null, 2));

  } catch (error) {
    logger.error('list_files 오류:', error);
    return mcpError(`파일 목록 조회 중 오류: ${error.message}`);
  }
}
