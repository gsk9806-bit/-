// promotion.js
// 점수 계산 + 승급 판정 로직.
// Week6에 React로 옮길 때 이 파일을 그대로 src/utils/ 로 복사하면 된다.
//   PROMOTION_RULES  -> src/utils/constants.js
//   calculateScore   -> src/utils/calculateScore.js
// 함수 이름과 반환값을 바꾸지 않는 것이 목표. 부르는 쪽 코드를 고치지 않기 위해서.

/** 작품 상태값. 문자열을 여기저기 직접 쓰면 오타를 못 잡으니 한곳에 모아둔다. */
export const STATUS = {
  CHALLENGE: '도전',
  BEST: '베스트도전',
  PENDING: '대기(관리자 승인 필요)',
  SERIAL: '정식연재',
};

/** 실제 운영에서 쓸 수치. */
export const PROMOTION_RULES = {
  bestChallenge: { minScore: 300, minEpisodes: 2 },
  serialization: { minScore: 2000, minEpisodes: 5, minAvgLikesPerEp: 20 },
};

/**
 * 개발/테스트용 수치. 혼자 클릭해서 승급까지 확인해보려면 이 정도여야 한다.
 * minAvgLikesPerEp 를 0으로 둔 이유: 좋아요는 (user_id, work_id) 유니크라서
 * 계정 하나로는 작품당 1개밖에 못 누른다. 회차가 2개면 평균이 0.5라서
 * 1로 두면 혼자서는 정식연재까지 절대 도달할 수 없다.
 */
export const DEV_PROMOTION_RULES = {
  bestChallenge: { minScore: 5, minEpisodes: 1 },
  serialization: { minScore: 30, minEpisodes: 2, minAvgLikesPerEp: 0 },
};

const RULES_MODE_KEY = 'adp.rulesMode';

/**
 * 'dev' | 'prod'
 * 기본은 prod(실제 수치). 헤더의 "테스트 모드" 스위치를 켜면 dev 수치로 바뀌어서
 * 혼자 몇 번 클릭하는 것만으로 승급까지 확인할 수 있다.
 */
export function getRulesMode() {
  return localStorage.getItem(RULES_MODE_KEY) === 'dev' ? 'dev' : 'prod';
}

export function setRulesMode(mode) {
  localStorage.setItem(RULES_MODE_KEY, mode === 'dev' ? 'dev' : 'prod');
}

/** 지금 적용 중인 승급 기준. */
export function activeRules() {
  return getRulesMode() === 'dev' ? DEV_PROMOTION_RULES : PROMOTION_RULES;
}

/**
 * score = 조회수 x 1 + 좋아요 x 5 + 댓글 x 10
 * 좋아요/댓글이 조회수보다 귀한 신호이므로 가중치를 더 준다.
 */
export function calculateScore(work) {
  const views = work.viewCount || 0;
  const likes = work.likeCount || 0;
  const comments = work.commentCount || 0;
  return views * 1 + likes * 5 + comments * 10;
}

/** 회차당 평균 좋아요. 회차가 0개면 0. */
export function avgLikesPerEpisode(work) {
  if (!work.episodeCount) return 0;
  return (work.likeCount || 0) / work.episodeCount;
}

/**
 * 다음 상태를 돌려준다. 조건에 못 미치면 현재 상태를 그대로 돌려준다.
 * 즉 이 함수는 "지금 이 작품이 있어야 할 상태"를 계산하는 순수 함수다.
 */
export function checkPromotion(work) {
  const score = calculateScore(work);
  const { bestChallenge, serialization } = activeRules();

  if (
    work.status === STATUS.CHALLENGE &&
    score >= bestChallenge.minScore &&
    work.episodeCount >= bestChallenge.minEpisodes
  ) {
    return STATUS.BEST;
  }

  if (
    work.status === STATUS.BEST &&
    score >= serialization.minScore &&
    work.episodeCount >= serialization.minEpisodes &&
    avgLikesPerEpisode(work) >= serialization.minAvgLikesPerEp
  ) {
    return STATUS.PENDING;
  }

  // 관리자가 승인 도장을 찍으면 대기 -> 정식연재.
  if (work.status === STATUS.PENDING && work.adminApproved) {
    return STATUS.SERIAL;
  }

  return work.status;
}

/**
 * 다음 단계까지 얼마나 남았는지. 상세 페이지 진행바에 쓴다.
 * 반환: { nextStatus, items: [{ label, current, target, ratio }] } | null
 */
export function promotionProgress(work) {
  const rules = activeRules();
  const score = calculateScore(work);

  if (work.status === STATUS.CHALLENGE) {
    return {
      nextStatus: STATUS.BEST,
      items: [
        bar('점수', score, rules.bestChallenge.minScore),
        bar('회차', work.episodeCount, rules.bestChallenge.minEpisodes),
      ],
    };
  }

  if (work.status === STATUS.BEST) {
    return {
      nextStatus: STATUS.SERIAL,
      items: [
        bar('점수', score, rules.serialization.minScore),
        bar('회차', work.episodeCount, rules.serialization.minEpisodes),
        bar(
          '회차당 평균 좋아요',
          Math.round(avgLikesPerEpisode(work) * 10) / 10,
          rules.serialization.minAvgLikesPerEp
        ),
      ],
    };
  }

  if (work.status === STATUS.PENDING) {
    return { nextStatus: STATUS.SERIAL, items: [], waitingForAdmin: true };
  }

  return null; // 정식연재는 더 올라갈 곳이 없다.
}

function bar(label, current, target) {
  const ratio = target === 0 ? 1 : Math.min(current / target, 1);
  return { label, current, target, ratio };
}
