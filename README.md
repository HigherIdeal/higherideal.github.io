# 뱅! 온라인 살롱

[https://higherideal.github.io](https://higherideal.github.io) 에서 열리는 뱅! 베이스 게임 자리입니다.
예전 포트폴리오 사이트는 `v1-backup` 브랜치에 그대로 있습니다.

친구에게 사이트 주소를 보내고, 닉네임과 **오늘의 암호**를 입력하면 같은 방에 들어옵니다. 최대 7명입니다.

## 입장 암호 바꾸기

암호는 `js/config.js`의 상수 하나입니다.

```js
export const ENTRY_CODE = "3913";
```

값을 바꾼 뒤 `main`에 푸시하면 GitHub Pages에 반영됩니다. 암호 확인은 브라우저 안에서만 이루어집니다. 별도의 서버 계정은 필요 없습니다.

실시간 동기화는 [PeerJS](https://peerjs.com) 공개 중계를 씁니다. 먼저 들어온 사람이 방장이 되고, 그 브라우저가 게임 진행을 맡습니다. 방장 탭은 판이 끝날 때까지 열어 두세요.
