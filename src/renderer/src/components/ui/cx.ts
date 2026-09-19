export const cx = (...c: Array<string | false | null | undefined>): string => c.filter(Boolean).join(' ')
