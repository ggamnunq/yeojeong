/** 메일 앱 열기. 테스트에서 vi.spyOn(mailto, 'open')으로 바꿔 끼운다 */
export const mailto = {
  open(url: string) {
    window.location.assign(url)
  },
}
