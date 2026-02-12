// ============================================================
// tools/document/info-sheet-prompt.js — 카드 설명서 생성 프롬프트
//
// 원본: info_sheet/promptGenerator.js → PromptGenerator 클래스
// ============================================================

/**
 * JSON 데이터로 HTML 템플릿의 텍스트를 채우는 프롬프트
 * 디자인(CSS/레이아웃)은 유지하고 텍스트 내용만 교체하도록 지시
 *
 * @returns {string} Bedrock 프롬프트
 */
export function getInfoSheetFillPrompt() {
  return `주어진 HTML파일에 있는 내용을 JSON파일에 주어진 데이터로 변경해줘. HTML파일에 있는 디자인 코드는 변경하지 말고 텍스트 부분만 JSON파일에 있는 내용으로 변경한 후에 HTML코드를 그대로 리턴해줘.`;
}

/**
 * PDF 디자인 템플릿에서 HTML 코드를 추출하는 프롬프트
 * (현재 미사용 — fallback 템플릿 파일로 대체)
 *
 * @returns {string} Bedrock 프롬프트
 */
export function getConvertToHtmlPrompt() {
  return 'Generate HTML code that gives a design which looks like the one provided in the pdf file, by referencing ONLY the SECOND PAGE of the file. The resulting HTML code MUST be a single page static HTML code in a horizonal layout. DO NOT stack sections on top of each other. All sections are to be laid out horizonatlly, separated with a constant spacing. Strictly follow the colour scheme, length/width of elements, font/font-size and spacing.';
}
