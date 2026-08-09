# AI 드라마 챌린지 플랫폼

AI 아바타 배우가 연기하는 숏폼 드라마를 올리고, 조회수·좋아요·댓글 점수로
**도전 → 베스트도전 → 정식연재** 로 승급하는 플랫폼. 네이버웹툰 도전만화 구조를 모델로 했다.

코딩 공부용 프로젝트이고, 지금은 **Week1~5 바닐라 단계** 결과물이다.
실제 AI 영상 생성은 MVP 범위에서 제외했다 (회차 화면은 대본 + 영상 자리만 보여준다).

기획 문서 원본: [`docs/PLAN.md`](docs/PLAN.md)

---

## 실행 방법

이 프로젝트는 ES 모듈(`import` / `export`)을 쓰기 때문에 **`index.html` 파일을 브라우저로 바로 열면 동작하지 않는다.**
(`file://` 에서는 모듈 로딩이 CORS로 막힌다.) 반드시 서버로 띄워야 한다.

**StackBlitz**: 저장소를 열면 자동으로 서버가 붙어서 그냥 동작한다.

**로컬에서**:

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

VS Code를 쓰면 Live Server 확장으로 열어도 된다.

데이터는 전부 브라우저 `localStorage` 에 저장된다. 첫 접속 때 예시 작품 7개가 자동으로 들어간다.
푸터의 **데이터 초기화** 버튼으로 언제든 처음 상태로 되돌릴 수 있다.

데모 계정: `k@example.com` / `demo1234`

---

## 파일 구조

```
.
├── index.html      # 화면 껍데기 (헤더 / 장르 필터 / 본문 자리 / 푸터)
├── style.css       # 전체 스타일. 색·간격은 :root 변수로 모아둠
├── script.js       # 해시 라우팅 + 화면 그리기 + 이벤트 처리
├── data.js         # localStorage 읽기/쓰기 (작품·회차·좋아요·댓글·계정)
├── promotion.js    # score 계산 + 승급 판정 (순수 함수)
├── docs/PLAN.md    # 기획 문서 (페이지 구조, ERD, 승급 플로우, 10주 로드맵)
└── README.md
```

기획서의 파일 목록에서 `promotion.js` 하나가 늘었다.
승급 로직만 따로 떼어놔야 Week6에 React로 옮길 때
`src/utils/constants.js` + `src/utils/calculateScore.js` 로 **파일만 옮기면 끝나기** 때문이다.

### Week6 이후 이사 계획

| 지금 | 나중 (React + Firebase) |
|---|---|
| `promotion.js` | `src/utils/constants.js`, `src/utils/calculateScore.js` |
| `data.js` (작품/회차/좋아요/댓글) | `src/services/worksService.js` |
| `data.js` (signup/login/logout/getCurrentUser) | `src/services/authService.js`, `src/context/AuthContext.jsx` |
| `script.js` 의 `viewHome` / `viewWork` / `viewEpisode` ... | `src/pages/*.jsx` |
| `script.js` 의 `cardHtml` / `commentListHtml` / `badge` | `src/components/*` |

`data.js` 의 함수 이름과 반환값 모양(`{ ok, error }` / `{ ok, work }`)을 그대로 유지하는 게 핵심이다.
저장소가 Firebase로 바뀌어도 부르는 쪽 코드를 안 고치는 게 목표.

---

## 화면 목록

| 경로 | 화면 | 로그인 |
|---|---|---|
| `#/` | 홈 (정식연재 / 베스트도전 / 랭킹 top5 / 도전 신작) | — |
| `#/genre/로맨스` | 장르별 피드 | — |
| `#/search?q=아바타` | 검색 결과 | — |
| `#/ranking` | 종합 랭킹 (score 순) | — |
| `#/work/:id` | 작품 상세 (소개, 통계, 승급 진행바, 회차 목록) | — |
| `#/work/:id/ep/:n` | 에피소드 뷰어 (대본, 이전/다음화, 댓글) | — |
| `#/login`, `#/signup` | 로그인 / 회원가입 | — |
| `#/mypage?tab=mine\|liked` | 내 작품 / 좋아요한 작품 | 필요 |
| `#/upload` | 작품 등록 | 필요 |
| `#/work/:id/new-episode` | 회차 등록 (작가 본인만) | 필요 |

좋아요·댓글은 비로그인 상태에서도 **누를 수는 있고**, 누른 순간 로그인 화면으로 보낸다.
이때 원래 보던 주소를 `#/login?next=...` 에 담아뒀다가 로그인 후 되돌려준다.

---

## 승급 로직

```
score = 조회수 × 1 + 좋아요 × 5 + 댓글 × 10
```

| 단계 | 조건 |
|---|---|
| 도전 → 베스트도전 | score ≥ 300, 회차 2개 이상 |
| 베스트도전 → 승인 대기 | score ≥ 2000, 회차 5개 이상, 회차당 평균 좋아요 ≥ 20 |
| 승인 대기 → 정식연재 | 관리자 승인 (`adminApproved = true`) |

`checkPromotion()` 은 "지금 이 작품이 있어야 할 상태"만 계산하는 순수 함수이고,
실제로 저장하는 건 `data.js` 의 `applyPromotion()` 하나뿐이다.
그래서 좋아요·댓글·조회수 어디서 값이 들어와도 승급 규칙은 한 곳에서만 적용된다.

### 승급 테스트하기

실제 수치(300점 / 2000점)는 혼자 클릭해서 도달할 수 없다. 그래서:

1. 푸터의 **테스트 모드** 스위치를 켜면 기준이 `DEV_PROMOTION_RULES` (5점 / 30점)로 바뀐다.
2. 내 작품 상세 페이지 아래 **개발자 도구** 박스에서 `조회수 +100`, `관리자 승인` 을 누를 수 있다.

### 기획서와 다르게 구현한 부분

기획서의 코드 예시는 정식연재 조건을 `(score / episodeCount) >= minAvgLikesPerEp` 로 썼는데,
이건 이름(`minAvgLikesPerEp` = 회차당 평균 **좋아요**)과 달리 **회차당 평균 score** 를 계산한다.
score에는 조회수가 이미 들어있어서, 조회수만 높아도 이 조건이 통과된다.
"회차별로 고른 반응을 확인한다"는 원래 의도와 어긋나므로 `likeCount / episodeCount` 로 구현했다
(`promotion.js` 의 `avgLikesPerEpisode`). 기획서 의도대로 되돌리려면 이 함수만 고치면 된다.

`DEV_PROMOTION_RULES.minAvgLikesPerEp` 는 `1` 이 아니라 `0` 이다.
좋아요는 `(userId, workId)` 유니크라서 계정 하나로는 작품당 1개밖에 못 누른다.
회차가 2개면 평균이 0.5라서, 1로 두면 혼자서는 정식연재까지 절대 도달할 수 없다.

---

## 어뷰징 / 보안 관련해서 넣어둔 것

공부용이지만 Week4~7 로드맵 항목이라 미리 넣어뒀다.

- **XSS 방지**: 유저가 쓴 문자열은 `script.js` 의 `esc()` 를 통과해야 화면에 들어간다.
  제목에 `<img src=x onerror=alert(1)>` 를 넣어도 그냥 글자로 보인다.
- **javascript: 링크 차단**: 회차 영상 링크는 `http(s)` 만 허용한다 (`data.js` 의 `isSafeUrl`).
  저장할 때와 화면에 그릴 때 두 번 확인한다 — localStorage는 사용자가 직접 고칠 수 있으니까.
- **좋아요 중복 방지**: `(userId, workId)` 조합을 넣기 전에 항상 찾아본다.
  Firebase로 가면 문서 ID를 `${userId}_${workId}` 로 잡아서 DB가 막아주게 할 것.
- **댓글 도배 방지**: 5초 간격 제한 + 같은 내용 연속 등록 차단 + 2~300자 길이 제한.
- **조회수 뻥튀기 방지**: 이미 본 회차는 새로고침해도 다시 세지 않는다.
- **회차 등록 권한**: 작가 본인만 등록 가능.
- **로그인 실패 메시지**: 이메일이 있는지 없는지 알려주지 않는다.

**다만 지금 구조에서 진짜 방어는 하나도 성립하지 않는다.** 판정이 전부 브라우저에서 돌기 때문에
DevTools로 localStorage를 고치면 점수든 상태든 마음대로 바꿀 수 있다.
비밀번호도 브라우저에 그대로 남는다 (`weakHash` 는 암호가 아니다).
실제 방어는 Week8의 Firebase Security Rules와 서버 쪽 검증으로 옮겨가야 한다.
**실제로 쓰는 비밀번호를 넣지 말 것.**

---

## 다음 할 일

- [ ] Week5: `.gitignore` 에 `.env` 넣고 GitHub에 올리기 (지금 커밋에 포함)
- [ ] Week6~7: Vite + React로 이사, `promotion.js` → `src/utils/`
- [ ] Week8: Firebase 연결, `data.js` → `services/`, Security Rules 작성
- [ ] Week9: Firebase Auth로 로그인 교체 (`weakHash` 삭제), 권한 체크
- [ ] Week10: Vercel/Netlify 배포, dev/prod 키 분리
