/** promise를 최대 ms만큼 기다린다. 시간이 지나면 undefined로 돌아오고 promise는 계속 돈다 */
export function waitAtMost<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
