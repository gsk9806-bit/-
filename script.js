// script.js
// 화면 그리기 + 이벤트 처리 (Week3 DOM 조작의 결과물).
// 해시 라우팅으로 한 페이지 안에서 여러 화면을 보여준다.
// Week6~7에 React Router + pages/ 로 옮길 때, 아래 render 함수들이 각각 페이지 컴포넌트가 된다.

import * as db from './data.js';
import { GENRES } from './data.js';
import {
  STATUS,
  calculateScore,
  promotionProgress,
  getRulesMode,
  setRulesMode,
  activeRules,
} from './promotion.js';

const app = document.getElementById('app');
const authArea = document.getElementById('auth-area');
const genreNav = document.getElementById('genre-nav');
const toastEl = document.getElementById('toast');

/* ------------------------------------------------------------------ */
/* 작은 도구들                                                         */
/* ------------------------------------------------------------------ */

/**
 * XSS 방지 (Week4 목표).
 * 유저가 쓴 문자열을 innerHTML 로 넣기 전에 반드시 이걸 통과시킨다.
 * 제목에 <img src=x onerror=alert(1)> 를 넣어도 그냥 글자로 보이게 된다.
 */
function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** 링크에 넣을 값. 해시 라우팅용이라 경로 조각만 인코딩한다. */
function encodeSeg(value) {
  return encodeURIComponent(String(value ?? ''));
}

function fmt(n) {
  return (n || 0).toLocaleString('ko-KR');
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString('ko-KR');
}

let toastTimer;
function toast(message, kind = '') {
  toastEl.textContent = message;
  toastEl.className = `toast is-visible ${kind ? `is-${kind}` : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.className = 'toast';
  }, 2400);
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

/** 로그인 게이트. 로그인 안 했으면 로그인 화면으로 보내고 원래 가려던 곳을 기억한다. */
function requireLogin(message = '로그인이 필요해요.') {
  if (db.getCurrentUser()) return true;
  toast(message, 'bad');
  const next = encodeURIComponent(location.hash || '#/');
  location.hash = `#/login?next=${next}`;
  return false;
}

function badge(status) {
  const map = {
    [STATUS.CHALLENGE]: ['badge--challenge', '도전'],
    [STATUS.BEST]: ['badge--best', '베스트도전'],
    [STATUS.PENDING]: ['badge--pending', '승인 대기'],
    [STATUS.SERIAL]: ['badge--serial', '정식연재'],
  };
  const [cls, label] = map[status] || map[STATUS.CHALLENGE];
  return `<span class="badge ${cls}">${label}</span>`;
}

/* ------------------------------------------------------------------ */
/* 라우터                                                              */
/* ------------------------------------------------------------------ */

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, queryString = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryString));
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);

  if (parts.length === 0) return { name: 'home', query };
  if (parts[0] === 'genre') return { name: 'genre', genre: parts[1] || '전체', query };
  if (parts[0] === 'search') return { name: 'search', query };
  if (parts[0] === 'ranking') return { name: 'ranking', query };
  if (parts[0] === 'login') return { name: 'login', query };
  if (parts[0] === 'signup') return { name: 'signup', query };
  if (parts[0] === 'mypage') return { name: 'mypage', query };
  if (parts[0] === 'upload') return { name: 'upload', query };
  if (parts[0] === 'work' && parts[1]) {
    if (parts[2] === 'ep' && parts[3]) {
      return { name: 'episode', workId: parts[1], episodeNumber: Number(parts[3]), query };
    }
    if (parts[2] === 'new-episode') return { name: 'newEpisode', workId: parts[1], query };
    return { name: 'work', workId: parts[1], query };
  }
  return { name: 'notFound', query };
}

function render() {
  const route = parseRoute();
  renderHeader(route);

  const views = {
    home: viewHome,
    genre: viewGenre,
    search: viewSearch,
    ranking: viewRanking,
    work: viewWork,
    episode: viewEpisode,
    login: viewLogin,
    signup: viewSignup,
    mypage: viewMyPage,
    upload: viewUpload,
    newEpisode: viewNewEpisode,
  };

  const view = views[route.name];
  if (view) view(route);
  else viewNotFound();

  window.scrollTo({ top: 0 });
}

/* ------------------------------------------------------------------ */
/* 헤더                                                               */
/* ------------------------------------------------------------------ */

function renderHeader(route) {
  const user = db.getCurrentUser();

  authArea.innerHTML = user
    ? `
      <span class="who">${esc(user.username)}</span>
      <a class="btn btn--sm" href="#/mypage">마이</a>
      <a class="btn btn--primary btn--sm" href="#/upload">＋ 업로드</a>
      <button class="btn btn--ghost btn--sm" data-action="logout">로그아웃</button>`
    : `
      <a class="btn btn--sm" href="#/login">로그인</a>
      <a class="btn btn--primary btn--sm" href="#/signup">회원가입</a>`;

  const activeGenre = route.name === 'genre' ? route.genre : route.name === 'home' ? '전체' : null;
  const items = ['전체', ...GENRES];

  genreNav.innerHTML = `
    ${items
      .map((g) => {
        const href = g === '전체' ? '#/' : `#/genre/${encodeSeg(g)}`;
        return `<a class="chip ${activeGenre === g ? 'is-active' : ''}" href="${href}">${esc(g)}</a>`;
      })
      .join('')}
    <a class="chip ${route.name === 'ranking' ? 'is-active' : ''}" href="#/ranking">🏆 랭킹</a>`;
}

/* ------------------------------------------------------------------ */
/* 카드 / 피드 조각                                                    */
/* ------------------------------------------------------------------ */

function cardHtml(work, rank) {
  return `
    <article class="card">
      <a href="#/work/${encodeSeg(work.id)}">
        <div class="card__thumb">
          <span class="card__badge">${badge(work.status)}</span>
          <span>${esc(work.thumbnail)}</span>
          ${rank ? `<span class="rank-num">${rank}위</span>` : ''}
        </div>
        <div class="card__body">
          <h3 class="card__title">${esc(work.title)}</h3>
          <div class="card__meta">
            <span>${esc(work.authorName)}</span>
            <span>· ${esc(work.genre)}</span>
          </div>
          <div class="card__meta">
            <span>♥ ${fmt(work.likeCount)}</span>
            <span>👁 ${fmt(work.viewCount)}</span>
            <span>💬 ${fmt(work.commentCount)}</span>
          </div>
        </div>
      </a>
    </article>`;
}

function feedHtml(works, emptyMessage, { ranked = false } = {}) {
  if (!works.length) return `<div class="empty">${esc(emptyMessage)}</div>`;
  return `<div class="feed">${works
    .map((w, i) => cardHtml(w, ranked ? i + 1 : null))
    .join('')}</div>`;
}

/* ------------------------------------------------------------------ */
/* 피드 화면들                                                         */
/* ------------------------------------------------------------------ */

function viewHome() {
  const serial = db.getWorks({ status: STATUS.SERIAL, sort: 'score' });
  const best = db.getWorks({ status: STATUS.BEST, sort: 'score' });
  const challenge = db.getWorks({ status: STATUS.CHALLENGE, sort: 'latest' });
  const top = db.getRanking(5);

  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>정식연재</h2>
        <p>고정 연재 슬롯을 받은 작품</p>
      </div>
    </div>
    ${feedHtml(serial, '아직 정식연재 작품이 없어요.')}

    <div class="section-head">
      <div>
        <h2>베스트도전</h2>
        <p>추천 피드까지 올라온 작품</p>
      </div>
    </div>
    ${feedHtml(best, '아직 베스트도전 작품이 없어요.')}

    <div class="section-head">
      <div>
        <h2>오늘의 랭킹</h2>
        <p>score = 조회수 + 좋아요×5 + 댓글×10</p>
      </div>
      <a href="#/ranking">전체 보기 →</a>
    </div>
    ${feedHtml(top, '작품이 없어요.', { ranked: true })}

    <div class="section-head">
      <div>
        <h2>도전 신작</h2>
        <p>방금 올라온 작품들</p>
      </div>
    </div>
    ${feedHtml(challenge, '아직 도전 작품이 없어요. 첫 작품을 올려보세요!')}`;
}

function viewGenre(route) {
  const genre = route.genre;
  const works = db.getWorks({ genre, sort: 'score' });
  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>${esc(genre)}</h2>
        <p>${fmt(works.length)}개 작품 · 점수 높은 순</p>
      </div>
    </div>
    ${feedHtml(works, `${genre} 장르에는 아직 작품이 없어요.`)}`;
}

function viewSearch(route) {
  const q = route.query.q || '';
  const works = db.getWorks({ q, sort: 'score' });
  document.getElementById('search-input').value = q;

  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>"${esc(q)}" 검색 결과</h2>
        <p>${fmt(works.length)}개 작품</p>
      </div>
    </div>
    ${feedHtml(works, '검색 결과가 없어요. 다른 단어로 찾아보세요.')}`;
}

function viewRanking() {
  const works = db.getRanking(30);
  const rules = activeRules();

  app.innerHTML = `
    <div class="section-head">
      <div>
        <h2>🏆 종합 랭킹</h2>
        <p>
          score = 조회수 × 1 + 좋아요 × 5 + 댓글 × 10 ·
          베스트도전 ${fmt(rules.bestChallenge.minScore)}점 / 정식연재 ${fmt(
            rules.serialization.minScore
          )}점
        </p>
      </div>
    </div>
    ${feedHtml(works, '작품이 없어요.', { ranked: true })}`;
}

/* ------------------------------------------------------------------ */
/* 작품 상세                                                           */
/* ------------------------------------------------------------------ */

function viewWork(route) {
  const work = db.getWorkById(route.workId);
  if (!work) return viewNotFound('작품을 찾을 수 없어요.');

  const episodes = db.getEpisodes(work.id);
  const liked = db.hasLiked(work.id);
  const user = db.getCurrentUser();
  const isAuthor = user && user.id === work.authorId;
  const progress = promotionProgress(work);
  const first = episodes[0];

  app.innerHTML = `
    <section class="work-hero">
      <div class="work-hero__thumb">${esc(work.thumbnail)}</div>
      <div>
        ${badge(work.status)}
        <h1>${esc(work.title)}</h1>
        <p class="work-hero__author">${esc(work.authorName)} · ${esc(work.genre)} · ${esc(
          timeAgo(work.createdAt)
        )}</p>
        <p class="work-hero__synopsis">${esc(work.synopsis || '소개글이 없습니다.')}</p>
      </div>
    </section>

    <div class="stats">
      <div class="stat"><span class="stat__label">조회수</span><span class="stat__value">${fmt(
        work.viewCount
      )}</span></div>
      <div class="stat"><span class="stat__label">좋아요</span><span class="stat__value">${fmt(
        work.likeCount
      )}</span></div>
      <div class="stat"><span class="stat__label">댓글</span><span class="stat__value">${fmt(
        work.commentCount
      )}</span></div>
      <div class="stat"><span class="stat__label">회차</span><span class="stat__value">${fmt(
        work.episodeCount
      )}</span></div>
      <div class="stat"><span class="stat__label">score</span><span class="stat__value">${fmt(
        work.score
      )}</span></div>
    </div>

    <div class="actions">
      ${
        first
          ? `<a class="btn btn--primary" href="#/work/${encodeSeg(work.id)}/ep/${
              first.episodeNumber
            }">1화 보기</a>`
          : ''
      }
      <button class="btn like-btn ${liked ? 'is-liked' : ''}" data-action="like" data-work="${esc(
        work.id
      )}">
        ${liked ? '♥ 좋아요 취소' : '♡ 좋아요'} ${fmt(work.likeCount)}
      </button>
      <button class="btn" data-action="share">🔗 공유</button>
      ${
        isAuthor
          ? `<a class="btn" href="#/work/${encodeSeg(work.id)}/new-episode">＋ 회차 등록</a>`
          : ''
      }
    </div>

    ${promoHtml(work, progress)}

    <div class="section-head">
      <div>
        <h2>회차 목록</h2>
        <p>${fmt(episodes.length)}화</p>
      </div>
    </div>
    ${
      episodes.length
        ? `<ul class="ep-list">${episodes
            .slice()
            .reverse()
            .map(
              (ep) => `
        <li class="ep-item">
          <a href="#/work/${encodeSeg(work.id)}/ep/${ep.episodeNumber}">
            <span class="ep-item__no">${ep.episodeNumber}화</span>
            <span class="ep-item__title">${esc(ep.title)}</span>
            <span class="ep-item__meta">👁 ${fmt(ep.viewCount)} · ${esc(
                timeAgo(ep.createdAt)
              )}</span>
          </a>
        </li>`
            )
            .join('')}</ul>`
        : `<div class="empty">아직 등록된 회차가 없어요.</div>`
    }

    ${devBoxHtml(work, isAuthor)}`;
}

function promoHtml(work, progress) {
  if (!progress) {
    return `<div class="promo"><div class="promo__head"><span>정식연재 작품입니다. 고정 연재 슬롯을 배정받았어요.</span><strong>🎉</strong></div></div>`;
  }
  if (progress.waitingForAdmin) {
    return `<div class="promo">
      <div class="promo__head">
        <span>승급 조건을 모두 채웠어요. 관리자 검수(퀄리티·표절 확인)를 기다리는 중입니다.</span>
        <strong>대기</strong>
      </div>
    </div>`;
  }
  return `<div class="promo">
    <div class="promo__head">
      <span>다음 단계까지</span>
      <strong>${esc(progress.nextStatus)}</strong>
    </div>
    ${progress.items
      .map(
        (item) => `
      <div class="promo__row">
        <div class="promo__label">
          <span>${esc(item.label)}</span>
          <span>${fmt(item.current)} / ${fmt(item.target)}</span>
        </div>
        <div class="track">
          <div class="track__fill ${item.ratio >= 1 ? 'is-done' : ''}" style="width:${(
          item.ratio * 100
        ).toFixed(1)}%"></div>
        </div>
      </div>`
      )
      .join('')}
  </div>`;
}

/** 승급 로직을 눈으로 확인하려면 숫자를 밀어올릴 수단이 필요하다. 학습용 도구. */
function devBoxHtml(work, isAuthor) {
  if (!isAuthor) return '';
  return `
    <div class="devbox">
      <h3>🛠 개발자 도구 (내 작품에만 보임)</h3>
      <p>
        승급 로직 테스트용입니다. 지금 기준은 <b>${esc(
          getRulesMode() === 'dev' ? '테스트 모드' : '실제 수치'
        )}</b> — 푸터에서 바꿀 수 있어요.
        정식연재는 조건을 다 채워도 관리자 승인이 있어야 확정됩니다.
      </p>
      <div class="devbox__row">
        <button class="btn btn--sm" data-action="bump" data-work="${esc(
          work.id
        )}">조회수 +100</button>
        <button class="btn btn--sm" data-action="approve" data-work="${esc(work.id)}">
          ${work.adminApproved ? '관리자 승인 취소' : '관리자 승인'}
        </button>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* 에피소드 뷰어                                                       */
/* ------------------------------------------------------------------ */

function viewEpisode(route) {
  const work = db.getWorkById(route.workId);
  if (!work) return viewNotFound('작품을 찾을 수 없어요.');

  const episode = db.getEpisode(work.id, route.episodeNumber);
  if (!episode) return viewNotFound('회차를 찾을 수 없어요.');

  // 조회수 기록 후에 화면을 그려야 방금 본 것까지 숫자에 반영된다.
  const before = work.status;
  db.recordView(episode.id);
  notifyPromotion(work.id, before);

  const episodes = db.getEpisodes(work.id);
  const index = episodes.findIndex((e) => e.id === episode.id);
  const prev = episodes[index - 1];
  const next = episodes[index + 1];
  const fresh = db.getWorkById(work.id);
  const liked = db.hasLiked(work.id);

  app.innerHTML = `
    <div class="viewer__top">
      <div>
        <a class="viewer__crumb" href="#/work/${encodeSeg(work.id)}">← ${esc(work.title)}</a>
        <h1>${episode.episodeNumber}화 ${esc(episode.title)}</h1>
      </div>
      ${badge(fresh.status)}
    </div>

    <div class="stage">
      <div class="stage__placeholder">
        ${
          // 저장할 때 검사하지만, localStorage는 사용자가 직접 고칠 수 있으니
          // 화면에 그릴 때 한 번 더 확인한다. (javascript: 링크 차단)
          episode.contentUrl && db.isSafeUrl(episode.contentUrl)
            ? `AI 아바타 드라마 영상<br /><a class="viewer__crumb" href="${esc(
                episode.contentUrl
              )}" target="_blank" rel="noopener noreferrer">영상 링크 열기 ↗</a>`
            : 'AI 아바타 영상 자리<br />(실제 영상 생성은 MVP 범위 제외 — 지금은 대본만)'
        }
      </div>
      <p class="stage__script">${esc(episode.script || '대본이 등록되지 않았습니다.')}</p>
    </div>

    <div class="actions">
      <button class="btn like-btn ${liked ? 'is-liked' : ''}" data-action="like" data-work="${esc(
        work.id
      )}">
        ${liked ? '♥ 좋아요 취소' : '♡ 좋아요'} ${fmt(fresh.likeCount)}
      </button>
      <button class="btn" data-action="share">🔗 공유</button>
    </div>

    <div class="viewer__nav">
      ${
        prev
          ? `<a class="btn" href="#/work/${encodeSeg(work.id)}/ep/${prev.episodeNumber}">← 이전화</a>`
          : `<button class="btn" disabled>← 이전화</button>`
      }
      ${
        next
          ? `<a class="btn" href="#/work/${encodeSeg(work.id)}/ep/${next.episodeNumber}">다음화 →</a>`
          : `<button class="btn" disabled>다음화 →</button>`
      }
    </div>

    <div class="section-head">
      <div>
        <h2>댓글</h2>
        <p>이 회차에 달린 댓글 ${fmt(db.getComments(episode.id).length)}개</p>
      </div>
    </div>

    <form class="comment-form" data-action="comment" data-episode="${esc(episode.id)}">
      <textarea
        name="content"
        maxlength="300"
        placeholder="${db.getCurrentUser() ? '댓글을 입력하세요 (2~300자)' : '로그인하면 댓글을 쓸 수 있어요'}"
      ></textarea>
      <p class="form-error" data-role="error"></p>
      <button class="btn btn--primary" type="submit">등록</button>
    </form>

    ${commentListHtml(episode.id)}`;
}

function commentListHtml(episodeId) {
  const comments = db.getComments(episodeId);
  const user = db.getCurrentUser();
  if (!comments.length) return `<div class="empty">첫 댓글을 남겨보세요.</div>`;

  return `<ul class="comment-list">${comments
    .map(
      (c) => `
    <li class="comment">
      <div class="comment__head">
        <span class="comment__name">${esc(c.authorName)}</span>
        <span class="comment__time">${esc(timeAgo(c.createdAt))}</span>
        ${
          user && user.id === c.userId
            ? `<button class="comment__del" data-action="delete-comment" data-comment="${esc(
                c.id
              )}">삭제</button>`
            : ''
        }
      </div>
      <p class="comment__body">${esc(c.content)}</p>
    </li>`
    )
    .join('')}</ul>`;
}

/* ------------------------------------------------------------------ */
/* 인증 화면                                                           */
/* ------------------------------------------------------------------ */

function viewLogin(route) {
  const next = route.query.next || '#/';
  app.innerHTML = `
    <div class="panel">
      <h1>로그인</h1>
      <p class="panel__sub">좋아요, 댓글, 업로드는 로그인 후에 할 수 있어요.</p>
      <form data-action="login" data-next="${esc(next)}">
        <div class="form-row">
          <label for="login-email">이메일</label>
          <input id="login-email" name="email" type="email" autocomplete="email" required />
        </div>
        <div class="form-row">
          <label for="login-password">비밀번호</label>
          <input id="login-password" name="password" type="password" autocomplete="current-password" required />
        </div>
        <p class="form-error" data-role="error"></p>
        <button class="btn btn--primary btn--block" type="submit">로그인</button>
      </form>
      <p class="panel__foot">
        계정이 없나요? <a href="#/signup">회원가입</a><br />
        <span style="font-size:12px">데모 계정: k@example.com / demo1234</span>
      </p>
    </div>`;
}

function viewSignup(route) {
  const next = route.query.next || '#/';
  app.innerHTML = `
    <div class="panel">
      <h1>회원가입</h1>
      <p class="panel__sub">내 AI 드라마를 올리려면 계정이 필요해요.</p>
      <form data-action="signup" data-next="${esc(next)}">
        <div class="form-row">
          <label for="signup-username">닉네임</label>
          <input id="signup-username" name="username" type="text" maxlength="20" required />
        </div>
        <div class="form-row">
          <label for="signup-email">이메일</label>
          <input id="signup-email" name="email" type="email" autocomplete="email" required />
        </div>
        <div class="form-row">
          <label for="signup-password">비밀번호 (6자 이상)</label>
          <input id="signup-password" name="password" type="password" autocomplete="new-password" required />
        </div>
        <p class="form-error" data-role="error"></p>
        <button class="btn btn--primary btn--block" type="submit">가입하고 시작</button>
      </form>
      <p class="panel__foot">
        이미 계정이 있나요? <a href="#/login">로그인</a><br />
        <span style="font-size:12px">
          공부용이라 비밀번호가 브라우저에 그대로 남습니다. 실제로 쓰는 비밀번호는 넣지 마세요.
        </span>
      </p>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* 마이페이지                                                          */
/* ------------------------------------------------------------------ */

function viewMyPage(route) {
  if (!requireLogin('마이페이지는 로그인 후에 볼 수 있어요.')) return;

  const user = db.getCurrentUser();
  const tab = route.query.tab === 'liked' ? 'liked' : 'mine';
  const works = tab === 'liked' ? db.getLikedWorks(user.id) : db.getMyWorks(user.id);

  app.innerHTML = `
    <div class="profile">
      <div class="avatar">${esc(user.username.slice(0, 1))}</div>
      <div>
        <p class="profile__name">${esc(user.username)}</p>
        <p class="profile__email">${esc(user.email)}</p>
      </div>
      <a class="btn btn--primary btn--sm" href="#/upload" style="margin-left:auto">＋ 작품 등록</a>
    </div>

    <div class="tabs">
      <button class="tab ${tab === 'mine' ? 'is-active' : ''}" data-action="tab" data-tab="mine">
        내 작품 ${fmt(db.getMyWorks(user.id).length)}
      </button>
      <button class="tab ${tab === 'liked' ? 'is-active' : ''}" data-action="tab" data-tab="liked">
        좋아요한 작품 ${fmt(db.getLikedWorks(user.id).length)}
      </button>
    </div>

    ${feedHtml(
      works,
      tab === 'liked' ? '좋아요한 작품이 아직 없어요.' : '아직 등록한 작품이 없어요.'
    )}`;
}

/* ------------------------------------------------------------------ */
/* 업로드                                                              */
/* ------------------------------------------------------------------ */

const THUMBS = ['🎬', '💔', '🕵️', '🐉', '🏪', '🛰️', '🎤', '🏃', '👻', '🌙', '🔥', '🧊'];

function viewUpload() {
  if (!requireLogin('업로드는 로그인 후에 할 수 있어요.')) return;

  app.innerHTML = `
    <div class="panel panel--wide">
      <h1>작품 등록</h1>
      <p class="panel__sub">등록하면 <b>도전</b> 상태로 시작합니다. 회차는 등록 후에 추가해요.</p>
      <form data-action="create-work">
        <div class="form-row">
          <label for="work-title">제목</label>
          <input id="work-title" name="title" type="text" maxlength="60" required />
        </div>
        <div class="form-row">
          <label for="work-genre">장르</label>
          <select id="work-genre" name="genre" required>
            <option value="">장르를 선택하세요</option>
            ${GENRES.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('')}
          </select>
        </div>
        <div class="form-row">
          <label for="work-synopsis">소개 (500자 이내)</label>
          <textarea id="work-synopsis" name="synopsis" maxlength="500"></textarea>
        </div>
        <div class="form-row">
          <label>대표 이미지</label>
          <div class="emoji-picker" data-role="thumb-picker">
            ${THUMBS.map(
              (t, i) =>
                `<button type="button" class="${i === 0 ? 'is-active' : ''}" data-thumb="${esc(
                  t
                )}">${esc(t)}</button>`
            ).join('')}
          </div>
          <p class="form-hint">MVP에서는 이미지 업로드 대신 이모지로 대신합니다.</p>
        </div>
        <p class="form-error" data-role="error"></p>
        <button class="btn btn--primary btn--block" type="submit">등록하기</button>
      </form>
    </div>`;
}

function viewNewEpisode(route) {
  if (!requireLogin('회차 등록은 로그인 후에 할 수 있어요.')) return;

  const work = db.getWorkById(route.workId);
  if (!work) return viewNotFound('작품을 찾을 수 없어요.');

  const user = db.getCurrentUser();
  if (work.authorId !== user.id) return viewNotFound('내 작품에만 회차를 올릴 수 있어요.');

  app.innerHTML = `
    <div class="panel panel--wide">
      <h1>${esc(work.title)} — ${work.episodeCount + 1}화 등록</h1>
      <p class="panel__sub">회차가 늘면 승급 조건을 다시 계산합니다.</p>
      <form data-action="create-episode" data-work="${esc(work.id)}">
        <div class="form-row">
          <label for="ep-title">회차 제목</label>
          <input id="ep-title" name="title" type="text" maxlength="60" required />
        </div>
        <div class="form-row">
          <label for="ep-url">영상 링크 (선택)</label>
          <input id="ep-url" name="contentUrl" type="url" placeholder="https://" />
          <p class="form-hint">http:// 또는 https:// 링크만 허용합니다.</p>
        </div>
        <div class="form-row">
          <label for="ep-script">대본 / 본편 내용</label>
          <textarea id="ep-script" name="script" maxlength="2000" style="min-height:180px"></textarea>
        </div>
        <p class="form-error" data-role="error"></p>
        <button class="btn btn--primary btn--block" type="submit">회차 등록</button>
      </form>
    </div>`;
}

function viewNotFound(message = '페이지를 찾을 수 없어요.') {
  app.innerHTML = `
    <div class="empty">
      ${esc(message)}<br /><br />
      <a class="btn btn--sm" href="#/">홈으로</a>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* 이벤트 처리 (이벤트 위임)                                           */
/* ------------------------------------------------------------------ */

/** 액션 전후로 상태가 바뀌었으면 토스트로 알려준다. */
function notifyPromotion(workId, beforeStatus) {
  const after = db.getWorkById(workId);
  if (!after || after.status === beforeStatus) return;
  if (after.status === STATUS.PENDING) {
    toast('승급 조건 달성! 관리자 승인을 기다립니다.', 'good');
  } else {
    toast(`🎉 ${after.status} 승급!`, 'good');
  }
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || target.tagName === 'FORM') return;

  const action = target.dataset.action;

  if (action === 'logout') {
    db.logout();
    toast('로그아웃했어요.');
    go('#/');
    return;
  }

  if (action === 'like') {
    const workId = target.dataset.work;
    const before = db.getWorkById(workId)?.status;
    const result = db.toggleLike(workId);
    if (!result.ok) {
      if (result.error === 'AUTH_REQUIRED') requireLogin('좋아요는 로그인 후에 누를 수 있어요.');
      else toast(result.error, 'bad');
      return;
    }
    toast(result.liked ? '♥ 좋아요!' : '좋아요를 취소했어요.');
    render();
    notifyPromotion(workId, before);
    return;
  }

  if (action === 'share') {
    const url = location.href;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(url)
        .then(() => toast('링크를 복사했어요.', 'good'))
        .catch(() => toast(url));
    } else {
      toast(url);
    }
    return;
  }

  if (action === 'delete-comment') {
    const result = db.deleteComment(target.dataset.comment);
    if (!result.ok) {
      toast(result.error, 'bad');
      return;
    }
    toast('댓글을 삭제했어요.');
    render();
    return;
  }

  if (action === 'tab') {
    location.hash = `#/mypage?tab=${target.dataset.tab}`;
    return;
  }

  if (action === 'bump') {
    const workId = target.dataset.work;
    const before = db.getWorkById(workId)?.status;
    db.bumpViews(workId, 100);
    render();
    notifyPromotion(workId, before);
    toast('조회수를 100 올렸어요.');
    return;
  }

  if (action === 'approve') {
    const workId = target.dataset.work;
    const work = db.getWorkById(workId);
    const before = work.status;
    db.setAdminApproved(workId, !work.adminApproved);
    render();
    notifyPromotion(workId, before);
    if (db.getWorkById(workId).status !== STATUS.SERIAL) {
      toast(
        work.adminApproved
          ? '승인을 취소했어요.'
          : '승인했어요. 나머지 조건을 채우면 정식연재가 됩니다.'
      );
    }
    return;
  }
});

/** 썸네일 이모지 선택 (업로드 폼) */
document.addEventListener('click', (event) => {
  const picker = event.target.closest('[data-role="thumb-picker"]');
  if (!picker) return;
  const button = event.target.closest('button[data-thumb]');
  if (!button) return;
  picker.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
  button.classList.add('is-active');
});

document.addEventListener('submit', (event) => {
  const form = event.target;

  // 헤더 검색
  if (form.id === 'search-form') {
    event.preventDefault();
    const q = document.getElementById('search-input').value.trim();
    if (!q) return go('#/');
    return go(`#/search?q=${encodeURIComponent(q)}`);
  }

  const action = form.dataset.action;
  if (!action) return;
  event.preventDefault();

  const errorEl = form.querySelector('[data-role="error"]');
  const showError = (message) => {
    if (errorEl) errorEl.textContent = message;
    else toast(message, 'bad');
  };
  if (errorEl) errorEl.textContent = '';

  const values = Object.fromEntries(new FormData(form));

  if (action === 'login') {
    const result = db.login(values);
    if (!result.ok) return showError(result.error);
    toast(`${result.user.username}님 환영해요!`, 'good');
    return go(form.dataset.next || '#/');
  }

  if (action === 'signup') {
    const result = db.signup(values);
    if (!result.ok) return showError(result.error);
    toast('가입 완료! 첫 작품을 올려보세요.', 'good');
    return go(form.dataset.next || '#/');
  }

  if (action === 'comment') {
    const episodeId = form.dataset.episode;
    const episode = db.getEpisodeById(episodeId);
    const before = episode ? db.getWorkById(episode.workId)?.status : null;

    const result = db.addComment(episodeId, values.content);
    if (!result.ok) {
      if (result.error === 'AUTH_REQUIRED') requireLogin('댓글은 로그인 후에 쓸 수 있어요.');
      else showError(result.error);
      return;
    }
    render();
    if (episode) notifyPromotion(episode.workId, before);
    toast('댓글을 등록했어요.', 'good');
    return;
  }

  if (action === 'create-work') {
    const picked = form.querySelector('[data-role="thumb-picker"] .is-active');
    const result = db.createWork({ ...values, thumbnail: picked?.dataset.thumb || '🎬' });
    if (!result.ok) return showError(result.error);
    toast('작품을 등록했어요. 이제 1화를 올려보세요!', 'good');
    return go(`#/work/${encodeSeg(result.work.id)}/new-episode`);
  }

  if (action === 'create-episode') {
    const workId = form.dataset.work;
    const before = db.getWorkById(workId)?.status;
    const result = db.createEpisode({ workId, ...values });
    if (!result.ok) return showError(result.error);
    go(`#/work/${encodeSeg(workId)}/ep/${result.episode.episodeNumber}`);
    notifyPromotion(workId, before);
    toast(`${result.episode.episodeNumber}화를 등록했어요.`, 'good');
    return;
  }
});

/* 푸터 도구 */
const devToggle = document.getElementById('dev-mode-toggle');
devToggle.checked = getRulesMode() === 'dev';
devToggle.addEventListener('change', () => {
  setRulesMode(devToggle.checked ? 'dev' : 'prod');
  const rules = activeRules();
  toast(
    `${devToggle.checked ? '테스트 모드' : '실제 수치'}: 베스트도전 ${
      rules.bestChallenge.minScore
    }점 / ${rules.bestChallenge.minEpisodes}화`,
    'good'
  );
  render();
});

document.getElementById('reset-data').addEventListener('click', () => {
  if (!confirm('저장된 작품·댓글·계정을 모두 지우고 예시 데이터로 돌립니다. 계속할까요?')) return;
  db.resetData();
  toast('데이터를 초기화했어요.');
  go('#/');
});

/* ------------------------------------------------------------------ */
/* 시작                                                                */
/* ------------------------------------------------------------------ */

window.addEventListener('hashchange', render);
db.seed();
render();

// 콘솔에서 만져볼 수 있게 열어둔다 (학습용).
window.adp = { db, calculateScore };
