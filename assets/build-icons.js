'use strict';

/**
 * iconutil / sharp 둘 다 이 샌드박스 환경에서 시스템 정책(SIP/코드서명)에 막혀 못 쓰기 때문에
 * .icns(macOS)와 .ico(Windows)를 순수 JS로 직접 패킹한다. 둘 다 PNG를 그대로 담는
 * 최신 포맷(icns v2+의 PNG 페이로드, ico의 PNG-compressed entry)을 쓰므로 리사이즈만
 * sips(맥 내장 툴, 정상 동작 확인됨)로 하고 컨테이너 패킹만 직접 구현한다.
 */

const fs = require('node:fs');
const path = require('node:path');

const SIZES_DIR = path.join(__dirname, 'sizes');

function readPng(size) {
  return fs.readFileSync(path.join(SIZES_DIR, `icon_${size}.png`));
}

function buildIcns(outPath) {
  // tag -> 사이즈(px) 매핑 (PNG 페이로드를 쓰는 표준 icns 타입들)
  const entries = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
  ];
  const chunks = [];
  for (const [tag, size] of entries) {
    const data = readPng(size);
    const tagBuf = Buffer.from(tag, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(8 + data.length, 0);
    chunks.push(tagBuf, lenBuf, data);
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(8 + body.length, 4);
  fs.writeFileSync(outPath, Buffer.concat([header, body]));
  console.log('icns 생성:', outPath, `(${(8 + body.length)} bytes)`);
}

function buildIco(outPath) {
  const sizes = [16, 32, 48, 64, 128, 256];
  const images = sizes.map((size) => ({ size, data: readPng(size) }));

  const headerBuf = Buffer.alloc(6);
  headerBuf.writeUInt16LE(0, 0); // reserved
  headerBuf.writeUInt16LE(1, 2); // type: 1 = icon
  headerBuf.writeUInt16LE(images.length, 4); // count

  let offset = 6 + images.length * 16; // header + directory entries
  const dirEntries = [];
  const dataChunks = [];
  for (const img of images) {
    const dim = img.size >= 256 ? 0 : img.size; // 256은 0으로 표기하는 ICO 규칙
    const entry = Buffer.alloc(16);
    entry.writeUInt8(dim, 0); // width
    entry.writeUInt8(dim, 1); // height
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(img.data.length, 8); // bytes in resource
    entry.writeUInt32LE(offset, 12); // image offset
    dirEntries.push(entry);
    dataChunks.push(img.data);
    offset += img.data.length;
  }

  fs.writeFileSync(outPath, Buffer.concat([headerBuf, ...dirEntries, ...dataChunks]));
  console.log('ico 생성:', outPath, `(${offset} bytes, ${sizes.join('/')}px 포함)`);
}

buildIcns(path.join(__dirname, 'icon.icns'));
buildIco(path.join(__dirname, 'icon.ico'));
