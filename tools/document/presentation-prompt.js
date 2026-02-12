// ============================================================
// tools/document/presentation-prompt.js — 기획서 생성 프롬프트
//
// 원본: presentation_creation.js → generatePrompt()
//
// v3.0.2 수정:
//   - 기존 프롬프트 복원 (마크다운 구조 강제 → 자유 구성)
//   - 마크다운 + HTML 이중 출력 구분자 추가
//   - HTML 스타일 가이드: 안내장 fallback_template과 톤 통일
// ============================================================

/**
 * 카드 사업 기획서 생성용 Bedrock 프롬프트 반환
 *
 * 출력 형식: 구분자로 마크다운/HTML 블록을 분리하여 동시 생성
 * - 마크다운: Agent가 채팅에서 사용자에게 그대로 표시
 * - HTML: Puppeteer로 PDF 변환하여 파일 저장
 *
 * @returns {string} 기획서 생성 프롬프트
 */
export function getPresentationPrompt() {
  return `JSON 형식으로 주어진 카드 상품서에 대한 기획서를 만들어줘. 직장 상사한테 발표하는 자료니까 설득력이 있는 기획서여야해.
JSON 형태로 주어진 카드에 대한 분석 자료도 사용해서 기획서를 만들어줘.

다음 내용을 포함해서 작성해줘:
1. 이 카드가 어떻게 회사측에 이익을 가져다 줄 지 확실하게 명시
2. 어떠한 방법들로 고객들을 유치할 것인지에 대한 전략
3. 이 사업으로 얻을 수 있는 사측의 이익 및 향후 발전 동향
4. 시장 분석 및 경쟁사 대비 우위점
5. 예상 수익성 및 ROI 분석

일반적인 홍보 자료가 아니라 사업을 기획하는 자료이기 때문에 조금 더 격식있게 작성해줘.
기획서는 카드사 입장에서 작성해줘.

반드시 아래 두 블록으로 나누어 출력해줘:

===MARKDOWN_START===
(마크다운 형식의 기획서 전문을 여기에 작성. 제목은 "# 카드명 사업 기획서"로 시작하고, 표, 수치, 분석을 충실히 포함해줘.)
===MARKDOWN_END===

===HTML_START===
(위 마크다운과 동일한 내용을 HTML 문서로 변환하여 작성. <!DOCTYPE html>로 시작하는 완전한 단일 HTML 파일이어야 해.
스타일 규칙:
- 한글 폰트: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif
- 본문 폭: max-width 900px, margin 0 auto, padding 40px
- 메인 색상: #2e3192 (헤더, 제목), 보조 색상: #e7ecf7 (배경 강조)
- 표는 border-collapse: collapse, 테두리 #ddd, 헤더 배경 #f5f5f5
- 인쇄 친화적: 배경색 포함, 적절한 page-break
- 전체 CSS를 <style> 태그 안에 인라인으로 포함해줘.)
===HTML_END===`;
}