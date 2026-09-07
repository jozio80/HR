'use strict';

/**
 * 이력서 파일에서 텍스트를 추출한다. 전부 로컬 라이브러리(pdf-parse, mammoth)로
 * 파일을 직접 파싱하며, 어떤 네트워크 요청도 하지 않는다.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

async function extractFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  if (ext === '.pdf') {
    const pdfParse = require('pdf-parse');
    const buffer = await fs.readFile(filePath);
    const data = await pdfParse(buffer);
    return { fileName, text: data.text || '', ext };
  }

  if (ext === '.docx') {
    const mammoth = require('mammoth');
    const buffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return { fileName, text: result.value || '', ext };
  }

  if (ext === '.txt') {
    const text = await fs.readFile(filePath, 'utf-8');
    return { fileName, text, ext };
  }

  throw new Error(`지원하지 않는 파일 형식입니다: ${ext} (지원: .pdf, .docx, .txt)`);
}

const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.txt'];

module.exports = { extractFromFile, SUPPORTED_EXTENSIONS };
