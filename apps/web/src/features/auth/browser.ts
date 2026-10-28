// 최상위 이동·새 창. 테스트에서 vi.spyOn(browser, 'assign')으로 바꿔 끼운다(jsdom은 페이지 이동을 못 한다).

export type PendingWindow = { go: (url: string) => void; cancel: () => void }

export const browser = {
  /** 이 탭을 다른 주소로(카카오 인가·토스 인증 같은 외부 이동) */
  assign(url: string) {
    window.location.assign(url)
  },

  /**
   * 클릭 순간에 빈 새 창을 먼저 연다. API가 끝난 뒤 window.open을 부르면 사용자 동작이 아니어서 팝업이 막히기 때문이다.
   * go(url): 열어 둔 창을 그 주소로 보낸다. 창을 못 열었으면(팝업 차단) 이 탭을 이동한다.
   * cancel(): 요청이 실패하면 빈 창을 닫는다.
   */
  openPending(): PendingWindow {
    let popup: Window | null = null
    try {
      popup = window.open('', '_blank')
    } catch {
      popup = null
    }
    return {
      go: (url) => {
        if (popup && !popup.closed) {
          popup.opener = null
          popup.location.href = url
        } else {
          browser.assign(url)
        }
      },
      cancel: () => {
        if (popup && !popup.closed) popup.close()
      },
    }
  },
}
