# READ AND LIVE 카드 편집기

인스타그램 '삶의 태도' 카드뉴스 7장(커버 1 · 본문 5 · 클로징 1)을 브라우저에서
쓰고, 사진을 붙여넣고, 1080×1350 PNG로 굽는 단일 HTML 도구.

글자 크기·행간·자간·좌표는 Figma 파일 **클로드 연결**(`99AvEW2Ive2IqSOBa4Zo7P`)의
대표 커버 / 대표 본문 / 대표 클로징 프레임 값을 그대로 옮긴 것이다.
Figma MCP 호출을 쓰지 않고 카드를 만들기 위한 대체 경로다.

## 파일

| 파일 | 내용 |
|---|---|
| `src.html` | 편집기 본체. 실제로 고치는 건 이 파일이다 (약 32KB) |
| `fonts.json` | Noto Sans KR 가변 폰트(wght 100~900) woff2 서브셋 95개, base64 (2.8MB) |
| `build.mjs` | `src.html` + `fonts.json` → `dist/index.html` |
| `dist/` | 빌드 결과물. git에 넣지 않는다 |

## 빌드

```
node tools/card-news-editor/build.mjs
```

`dist/index.html`(약 2.7MB)이 나온다. 이 파일 하나만 있으면 되고, Artifact로
바로 발행할 수 있다.

## 회차 문구 넣기

`src.html` 맨 위의 `<script id="deck" type="application/json">` 블록만 고친다.

```json
{
  "key": "readandlive-20260814",
  "cards": [
    { "a": "커버 헤드라인", "b": "커버 서브카피" },
    { "a": "헤드라인",     "b": "본문 세 문장을 줄바꿈 없이 한 단락으로" },
    ...
    { "a": "",             "b": "클로징 문장" }
  ]
}
```

- `a` = 헤드라인, `b` = 본문 / 서브카피 / 클로징 문장
- 카드 순서는 `01_cover` `02_전제` `03_적용1` `04_적용2` `05_경계` `06_재정의` `07_closing`
- 카드7의 `a`는 빈 문자열. `b`는 **카드1의 `b`와 글자·마침표까지 같아야 한다** (수미상관)
- `key`는 회차마다 바꾼다. 브라우저 localStorage 키라서, 같으면 이전 회차 편집분이 되살아난다

`fonts.json`은 열어 볼 일이 없다. 2.8MB짜리 base64 한 줄이다.

## 왜 폰트를 파일에 심었나

Artifact는 CSP로 외부 폰트 CDN을 막는다. `<link>`로 걸면 조용히 다른 글씨체로
떨어지고, PNG 내보내기까지 함께 틀어진다. Google Fonts가 Noto Sans KR을 가변
폰트로 서빙해서, 한글·라틴·문장부호 구간만 남기면 세 굵기(400/700/900)를 전부
2.3MB 안에 넣을 수 있다.

내보낼 때는 그 카드에 실제로 쓰인 글자를 덮는 서브셋만 골라 SVG에 넣는다.
그래서 7장을 굽는 데 1~2초면 된다.

## 폰트 다시 받기

```
curl -A "Mozilla/5.0 ... Chrome/131.0 ..." \
  "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap"
```

받은 CSS에서 한글(U+AC00–D7FF 등)·라틴·문장부호 구간과 겹치는 `@font-face`만
남기고 woff2를 내려받아 `[{ "r": unicode-range, "d": base64 }]` 형태로 묶으면
`fonts.json`이 된다. 한자 구간은 뺀다.
