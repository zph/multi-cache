export const jsonSerializer = {
  // deno-lint-ignore no-explicit-any
  serialize: (data: any) => JSON.stringify(data) || '"undefined"',
  deserialize: (value: string) => JSON.parse(value) || undefined,
}
