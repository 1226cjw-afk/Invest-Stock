/* 홈 화면 추가용 아이콘(PNG) 생성기
   이 PC에는 Python·이미지 툴이 없어서 Node 내장 zlib 만으로 PNG를 직접 인코딩한다.
   색을 바꾸려면 아래 COLORS 만 고치고 `node tools/make-icons.js` 실행.

   디자인: 어두운 패널 배경 + 앰버 상승 막대 4개.
   maskable 아이콘은 가장자리가 잘릴 수 있으므로 내용은 중앙 안전영역(약 60%) 안에 둔다. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const COLORS = {
  bg:   [0x0d, 0x11, 0x17],   // --panel
  bar:  [0xf0, 0xa5, 0x00],   // --amber
  base: [0x2b, 0x35, 0x42],   // --line-hi
};

/* ── 최소 PNG 인코더 (color type 2 = truecolor RGB) ── */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 2;    // color type: truecolor
  // 10~12: compression / filter / interlace = 0

  /* 각 스캔라인 앞에 필터 바이트(0 = None) */
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── 아이콘 그리기 ── */
function drawIcon(S) {
  const buf = Buffer.alloc(S * S * 3);
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 3;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
  };
  const rect = (x0, y0, w, h, c) => {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++)
      for (let x = Math.round(x0); x < Math.round(x0 + w); x++) put(x, y, c);
  };

  rect(0, 0, S, S, COLORS.bg);

  /* 안전영역 안의 막대그래프 */
  const pad = S * 0.24;
  const areaW = S - pad * 2;
  const areaH = S - pad * 2;
  const baseY = pad + areaH;

  const n = 4;
  const gap = areaW * 0.09;
  const barW = (areaW - gap * (n - 1)) / n;
  const ratios = [0.34, 0.56, 0.78, 1.0];   // 우상향

  ratios.forEach((r, i) => {
    const h = areaH * r;
    rect(pad + i * (barW + gap), baseY - h, barW, h, COLORS.bar);
  });

  /* 바닥선 */
  rect(pad, baseY + S * 0.03, areaW, Math.max(2, S * 0.022), COLORS.base);

  return encodePng(S, S, buf);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
[192, 512].forEach(size => {
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, drawIcon(size));
  console.log('생성:', file, fs.statSync(file).size, 'bytes');
});
