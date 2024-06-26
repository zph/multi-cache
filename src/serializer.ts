export const jsonSerializer = {
  // deno-lint-ignore no-explicit-any
  serialize: (data: any) => {
    if(typeof data === 'string') return data;
    return JSON.stringify(data, null, 2) || '"undefined"';
  },
  deserialize: (value: string) => JSON.parse(value) || undefined,
}
