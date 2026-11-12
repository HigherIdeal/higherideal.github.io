/**
 * 오늘의 입장 암호.
 * 이 값만 바꾸면 사이트 전체의 입장 코드가 바뀝니다.
 * 확인은 브라우저에서만 이루어지며, 서버 검사는 없습니다.
 */
export const ENTRY_CODE = "3913";

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 7;

/** PeerJS 공개 중계에서 방장이 차지하는 고정 ID. 암호가 바뀌면 방도 바뀝니다. */
export const ROOM_ID = "hibanghigherideal" + ENTRY_CODE;
