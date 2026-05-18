// ============================================================
// tools/document/presentation.js — 카드 사업 기획서 생성
//
// 원본: presentation_creation.js → generateCardPresentation()
// 개선:
//   - BedrockModel 클래스 → 공유 LLMClient (OpenRouter) 사용
//   - 하드코딩 경로 → process.env.ASSETS_PATH
//   - console.error → createLogger('document')
//   - McpError throw → mcpError() 래퍼 반환
//
// v3.0.2 수정:
//   - 이중 출력: 마크다운(채팅 표시용) + HTML(PDF 변환용)
//   - HTML → Puppeteer PDF 변환 후 파일 저장
//   - MCP 응답: 마크다운 본문 + PDF 경로 안내
// ============================================================

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { createLLMClient } from '../../shared/llm/client.js';
import { LLM_PRESETS } from '../../shared/constants.js';
import { mcpText, mcpError } from '../../shared/utils.js';
import { createLogger } from '../../shared/logger.js';
import { getPresentationPrompt } from './presentation-prompt.js';

const logger = createLogger('document');

// ── 유틸리티 ────────────────────────────────────────────────

/**
 * 파일 존재 여부 검증
 * @param {string} filePath - 검증할 파일 경로
 * @throws {Error} 파일이 없을 경우
 */
async function validateFilePath(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`);
  }
}

/**
 * JSON 파일 읽기 + 유효성 검증
 * @param {Buffer} buffer - 파일 버퍼
 * @param {string} label - 로깅용 라벨
 * @returns {Object} 파싱된 JSON 객체
 */
function validateJsonContent(buffer, label) {
  try {
    const data = JSON.parse(buffer.toString('utf-8'));
    if (!data || typeof data !== 'object') {
      throw new Error('JSON 데이터가 객체가 아닙니다');
    }
    return data;
  } catch (error) {
    throw new Error(`${label} JSON 파싱 실패: ${error.message}`);
  }
}

// ── [v3.0.2] 응답 파서 ──────────────────────────────────────

/**
 * Bedrock 응답에서 마크다운/HTML 블록 분리
 *
 * 구분자: ===MARKDOWN_START=== / ===MARKDOWN_END===
 *        ===HTML_START=== / ===HTML_END===
 *
 * @param {string} text - Bedrock 전체 응답 텍스트
 * @returns {{ markdown: string, html: string|null }}
 */
function parsePresentation(text) {
  const mdMatch = text.match(/===MARKDOWN_START===([\s\S]*?)===MARKDOWN_END===/);
  const htmlMatch = text.match(/===HTML_START===([\s\S]*?)===HTML_END===/);

  return {
    markdown: mdMatch ? mdMatch[1].trim() : text.trim(),  // 파싱 실패 시 전체를 마크다운으로
    html: htmlMatch ? htmlMatch[1].trim() : null
  };
}

// ── [v3.0.2] HTML → PDF 변환 ────────────────────────────────

/**
 * HTML 문자열을 Puppeteer로 PDF 변환
 *
 * @param {string} htmlString - 완전한 HTML 문서
 * @param {string} outputPath - PDF 저장 절대 경로
 */
async function htmlToPdf(htmlString, outputPath) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(htmlString, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
    });
    logger.info(`기획서 PDF 생성: ${outputPath}`);
  } finally {
    if (browser) await browser.close();
  }
}

// ── [v3.0.2] PDF 파일명 생성 ────────────────────────────────

/**
 * 카드 데이터에서 기획서 PDF 파일명 생성
 *
 * @param {Object} cardData - 카드 JSON 데이터
 * @param {string} jsonDataFilePath - 원본 JSON 파일 상대 경로
 * @returns {string} PDF 파일명 (확장자 포함)
 */
function buildPresentationPdfName(cardData, jsonDataFilePath) {
  if (cardData.card_products?.[0]?.product_name) {
    const safeName = cardData.card_products[0].product_name
      .replace(/[^a-zA-Z0-9가-힣_-]/g, '_')
      .substring(0, 50);
    return `${safeName}_기획서.pdf`;
  }
  return `${path.basename(jsonDataFilePath, '.json')}_기획서.pdf`;
}

// ── 메인 핸들러 ─────────────────────────────────────────────

/**
 * 카드 사업 기획서 생성
 *
 * [v3.0.2] 플로우:
 *   JSON 파일 2개 읽기 → Bedrock(Opus) 호출
 *   → 마크다운 + HTML 분리
 *   → HTML → Puppeteer PDF 저장
 *   → MCP 응답: 마크다운 본문 + PDF 경로 안내
 *
 * @param {Object} args
 * @param {string} args.jsonDataFilePath     - 카드 데이터 JSON (assets 상대 경로)
 * @param {string} args.jsonAnalysisFilePath - 분석 데이터 JSON (assets 상대 경로)
 * @returns {Promise<Object>} MCP 응답 ({ content: [{ type: 'text', text }] })
 */
export async function generatePresentation(args) {
  try {
    const { jsonDataFilePath, jsonAnalysisFilePath } = args;

    // 1. 파라미터 검증
    if (!jsonDataFilePath || typeof jsonDataFilePath !== 'string') {
      return mcpError('jsonDataFilePath는 필수 문자열 파라미터입니다');
    }
    if (!jsonAnalysisFilePath || typeof jsonAnalysisFilePath !== 'string') {
      return mcpError('jsonAnalysisFilePath는 필수 문자열 파라미터입니다');
    }

    // 2. 절대 경로 구성
    const assetsPath = process.env.ASSETS_PATH;
    if (!assetsPath) {
      return mcpError('환경변수 ASSETS_PATH가 설정되지 않았습니다');
    }

    const absoluteDataPath = path.join(assetsPath, jsonDataFilePath);
    const absoluteAnalysisPath = path.join(assetsPath, jsonAnalysisFilePath);

    logger.info(`카드 데이터: ${absoluteDataPath}`);
    logger.info(`분석 데이터: ${absoluteAnalysisPath}`);

    // 3. 파일 읽기 + 유효성 검증 (병렬)
    await Promise.all([
      validateFilePath(absoluteDataPath),
      validateFilePath(absoluteAnalysisPath)
    ]);

    const [jsonDocumentBytes, jsonAnalysisDocumentBytes] = await Promise.all([
      fs.readFile(absoluteDataPath),
      fs.readFile(absoluteAnalysisPath)
    ]);

    const cardData = validateJsonContent(jsonDocumentBytes, '카드 데이터');
    const analysisData = validateJsonContent(jsonAnalysisDocumentBytes, '분석 데이터');

    logger.info(`카드 데이터 필드 수: ${Object.keys(cardData).length}`);
    logger.info(`분석 데이터 필드 수: ${Object.keys(analysisData).length}`);

    // 4. LLM 메시지 구성 — JSON bytes를 utf-8 텍스트로 인라인
    const cardJsonText = jsonDocumentBytes.toString('utf-8');
    const analysisJsonText = jsonAnalysisDocumentBytes.toString('utf-8');

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: `## 카드 데이터 (JSON)\n\`\`\`json\n${cardJsonText}\n\`\`\`` },
          { type: 'text', text: `## 분석 데이터 (JSON)\n\`\`\`json\n${analysisJsonText}\n\`\`\`` },
          { type: 'text', text: getPresentationPrompt() }
        ]
      }
    ];

    // 5. LLM 호출
    logger.info('기획서 생성 중...');
    const client = createLLMClient(LLM_PRESETS.presentation, logger);
    const generatedContent = await client.complete(messages);
    logger.info(`기획서 생성 완료 (${generatedContent.length}자)`);

    // 6. [v3.0.2] 마크다운 / HTML 분리
    const { markdown, html } = parsePresentation(generatedContent);
    logger.info(`마크다운: ${markdown.length}자, HTML: ${html ? html.length + '자' : '없음'}`);

    // 7. [v3.0.2] HTML → PDF 변환
    let pdfPath = null;
    if (html) {
      const pdfOutputDir = process.env.PDF_OUTPUT_DIR || process.env.CARD_PDF_DIR;
      if (pdfOutputDir) {
        await fs.mkdir(pdfOutputDir, { recursive: true });
        const pdfFileName = buildPresentationPdfName(cardData, jsonDataFilePath);
        pdfPath = path.join(pdfOutputDir, pdfFileName);
        await htmlToPdf(html, pdfPath);
      } else {
        logger.warn('PDF_OUTPUT_DIR 미설정, PDF 생성 건너뜀');
      }
    } else {
      logger.warn('HTML 블록 파싱 실패, PDF 생성 건너뜀 — 마크다운만 반환');
    }

    // 8. [v3.0.2] MCP 응답: 마크다운 본문 + PDF 경로
    const response = pdfPath
      ? `${markdown}\n\n---\n📁 기획서 PDF 저장 위치: ${pdfPath}`
      : markdown;

    return mcpText(response);

  } catch (error) {
    logger.error('기획서 생성 실패:', error.message);
    return mcpError(`기획서 생성 실패: ${error.message}`);
  }
}