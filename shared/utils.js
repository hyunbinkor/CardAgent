// ============================================================
// shared/utils.js — 공통 유틸리티
//
// MCP 응답 포맷, JSON I/O, 문자열 헬퍼, 날짜/시간
// ============================================================

import fs from 'fs/promises';

// ── MCP 응답 포맷 ───────────────────────────────────────────

export function mcpText(text) {
  return { content: [{ type: 'text', text }] };
}

export function mcpError(text) {
  return mcpText(`❌ ${text}`);
}

// ── JSON 파일 I/O ───────────────────────────────────────────

export async function readJson(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

export async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 안전한 JSON 파싱 — 에러 시 MCP 응답용 메시지 반환
 * @returns {{ ok: true, data }} | {{ ok: false, response }}
 */
export function safeParse(str, errorPrefix = 'JSON 파싱 오류') {
  try {
    return { ok: true, data: JSON.parse(str) };
  } catch (error) {
    return {
      ok: false,
      response: mcpError(`${errorPrefix}: ${error.message}\n\n올바른 JSON 형식으로 수정 후 다시 시도해주세요.`)
    };
  }
}

// ── 문자열 헬퍼 ─────────────────────────────────────────────

export function getByteLength(str) {
  return Buffer.byteLength(str || '', 'utf8');
}

export function cleanCardName(cardName) {
  return cardName.replace(/[^가-힣a-zA-Z0-9]/g, '');
}

// ── 날짜/시간 ───────────────────────────────────────────────

/**
 * Oracle INSERT용 현재 날짜/시간 (YYYYMMDD / HHMMSS)
 */
export function getCurrentDateTime() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '').slice(0, 6);
  return { date, time };
}

// ── 디렉토리 보장 ───────────────────────────────────────────

export async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}
