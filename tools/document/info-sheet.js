// ============================================================
// tools/document/info-sheet.js — 카드 상품 설명서 PDF 생성
//
// 원본: info_sheet/index.js → generatePdfFromTemplate()
// 개선:
//   - BedrockModel 클래스 → 공유 BedrockClient 사용
//   - fallback_template 인라인 → INFO_SHEET_TEMPLATE_PATH에서 읽기
//   - 하드코딩 경로 → process.env 참조
//   - console.error → createLogger('document')
//   - McpError throw → mcpError() 래퍼 반환
//   - PDF 출력 경로를 PDF_OUTPUT_DIR 환경변수로 관리
// ============================================================

import { promises as fs } from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import { BedrockClient } from '../../shared/bedrock-client.js';
import { BEDROCK_PRESETS } from '../../shared/constants.js';
import { mcpText, mcpError } from '../../shared/utils.js';
import { createLogger } from '../../shared/logger.js';
import { getInfoSheetFillPrompt } from './info-sheet-prompt.js';

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

/**
 * LLM 응답에서 유효한 HTML 코드 추출
 * <!DOCTYPE html> ... </html> 패턴을 찾아 반환
 *
 * @param {string} text - Bedrock 응답 텍스트
 * @param {string} fallbackHtml - 파싱 실패 시 사용할 원본 HTML
 * @returns {string} 추출된 HTML 코드
 */
function extractHtml(text, fallbackHtml) {
  const match = text.match(/<!DOCTYPE html>([\s\S]+?)<\/html>/);
  if (match) {
    logger.info('HTML 파싱 성공');
    return match[0];
  }
  logger.warn('HTML 파싱 실패, fallback 템플릿 사용');
  return fallbackHtml;
}

/**
 * HTML 문자열을 Puppeteer로 PDF 변환
 *
 * @param {string} htmlString - 변환할 HTML
 * @param {string} outputPdfPath - 출력 PDF 파일 절대 경로
 * @returns {Promise<void>}
 */
async function generatePdfFromHtml(htmlString, outputPdfPath) {
  logger.info('HTML → PDF 변환 시작');

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // HTML 콘텐츠 설정 및 리소스 로딩 완료 대기
    await page.setContent(htmlString, { waitUntil: 'networkidle0' });

    // PDF 생성 (Letter 용지, 배경색 포함)
    await page.pdf({
      path: outputPdfPath,
      format: 'Letter',
      printBackground: true
    });

    logger.info(`PDF 생성 완료: ${outputPdfPath}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * 카드 데이터 JSON에서 PDF 파일명 생성
 *
 * @param {Object} cardData - 카드 JSON 데이터
 * @param {string} dataJsonFilePath - 원본 JSON 파일 상대 경로
 * @returns {string} PDF 파일명 (확장자 포함)
 */
function buildPdfFileName(cardData, dataJsonFilePath) {
  // 카드 상품명이 있으면 사용, 없으면 원본 파일명 기반
  if (cardData.card_products?.[0]?.product_name) {
    const safeName = cardData.card_products[0].product_name
      .replace(/[^a-zA-Z0-9가-힣_-]/g, '_')
      .substring(0, 50);
    return `${safeName}_설명서.pdf`;
  }
  const baseName = path.basename(dataJsonFilePath, '.json');
  return `${baseName}_설명서.pdf`;
}

// ── 메인 핸들러 ─────────────────────────────────────────────

/**
 * 카드 상품 설명서 PDF 생성
 *
 * 플로우: HTML 템플릿 읽기 → JSON 데이터 읽기
 *       → Bedrock로 HTML에 데이터 채우기 → Puppeteer PDF 변환
 *
 * @param {Object} args
 * @param {string} args.dataJsonFilePath - 카드 데이터 JSON (assets 상대 경로)
 * @returns {Promise<Object>} MCP 응답
 */
export async function generateInfoSheetPdf(args) {
  try {
    const { dataJsonFilePath } = args;

    // 1. 파라미터 검증
    if (!dataJsonFilePath || typeof dataJsonFilePath !== 'string') {
      return mcpError('dataJsonFilePath는 필수 문자열 파라미터입니다');
    }

    // 2. 환경변수 검증
    const assetsPath = process.env.ASSETS_PATH;
    const templatePath = process.env.INFO_SHEET_TEMPLATE_PATH;
    const pdfOutputDir = process.env.PDF_OUTPUT_DIR;

    if (!assetsPath) {
      return mcpError('환경변수 ASSETS_PATH가 설정되지 않았습니다');
    }
    if (!templatePath) {
      return mcpError('환경변수 INFO_SHEET_TEMPLATE_PATH가 설정되지 않았습니다');
    }
    if (!pdfOutputDir) {
      return mcpError('환경변수 PDF_OUTPUT_DIR가 설정되지 않았습니다');
    }

    // 3. 파일 경로 구성
    const absoluteDataPath = path.join(assetsPath, dataJsonFilePath);
    logger.info(`카드 데이터: ${absoluteDataPath}`);
    logger.info(`HTML 템플릿: ${templatePath}`);

    // 4. 파일 존재 검증
    await validateFilePath(absoluteDataPath);
    await validateFilePath(templatePath);

    // 5. 파일 읽기 (병렬)
    const [jsonDocumentBytes, htmlTemplate] = await Promise.all([
      fs.readFile(absoluteDataPath),
      fs.readFile(templatePath, 'utf-8')
    ]);

    const cardData = validateJsonContent(jsonDocumentBytes, '카드 데이터');
    logger.info(`카드 데이터 필드 수: ${Object.keys(cardData).length}`);

    // 6. Bedrock 메시지 구성 — JSON 데이터 + 프롬프트 + HTML 템플릿
    const messages = [
      {
        role: 'user',
        content: [
          {
            document: {
              name: 'Card details in json',
              format: 'txt',
              source: { bytes: jsonDocumentBytes }
            }
          },
          { text: getInfoSheetFillPrompt() },
          { text: htmlTemplate }
        ]
      }
    ];

    // 7. Bedrock 호출 — HTML 템플릿에 카드 데이터 채우기
    logger.info('Bedrock 모델로 최종 HTML 생성 중...');
    const client = new BedrockClient(BEDROCK_PRESETS.infoSheet, logger);
    const bedrockResponse = await client.converse(messages);

    // 8. 응답에서 HTML 추출
    const finalHtml = extractHtml(bedrockResponse, htmlTemplate);

    // 9. 출력 디렉토리 확인 + PDF 파일명 생성
    await fs.mkdir(pdfOutputDir, { recursive: true });
    const pdfFileName = buildPdfFileName(cardData, dataJsonFilePath);
    const outputPdfPath = path.join(pdfOutputDir, pdfFileName);

    // 10. HTML → PDF 변환
    await generatePdfFromHtml(finalHtml, outputPdfPath);

    return mcpText(
      `${outputPdfPath} 경로에 카드 상품 설명서 PDF가 생성되었습니다. 작업을 완료합니다.`
    );

  } catch (error) {
    logger.error('설명서 PDF 생성 실패:', error.message);
    return mcpError(`설명서 PDF 생성 실패: ${error.message}`);
  }
}
