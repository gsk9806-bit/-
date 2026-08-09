// data.js
// localStorage 저장소 계층 (Week4).
// Week8에 이 파일이 services/worksService.js + services/authService.js 로 바뀐다.
// 그때 컴포넌트 코드를 안 고치려면, 여기 함수 이름과 반환값 모양을 그대로 유지해야 한다.
// (Firebase로 가면 대부분 async가 되니, 호출부에서는 지금도 await를 붙여도 문제없게 두는 편이 편하다.)

import { STATUS, calculateScore, checkPromotion } from './promotion.js';

const KEYS = {
  users: 'adp.users',
  works: 'adp.works',
  episodes: 'adp.episodes',
  likes: 'adp.likes',
  comments: 'adp.comments',
  session: 'adp.session',
  viewed: 'adp.viewed',
  seeded: 'adp.seeded',
};

export const GENRES = ['로맨스', '스릴러', '판타지', '코미디', 'SF', '일상', '액션'];

/* ------------------------------------------------------------------ */
/* 저장소 기본 도구                                                    */
/* ------------------------------------------------------------------ */

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    // 저장된 JSON이 깨졌을 때 앱 전체가 죽지 않도록 막아둔다.
    console.warn('저장소 읽기 실패:', key, e);
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function now() {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/* 인증 (Week9에 Firebase Auth로 교체)                                 */
/* ------------------------------------------------------------------ */

// 주의: 아래 해시는 암호학적으로 안전하지 않다. 브라우저 localStorage에
// 비밀번호를 안전하게 저장하는 방법은 애초에 없다. 실제 인증은 Week8~9에
// Firebase Auth로 넘기고, 이건 로그인 게이트 UI를 만들어보기 위한 흉내다.
function weakHash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return `demo$${h.toString(36)}`;
}

export function getUsers() {
  return read(KEYS.users, []);
}

export function getCurrentUser() {
  const id = read(KEYS.session, null);
  if (!id) return null;
  return getUsers().find((u) => u.id === id) || null;
}

export function signup({ username, email, password }) {
  const name = (username || '').trim();
  const mail = (email || '').trim().toLowerCase();

  if (name.length < 2) return { ok: false, error: '닉네임은 2자 이상이어야 해요.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return { ok: false, error: '이메일 형식을 확인해주세요.' };
  if ((password || '').length < 6) return { ok: false, error: '비밀번호는 6자 이상이어야 해요.' };

  const users = getUsers();
  if (users.some((u) => u.email === mail)) {
    return { ok: false, error: '이미 가입된 이메일이에요.' };
  }

  const user = {
    id: uid('u'),
    username: name,
    email: mail,
    passwordHash: weakHash(password),
    createdAt: now(),
  };
  users.push(user);
  write(KEYS.users, users);
  write(KEYS.session, user.id);
  return { ok: true, user };
}

export function login({ email, password }) {
  const mail = (email || '').trim().toLowerCase();
  const user = getUsers().find((u) => u.email === mail);
  if (!user || user.passwordHash !== weakHash(password || '')) {
    // 어느 쪽이 틀렸는지 알려주지 않는다. 이메일 존재 여부가 새는 걸 막기 위해.
    return { ok: false, error: '이메일 또는 비밀번호가 맞지 않아요.' };
  }
  write(KEYS.session, user.id);
  return { ok: true, user };
}

export function logout() {
  localStorage.removeItem(KEYS.session);
}

export function getUserById(id) {
  return getUsers().find((u) => u.id === id) || null;
}

/* ------------------------------------------------------------------ */
/* 작품 / 회차 조회                                                    */
/* ------------------------------------------------------------------ */

function rawWorks() {
  return read(KEYS.works, []);
}

function rawEpisodes() {
  return read(KEYS.episodes, []);
}

/**
 * 저장된 work 레코드에 화면에서 필요한 값들을 붙여서 돌려준다.
 * episodeCount / commentCount 는 매번 세고, viewCount / likeCount 는
 * works 레코드에 캐시해둔 값을 그대로 쓴다 (랭킹 페이지 성능 때문에).
 */
export function decorate(work) {
  if (!work) return null;
  const episodes = rawEpisodes().filter((e) => e.workId === work.id);
  const episodeIds = new Set(episodes.map((e) => e.id));
  const commentCount = read(KEYS.comments, []).filter((c) => episodeIds.has(c.episodeId)).length;
  const author = getUserById(work.authorId);

  const view = {
    ...work,
    episodeCount: episodes.length,
    commentCount,
    authorName: author ? author.username : '알 수 없는 작가',
  };
  view.score = calculateScore(view);
  return view;
}

/**
 * 피드 / 검색 / 랭킹이 모두 이 함수 하나를 쓴다.
 * @param {{genre?: string, status?: string, q?: string, sort?: 'latest'|'score'|'likes'}} options
 */
export function getWorks(options = {}) {
  const { genre, status, q, sort = 'latest' } = options;
  let list = rawWorks().map(decorate);

  if (genre && genre !== '전체') list = list.filter((w) => w.genre === genre);
  if (status) list = list.filter((w) => w.status === status);

  if (q && q.trim()) {
    const needle = q.trim().toLowerCase();
    list = list.filter(
      (w) =>
        w.title.toLowerCase().includes(needle) ||
        w.synopsis.toLowerCase().includes(needle) ||
        w.authorName.toLowerCase().includes(needle)
    );
  }

  if (sort === 'score') list.sort((a, b) => b.score - a.score);
  else if (sort === 'likes') list.sort((a, b) => b.likeCount - a.likeCount);
  else list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return list;
}

export function getWorkById(id) {
  return decorate(rawWorks().find((w) => w.id === id));
}

export function getMyWorks(userId) {
  return getWorks().filter((w) => w.authorId === userId);
}

export function getLikedWorks(userId) {
  const likedIds = new Set(
    read(KEYS.likes, [])
      .filter((l) => l.userId === userId)
      .map((l) => l.workId)
  );
  return getWorks().filter((w) => likedIds.has(w.id));
}

export function getEpisodes(workId) {
  return rawEpisodes()
    .filter((e) => e.workId === workId)
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
}

export function getEpisodeById(episodeId) {
  return rawEpisodes().find((e) => e.id === episodeId) || null;
}

export function getEpisode(workId, episodeNumber) {
  return getEpisodes(workId).find((e) => e.episodeNumber === Number(episodeNumber)) || null;
}

export function getRanking(limit = 20) {
  return getWorks({ sort: 'score' }).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* 작품 / 회차 등록                                                    */
/* ------------------------------------------------------------------ */

export function createWork({ title, genre, synopsis, thumbnail }) {
  const user = getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };

  const t = (title || '').trim();
  if (t.length < 2) return { ok: false, error: '제목을 2자 이상 입력해주세요.' };
  if (!GENRES.includes(genre)) return { ok: false, error: '장르를 선택해주세요.' };

  const work = {
    id: uid('w'),
    authorId: user.id,
    title: t,
    genre,
    synopsis: (synopsis || '').trim().slice(0, 500),
    thumbnail: thumbnail || '🎬',
    status: STATUS.CHALLENGE, // 새 작품은 무조건 도전부터 시작한다.
    adminApproved: false,
    viewCount: 0,
    likeCount: 0,
    createdAt: now(),
  };

  const works = rawWorks();
  works.push(work);
  write(KEYS.works, works);
  return { ok: true, work: decorate(work) };
}

/**
 * 회차 등록. content_url 은 유저 입력이라 그대로 믿으면 안 된다.
 * javascript: 같은 스킴이 링크/iframe에 들어가면 XSS가 되므로 http(s)만 허용한다.
 */
export function createEpisode({ workId, title, contentUrl, script }) {
  const user = getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };

  const work = rawWorks().find((w) => w.id === workId);
  if (!work) return { ok: false, error: '작품을 찾을 수 없어요.' };
  if (work.authorId !== user.id) return { ok: false, error: '내 작품에만 회차를 올릴 수 있어요.' };

  const t = (title || '').trim();
  if (t.length < 1) return { ok: false, error: '회차 제목을 입력해주세요.' };

  const url = (contentUrl || '').trim();
  if (url && !isSafeUrl(url)) {
    return { ok: false, error: '영상 링크는 http:// 또는 https:// 로 시작해야 해요.' };
  }

  const existing = getEpisodes(workId);
  const episode = {
    id: uid('e'),
    workId,
    episodeNumber: existing.length ? existing[existing.length - 1].episodeNumber + 1 : 1,
    title: t,
    contentUrl: url,
    script: (script || '').trim().slice(0, 2000),
    viewCount: 0,
    createdAt: now(),
  };

  const episodes = rawEpisodes();
  episodes.push(episode);
  write(KEYS.episodes, episodes);

  // 회차가 늘면 승급 조건이 달라지므로 다시 판정한다.
  applyPromotion(workId);
  return { ok: true, episode };
}

export function isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 소셜 액션 (좋아요 / 댓글 / 조회수)                                  */
/* ------------------------------------------------------------------ */

export function hasLiked(workId) {
  const user = getCurrentUser();
  if (!user) return false;
  return read(KEYS.likes, []).some((l) => l.userId === user.id && l.workId === workId);
}

/**
 * 좋아요 토글. (userId, workId) 조합이 유니크해야 하므로 넣기 전에 항상 찾아본다.
 * Week8 Firebase에서는 문서 ID를 `${userId}_${workId}` 로 잡아서 DB가 막아주게 한다.
 */
export function toggleLike(workId) {
  const user = getCurrentUser();
  if (!user) return { ok: false, error: 'AUTH_REQUIRED' };

  const works = rawWorks();
  const work = works.find((w) => w.id === workId);
  if (!work) return { ok: false, error: '작품을 찾을 수 없어요.' };

  const likes = read(KEYS.likes, []);
  const index = likes.findIndex((l) => l.userId === user.id && l.workId === workId);

  let liked;
  if (index >= 0) {
    likes.splice(index, 1);
    liked = false;
  } else {
    likes.push({ id: uid('l'), userId: user.id, workId, createdAt: now() });
    liked = true;
  }
  write(KEYS.likes, likes);

  // like_count 는 캐시값이라 직접 세서 다시 넣어준다. (셀 대상이 적을 때만 이렇게 해도 된다)
  work.likeCount = likes.filter((l) => l.workId === workId).length;
  write(KEYS.works, works);

  applyPromotion(workId);
  return { ok: true, liked, likeCount: work.likeCount };
}

export function getComments(episodeId) {
  return read(KEYS.comments, [])
    .filter((c) => c.episodeId === episodeId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((c) => {
      const author = getUserById(c.userId);
      return { ...c, authorName: author ? author.username : '탈퇴한 사용자' };
    });
}

const COMMENT_COOLDOWN_MS = 5000; // 도배 방지 (Week6~7 abuse prevention)

export function addComment(episodeId, content) {
  const user = getCurrentUser();
  if (!user) return { ok: false, error: 'AUTH_REQUIRED' };

  const text = (content || '').trim();
  if (text.length < 2) return { ok: false, error: '댓글을 2자 이상 입력해주세요.' };
  if (text.length > 300) return { ok: false, error: '댓글은 300자까지 쓸 수 있어요.' };

  const comments = read(KEYS.comments, []);
  const mine = comments.filter((c) => c.userId === user.id);
  const last = mine[mine.length - 1];
  if (last && Date.now() - new Date(last.createdAt).getTime() < COMMENT_COOLDOWN_MS) {
    return { ok: false, error: '조금 천천히 써주세요. (5초 제한)' };
  }
  if (last && last.content === text) {
    return { ok: false, error: '같은 댓글을 연속으로 쓸 수 없어요.' };
  }

  const comment = { id: uid('c'), userId: user.id, episodeId, content: text, createdAt: now() };
  comments.push(comment);
  write(KEYS.comments, comments);

  const episode = rawEpisodes().find((e) => e.id === episodeId);
  if (episode) applyPromotion(episode.workId);

  return { ok: true, comment };
}

export function deleteComment(commentId) {
  const user = getCurrentUser();
  if (!user) return { ok: false, error: 'AUTH_REQUIRED' };

  const comments = read(KEYS.comments, []);
  const target = comments.find((c) => c.id === commentId);
  if (!target) return { ok: false, error: '댓글을 찾을 수 없어요.' };
  if (target.userId !== user.id) return { ok: false, error: '내 댓글만 지울 수 있어요.' };

  write(
    KEYS.comments,
    comments.filter((c) => c.id !== commentId)
  );
  return { ok: true };
}

/**
 * 조회수 기록. 같은 회차를 새로고침으로 계속 올리는 걸 막기 위해
 * 이미 본 회차는 한 번만 센다. (진짜 방어는 서버에서 해야 한다)
 */
export function recordView(episodeId) {
  const viewed = read(KEYS.viewed, {});
  if (viewed[episodeId]) return { counted: false };

  viewed[episodeId] = now();
  write(KEYS.viewed, viewed);

  const episodes = rawEpisodes();
  const episode = episodes.find((e) => e.id === episodeId);
  if (!episode) return { counted: false };
  episode.viewCount = (episode.viewCount || 0) + 1;
  write(KEYS.episodes, episodes);

  const works = rawWorks();
  const work = works.find((w) => w.id === episode.workId);
  if (work) {
    work.viewCount = (work.viewCount || 0) + 1;
    write(KEYS.works, works);
    applyPromotion(work.id);
  }
  return { counted: true };
}

/* ------------------------------------------------------------------ */
/* 승급 적용                                                           */
/* ------------------------------------------------------------------ */

/**
 * checkPromotion 은 "있어야 할 상태"만 계산하는 순수 함수다.
 * 실제로 저장하는 건 이 함수 하나뿐이라, 좋아요/댓글/조회수 어디서 들어와도
 * 승급 규칙은 한 곳에서만 적용된다.
 * @returns {{promoted: boolean, from?: string, to?: string}}
 */
export function applyPromotion(workId) {
  const works = rawWorks();
  const raw = works.find((w) => w.id === workId);
  if (!raw) return { promoted: false };

  const view = decorate(raw);
  const next = checkPromotion(view);
  if (next === raw.status) return { promoted: false };

  const from = raw.status;
  raw.status = next;
  write(KEYS.works, works);
  return { promoted: true, from, to: next };
}

/** 관리자 승인 (지금은 개발자 도구에서 누른다. Week9에 권한 체크가 붙는다). */
export function setAdminApproved(workId, approved) {
  const works = rawWorks();
  const work = works.find((w) => w.id === workId);
  if (!work) return { ok: false, error: '작품을 찾을 수 없어요.' };
  work.adminApproved = !!approved;
  write(KEYS.works, works);
  applyPromotion(workId);
  return { ok: true };
}

/** 승급 테스트용. 조회수를 한 번에 밀어올린다. */
export function bumpViews(workId, amount = 100) {
  const works = rawWorks();
  const work = works.find((w) => w.id === workId);
  if (!work) return { ok: false };
  work.viewCount = (work.viewCount || 0) + amount;
  write(KEYS.works, works);
  applyPromotion(workId);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* 시드 데이터                                                         */
/* ------------------------------------------------------------------ */

export function resetData() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  seed();
}

/** 처음 접속했을 때 피드가 비어 있으면 화면을 만들 수 없으니 예시 데이터를 넣는다. */
export function seed() {
  if (read(KEYS.seeded, false)) return;

  const makeUser = (username, email) => ({
    id: uid('u'),
    username,
    email,
    passwordHash: weakHash('demo1234'),
    createdAt: now(),
  });

  // 작가 3명 + 좋아요를 누를 시청자들.
  // 시청자를 실제로 만드는 이유: likeCount 는 likes 테이블에서 센 값이어야 한다.
  // 숫자만 크게 적어두면, 누군가 좋아요를 한 번 누르는 순간 다시 세면서
  // 카운트가 뚝 떨어져버린다 (실제로 그런 버그를 만들어봤다).
  const authors = [
    makeUser('연출가K', 'k@example.com'),
    makeUser('심야작가', 'night@example.com'),
    makeUser('아바타연구소', 'lab@example.com'),
  ];
  const viewers = Array.from({ length: 12 }, (_, i) =>
    makeUser(`시청자${i + 1}`, `viewer${i + 1}@example.com`)
  );
  const demoUsers = [...authors, ...viewers];

  const plan = [
    {
      title: '3분 후 헤어집니다',
      genre: '로맨스',
      thumbnail: '💔',
      synopsis: '이별 통보 3분 전으로 계속 돌아가는 남자. 매번 다른 선택을 해도 결말은 같다.',
      status: STATUS.SERIAL,
      adminApproved: true,
      viewCount: 4210,
      likeUsers: 14,
      episodes: ['1화 3분 전', '2화 두 번째 3분', '3화 같은 카페 다른 대사', '4화 커피가 식기 전에', '5화 마지막 3분'],
    },
    {
      title: '아바타 살인사건',
      genre: '스릴러',
      thumbnail: '🕵️',
      synopsis: 'AI 배우가 연기한 살인 장면이 실제 사건과 똑같았다. 대본을 쓴 사람은 아무도 없다.',
      status: STATUS.BEST,
      viewCount: 1870,
      likeUsers: 11,
      episodes: ['1화 첫 테이크', '2화 대본 없는 씬', '3화 감독의 노트'],
    },
    {
      title: '용사님, 렌더링 중입니다',
      genre: '판타지',
      thumbnail: '🐉',
      synopsis: '마왕을 잡으러 갔더니 아직 모델링이 안 끝났다. 용사는 로딩바 앞에서 기다린다.',
      status: STATUS.BEST,
      viewCount: 1320,
      likeUsers: 9,
      episodes: ['1화 로딩 99%', '2화 폴리곤 마왕'],
    },
    {
      title: '편의점 야간 아바타',
      genre: '일상',
      thumbnail: '🏪',
      synopsis: '새벽 2시 편의점, 손님도 알바도 전부 AI다. 둘은 그걸 모른다.',
      status: STATUS.CHALLENGE,
      viewCount: 320,
      likeUsers: 5,
      episodes: ['1화 삼각김밥 두 개'],
    },
    {
      title: '우주 정비공 일지',
      genre: 'SF',
      thumbnail: '🛰️',
      synopsis: '고장난 위성을 고치러 나간 정비공이 지구에서 온 마지막 메시지를 듣는다.',
      status: STATUS.CHALLENGE,
      viewCount: 210,
      likeUsers: 4,
      episodes: ['1화 산소 12시간', '2화 마지막 교신'],
    },
    {
      title: '내 아바타가 개그를 훔쳤다',
      genre: '코미디',
      thumbnail: '🎤',
      synopsis: '무대에 세운 AI 아바타가 내 개그로 더 웃긴다. 관객은 나를 기억하지 못한다.',
      status: STATUS.CHALLENGE,
      viewCount: 96,
      likeUsers: 2,
      episodes: ['1화 첫 무대'],
    },
    {
      title: '추격 12초',
      genre: '액션',
      thumbnail: '🏃',
      synopsis: '숏폼 하나가 12초. 그 안에 잡히거나 도망쳐야 한다.',
      status: STATUS.CHALLENGE,
      viewCount: 45,
      likeUsers: 1,
      episodes: ['1화 골목'],
    },
  ];

  const works = [];
  const episodes = [];
  const likes = [];
  const comments = [];

  const sampleComments = [
    '연출이 미쳤다... 다음 화 언제요',
    '아바타 표정 처리 어떻게 한 거예요?',
    '12초가 왜 이렇게 길게 느껴지지',
    '이거 정식연재 가야 함',
    '대사 톤이 진짜 사람 같아요',
  ];

  plan.forEach((p, wIndex) => {
    const author = demoUsers[wIndex % demoUsers.length];
    const work = {
      id: uid('w'),
      authorId: author.id,
      title: p.title,
      genre: p.genre,
      synopsis: p.synopsis,
      thumbnail: p.thumbnail,
      status: p.status,
      adminApproved: !!p.adminApproved,
      viewCount: p.viewCount,
      likeCount: 0,
      createdAt: new Date(Date.now() - (plan.length - wIndex) * 86400000).toISOString(),
    };
    works.push(work);

    p.episodes.forEach((title, i) => {
      const ep = {
        id: uid('e'),
        workId: work.id,
        episodeNumber: i + 1,
        title,
        contentUrl: '',
        script: `[${work.title} ${i + 1}화]\n\nAI 아바타 배우가 연기하는 숏폼 장면입니다.\n실제 영상 생성은 MVP 범위에서 제외했고, 지금은 대본만 보여줍니다.\n\n장면: ${work.synopsis}`,
        viewCount: Math.floor(p.viewCount / p.episodes.length),
        createdAt: new Date(Date.now() - (p.episodes.length - i) * 43200000).toISOString(),
      };
      episodes.push(ep);

      // 댓글도 조금 심어둔다. score 계산이 어떻게 움직이는지 보이게.
      const commentCount = wIndex < 3 ? 2 : wIndex < 5 ? 1 : 0;
      for (let c = 0; c < commentCount; c++) {
        comments.push({
          id: uid('c'),
          userId: demoUsers[(wIndex + c + 1) % demoUsers.length].id,
          episodeId: ep.id,
          content: sampleComments[(wIndex + c) % sampleComments.length],
          createdAt: new Date(Date.now() - (c + 1) * 3600000).toISOString(),
        });
      }
    });

    // 좋아요는 (user_id, work_id) 유니크라 한 사람이 한 번씩만 누를 수 있다.
    // 그래서 시드에서도 "누른 사람"을 실제로 만들어서 행을 넣고,
    // likeCount 는 그 행을 센 값으로 맞춘다. 캐시값과 실제 행이 어긋나지 않게.
    demoUsers.slice(0, p.likeUsers).forEach((u) => {
      likes.push({ id: uid('l'), userId: u.id, workId: work.id, createdAt: now() });
    });
    work.likeCount = likes.filter((l) => l.workId === work.id).length;
  });

  write(KEYS.users, demoUsers);
  write(KEYS.works, works);
  write(KEYS.episodes, episodes);
  write(KEYS.likes, likes);
  write(KEYS.comments, comments);
  write(KEYS.seeded, true);
}
