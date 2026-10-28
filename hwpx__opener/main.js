'use strict';
// HWPX = ZIP + XML (OWPML). JSZip으로 압축을 풀고, 브라우저 내장 DOMParser로 XML을 읽는다.

const $ = (id) => document.getElementById(id);
const PX = 1 / 75; // HWPUNIT(1/7200 inch) -> px(96dpi)
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml' };

// ---- XML 헬퍼: 접두사(hp:, hh:)에 의존하지 않도록 localName으로 찾는다 ----
const kids = (el, n) => Array.from(el?.children || []).filter((c) => c.localName === n);
const first = (el, n) => (el ? kids(el, n)[0] : undefined);
const all = (el, n) => Array.from(el.getElementsByTagNameNS('*', n));
const num = (v) => Number(v) || 0;

function parseXml(text, label) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error(`${label} 파싱 실패`);
  return doc;
}
const findEntry = (zip, path) => {
  const p = path.replace(/^\.?\//, '').toLowerCase();
  return Object.values(zip.files).find((f) => !f.dir && f.name.toLowerCase() === p);
};
async function readXml(zip, path) {
  const f = findEntry(zip, path);
  if (!f) throw new Error(`${path} 파일이 없습니다`);
  return parseXml(await f.async('string'), path);
}
const baseName = (p) => p.split('/').pop().replace(/\.[^.]+$/, '');

// ---- 1단계: header.xml 의 글자/문단 스타일 ----
function parseHeader(doc) {
  const charPr = new Map(), paraPr = new Map();
  for (const el of all(doc, 'charPr')) {
    const ul = first(el, 'underline'), st = first(el, 'strikeout');
    charPr.set(el.getAttribute('id'), {
      size: num(el.getAttribute('height')) / 100, // 1000 = 10pt
      color: el.getAttribute('textColor'),
      bold: !!first(el, 'bold'),
      italic: !!first(el, 'italic'),
      underline: !!ul && ul.getAttribute('type') !== 'NONE',
      strike: !!st && st.getAttribute('shape') !== 'NONE',
    });
  }
  for (const el of all(doc, 'paraPr')) {
    const align = all(el, 'align')[0]?.getAttribute('horizontal');
    const ls = all(el, 'lineSpacing')[0];
    paraPr.set(el.getAttribute('id'), {
      align: { CENTER: 'center', RIGHT: 'right', JUSTIFY: 'justify', LEFT: 'left' }[align],
      lineHeight: ls && ls.getAttribute('type') === 'PERCENT' ? num(ls.getAttribute('value')) / 100 : 0,
    });
  }
  return { charPr, paraPr };
}

// ---- 2단계: content.hpf (섹션 순서, 이미지 ID -> 파일) ----
async function loadManifest(zip) {
  const f = findEntry(zip, 'Contents/content.hpf');
  const items = new Map(); let spine = [];
  if (f) {
    const doc = parseXml(await f.async('string'), 'content.hpf');
    for (const it of all(doc, 'item')) items.set(it.getAttribute('id'), it.getAttribute('href'));
    spine = all(doc, 'itemref').map((r) => items.get(r.getAttribute('idref'))).filter((h) => /section\d+\.xml$/i.test(h || ''));
  }
  if (!spine.length) {
    spine = Object.keys(zip.files).filter((n) => /^contents\/section\d+\.xml$/i.test(n)).sort();
  }
  return { items, spine };
}
async function loadImages(zip, manifest) {
  const urls = new Map();
  for (const f of Object.values(zip.files)) {
    if (f.dir || !/^bindata\//i.test(f.name)) continue;
    const ext = f.name.split('.').pop().toLowerCase();
    const blob = new Blob([await f.async('uint8array')], { type: MIME[ext] || '' });
    urls.set(baseName(f.name), URL.createObjectURL(blob));
  }
  for (const [id, href] of manifest.items) {
    const u = href && urls.get(baseName(href));
    if (u) urls.set(id, u);
  }
  return urls;
}

// ---- 3단계: 렌더링 (textContent / append(text)만 사용 -> XSS 방지) ----
function renderText(t, span) {
  for (const n of t.childNodes) {
    if (n.nodeType === Node.TEXT_NODE) span.append(n.data);
    else if (n.localName === 'lineBreak') span.append(document.createElement('br'));
    else if (n.localName === 'tab') span.append('\u2003');
    else if (n.localName === 'nbSpace') span.append('\u00A0');
    else if (n.localName === 'fwSpace') span.append('\u3000');
  }
}
function applyChar(span, c) {
  if (!c) return;
  if (c.size) span.style.fontSize = c.size + 'pt';
  if (/^#[0-9a-f]{6}$/i.test(c.color || '')) span.style.color = c.color;
  if (c.bold) span.style.fontWeight = 'bold';
  if (c.italic) span.style.fontStyle = 'italic';
  const deco = [c.underline && 'underline', c.strike && 'line-through'].filter(Boolean).join(' ');
  if (deco) span.style.textDecoration = deco;
}
function missing(msg) {
  const s = document.createElement('span'); s.className = 'missing'; s.textContent = msg; return s;
}
function renderPic(pic, ctx) {
  const ref = all(pic, 'img')[0]?.getAttribute('binaryItemIDRef');
  const url = ctx.urls.get(ref);
  if (!url) return missing(`[이미지 없음: ${ref}]`);
  const w = num(first(pic, 'curSz')?.getAttribute('width')) || num(first(pic, 'sz')?.getAttribute('width'));
  const img = new Image();
  img.src = url; img.alt = '문서 이미지'; img.style.maxWidth = '100%';
  if (w) img.style.width = w * PX + 'px';
  img.onerror = () => img.replaceWith(missing('[표시할 수 없는 이미지 형식]'));
  return img;
}
function renderTable(tbl, ctx) {
  const t = document.createElement('table'); t.className = 'hwpx-tbl';
  const sz = first(tbl, 'sz');
  if (sz) t.style.width = num(sz.getAttribute('width')) * PX + 'px';
  for (const tr of kids(tbl, 'tr')) {
    const row = t.insertRow();
    for (const tc of kids(tr, 'tc')) {
      const td = row.insertCell();
      const span = first(tc, 'cellSpan');
      if (span) { td.colSpan = num(span.getAttribute('colSpan')) || 1; td.rowSpan = num(span.getAttribute('rowSpan')) || 1; }
      const cw = num(first(tc, 'cellSz')?.getAttribute('width'));
      if (cw) td.style.width = cw * PX + 'px';
      for (const p of kids(first(tc, 'subList') || tc, 'p')) td.append(renderParagraph(p, ctx));
    }
  }
  return t;
}
function renderParagraph(p, ctx) {
  const box = document.createElement('div'); box.className = 'hwpx-p';
  const pp = ctx.styles.paraPr.get(p.getAttribute('paraPrIDRef'));
  if (pp?.align) box.style.textAlign = pp.align;
  if (pp?.lineHeight) box.style.lineHeight = pp.lineHeight;
  for (const run of kids(p, 'run')) {
    const cp = ctx.styles.charPr.get(run.getAttribute('charPrIDRef'));
    for (const node of run.children) {
      if (node.localName === 't') {
        const span = document.createElement('span');
        applyChar(span, cp); renderText(node, span); box.append(span);
      } else if (node.localName === 'tbl') box.append(renderTable(node, ctx));
      else if (node.localName === 'pic') box.append(renderPic(node, ctx));
    }
  }
  if (!box.childNodes.length) box.append(document.createElement('br')); // 빈 문단도 줄 높이 유지
  return box;
}
function renderSection(doc, ctx) {
  const sheet = document.createElement('section'); sheet.className = 'sheet';
  const pg = all(doc, 'pagePr')[0], mg = first(pg, 'margin');
  if (pg) sheet.style.width = num(pg.getAttribute('width')) * PX + 'px';
  if (mg) sheet.style.padding = ['top', 'right', 'bottom', 'left'].map((k) => num(mg.getAttribute(k)) * PX + 'px').join(' ');
  for (const p of kids(doc.documentElement, 'p')) sheet.append(renderParagraph(p, ctx));
  return sheet;
}

// ---- DOCX: WordprocessingML (문서 내용은 HTML로 삽입하지 않는다) ----
const wattr = (el, key) => Array.from(el?.attributes || []).find(a => a.localName === key)?.value;
const wval = (el, key) => wattr(first(el, key), 'val');
const enabled = (el, key) => !!first(el, key) && !['0', 'false', 'off', 'none'].includes(wval(el, key));
function docxRun(run, ctx) {
  const span = document.createElement('span'), pr = first(run, 'rPr');
  applyChar(span, { size: num(wval(pr, 'sz')) / 2, color: '#' + wval(pr, 'color'),
    bold: enabled(pr, 'b'), italic: enabled(pr, 'i'), underline: enabled(pr, 'u'), strike: enabled(pr, 'strike') });
  for (const node of run.children) {
    if (node.localName === 't') span.append(node.textContent);
    else if (['br', 'cr'].includes(node.localName)) span.append(document.createElement('br'));
    else if (node.localName === 'tab') span.append('\u2003');
    else if (node.localName === 'drawing') {
      for (const blip of all(node, 'blip')) {
        const url = ctx.urls.get(wattr(blip, 'embed'));
        if (!url) { span.append(missing('[표시할 수 없는 이미지]')); continue; }
        const img = new Image(); img.src = url; img.alt = '문서 이미지'; img.style.maxWidth = '100%';
        const width = num(wattr(all(node, 'extent')[0], 'cx')) / 9525;
        if (width) img.style.width = width + 'px';
        img.onerror = () => img.replaceWith(missing('[표시할 수 없는 이미지 형식]'));
        span.append(img);
      }
    }
  }
  return span;
}
function docxParagraph(p, ctx) {
  const box = document.createElement('div'); box.className = 'hwpx-p';
  const pr = first(p, 'pPr');
  box.style.textAlign = {left:'left',start:'left',right:'right',end:'right',center:'center',both:'justify'}[wval(pr, 'jc')] || '';
  const walk = el => {
    for (const child of el.children) {
      if (child.localName === 'r') box.append(docxRun(child, ctx));
      else if (['hyperlink', 'sdt', 'sdtContent', 'ins', 'smartTag'].includes(child.localName)) walk(child);
    }
  };
  walk(p);
  if (!box.childNodes.length) box.append(document.createElement('br'));
  return box;
}
function docxBlocks(parent, target, ctx) {
  for (const child of parent.children) {
    if (child.localName === 'p') target.append(docxParagraph(child, ctx));
    else if (child.localName === 'tbl') {
      const table = document.createElement('table'); table.className = 'hwpx-tbl';
      let above = new Map();
      for (const tr of kids(child, 'tr')) {
        const row = table.insertRow(), next = new Map(); let col = num(wval(first(tr, 'trPr'), 'gridBefore'));
        for (const tc of kids(tr, 'tc')) {
          const pr = first(tc, 'tcPr'), span = Math.max(1, num(wval(pr, 'gridSpan'))), merge = first(pr, 'vMerge');
          if (merge && wattr(merge, 'val') !== 'restart' && above.has(col)) {
            const cell = above.get(col); cell.rowSpan++; next.set(col, cell);
          } else {
            const cell = row.insertCell(); cell.colSpan = span; docxBlocks(tc, cell, ctx);
            if (merge) next.set(col, cell);
          }
          col += span;
        }
        above = next;
      }
      target.append(table);
    } else if (['sdt', 'sdtContent'].includes(child.localName)) docxBlocks(child, target, ctx);
  }
}
async function renderDocx(zip, urls) {
  const doc = await readXml(zip, 'word/document.xml');
  const body = first(doc.documentElement, 'body');
  if (doc.documentElement.localName !== 'document' || !body) throw new Error('올바른 DOCX 본문이 아닙니다.');
  const rel = findEntry(zip, 'word/_rels/document.xml.rels');
  if (rel) {
    for (const r of all(parseXml(await rel.async('string'), 'document.xml.rels'), 'Relationship')) {
      if (r.getAttribute('TargetMode') === 'External' || !/\/image$/.test(r.getAttribute('Type') || '')) continue;
      const target = r.getAttribute('Target') || '';
      const parts = target.startsWith('/') ? [] : ['word'];
      for (const part of target.split('/')) { if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part); }
      const entry = findEntry(zip, parts.join('/')), ext = target.split('.').pop().toLowerCase();
      if (entry && MIME[ext]) urls.set(r.getAttribute('Id'), URL.createObjectURL(new Blob([await entry.async('uint8array')], {type: MIME[ext]})));
    }
  }
  const sheet = document.createElement('section'); sheet.className = 'sheet';
  const sect = first(body, 'sectPr'), size = first(sect, 'pgSz'), margin = first(sect, 'pgMar');
  sheet.style.width = (num(wattr(size, 'w')) / 15 || 794) + 'px';
  sheet.style.padding = ['top', 'right', 'bottom', 'left'].map(k => (wattr(margin, k) == null ? 64 : num(wattr(margin, k)) / 15) + 'px').join(' ');
  docxBlocks(body, sheet, {urls});
  return sheet;
}
// ---- 파일 내용으로 형식 자동 판별 / 기존 UI ----
let currentUrls = [], openVersion = 0;
async function detectFormat(zip) {
  if (findEntry(zip, '[Content_Types].xml') && findEntry(zip, 'word/document.xml')) {
    const types = await readXml(zip, '[Content_Types].xml');
    if (all(types, 'Override').some(el => el.getAttribute('PartName') === '/word/document.xml' && el.getAttribute('ContentType') === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')) return 'DOCX';
  }
  if (findEntry(zip, 'Contents/header.xml') && Object.keys(zip.files).some(p => /^contents\/section\d+\.xml$/i.test(p))) return 'HWPX';
  throw new Error('지원하지 않는 문서입니다. HWPX 또는 DOCX 파일을 선택하세요.');
}
async function openDocument(file) {
  const version = ++openVersion, status = $('status'), viewer = $('viewer');
  status.className = ''; status.textContent = `${file.name} 여는 중...`;
  currentUrls.forEach(url => URL.revokeObjectURL(url)); currentUrls = [];
  viewer.replaceChildren(); $('structure').hidden = true; $('tree').textContent = '';
  let urls = new Map();
  try {
    if (typeof JSZip === 'undefined') throw new Error('ZIP 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침하세요.');
    const buffer = await file.arrayBuffer();
    const signature = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 4));
    if (signature[0] !== 0x50 || signature[1] !== 0x4b) throw new Error('HWPX 또는 DOCX 형식이 아닙니다. 기존 .hwp, .doc 및 암호화된 문서는 지원하지 않습니다.');
    const zip = await JSZip.loadAsync(buffer), format = await detectFormat(zip);
    const fragment = document.createDocumentFragment(); let count = 1;
    if (format === 'DOCX') fragment.append(await renderDocx(zip, urls));
    else {
      const styles = parseHeader(await readXml(zip, 'Contents/header.xml')), manifest = await loadManifest(zip);
      urls = await loadImages(zip, manifest);
      count = manifest.spine.length;
      for (let path of manifest.spine) {
        if (!findEntry(zip, path) && findEntry(zip, 'Contents/' + path)) path = 'Contents/' + path;
        fragment.append(renderSection(await readXml(zip, path), {styles, urls}));
      }
    }
    if (version !== openVersion) return;
    viewer.append(fragment);
    $('tree').textContent = Object.values(zip.files).map(f => f.name).join('\n');
    $('structure').hidden = false;
    currentUrls = [...new Set(urls.values())];
    status.textContent = `${file.name} - ${format} 자동 감지, 섹션 ${count}개, 이미지 ${currentUrls.length}개`;
  } catch (error) {
    if (version === openVersion) { status.className = 'error'; status.textContent = `열 수 없습니다: ${error.message}`; }
  } finally {
    for (const url of new Set(urls.values())) if (!currentUrls.includes(url)) URL.revokeObjectURL(url);
  }
}
$('file').addEventListener('change', e => { const file = e.target.files[0]; e.target.value = ''; if (file) openDocument(file); });
const drop = $('drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { if (e.dataTransfer.files[0]) openDocument(e.dataTransfer.files[0]); });
