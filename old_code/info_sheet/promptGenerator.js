// promptGenerator.js
class PromptGenerator {
  static createConvertHtmlPrompt() {
      return "Generate HTML code that gives a design which looks like the one provided in the pdf file, by referencing ONLY the SECOND PAGE of the file. The resulting HTML code MUST be a single page static HTML code in a horizonal layout. DO NOT stack sections on top of each other. All sections are to be laid out horizonatlly, separated with a constant spacing. Strictly follow the colour scheme, length/width of elements, font/font-size and spacing.";
  }

  static createGeneratePdfPrompt() {
      return `주어진 HTML파일에 있는 내용을 JSON파일에 주어진 데이터로 변경해줘. HTML파일에 있는 디자인 코드는 변경하지 말고 텍스트 부분만 JSON파일에 있는 내용으로 변경한 후에 HTML코드를 그대로 리턴해줘.`;
  }
}

module.exports = PromptGenerator;