/**
 * 오늘의 입장 암호.
 * 이 값만 바꾸면 사이트 전체의 입장 코드가 바뀝니다.
 * 확인은 브라우저에서만 이루어지며, 서버 검사는 없습니다.
 */
export const ENTRY_CODE = "3913";

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 7;

/**
 * 테스트만 페이지가 뜨기 전에 __BANG_ROOM_ID 를 넣습니다.
 * 실제 중계 방 이름은 암호에서 해시로 만들고, 이 기본 문자열은 중계에 그대로 올리지 않습니다.
 */
const roomOverride = typeof globalThis.__BANG_ROOM_ID === "string" ? globalThis.__BANG_ROOM_ID : "";
export const ROOM_ID = /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/.test(roomOverride)
  ? roomOverride
  : "hibanghigherideal" + ENTRY_CODE;
