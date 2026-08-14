/*
 * src.html + fonts.json  →  dist/index.html
 *
 * fonts.json 은 Google Fonts 가 서빙하는 Noto Sans KR 가변 폰트(wght 100~900)의
 * woff2 서브셋 95개다. 한글·라틴·문장부호 구간만 남기고 한자 등은 뺐다.
 * 파일에 심어 두는 이유: Artifact 는 CSP 로 외부 폰트 CDN 을 막는다. 링크를 걸면
 * 조용히 다른 글씨체로 떨어지고, PNG 내보내기까지 함께 틀어진다.
 *
 *   node build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'src.html'), 'utf8');
const fonts = fs.readFileSync(path.join(here, 'fonts.json'), 'utf8').trim();

if (!src.includes('__FONTS__')) {
  console.error('src.html 에 __FONTS__ 자리가 없습니다.');
  process.exit(1);
}
if (fonts.includes('</script')) {
  console.error('fonts.json 안에 </script 가 있습니다. 그대로 심으면 문서가 깨집니다.');
  process.exit(1);
}

const out = src.replace('__FONTS__', () => fonts);
const dist = path.join(here, 'dist');
fs.mkdirSync(dist, { recursive: true });
const target = path.join(dist, 'index.html');
fs.writeFileSync(target, out);

const mb = (fs.statSync(target).size / 1048576).toFixed(2);
console.log(`dist/index.html  ${mb} MB  (폰트 서브셋 ${JSON.parse(fonts).length}개)`);
