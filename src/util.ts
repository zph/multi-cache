export const sleep = (ms: number) => {
  return new Promise((resolve) => {
    return setTimeout(resolve, ms);
  });
};

export class NoCacheableError implements Error {
  name = 'NoCacheableError';
  constructor(public message: string) {}
}

export const avoidNoCacheable = async <T>(p: Promise<T>) => {
  try {
    return await p;
  } catch (e) {
    if (!(e instanceof NoCacheableError)) throw e;
  }
};
