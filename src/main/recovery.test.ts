import { describe, expect, it } from 'vitest'
import { staleSessionEnd } from './recovery'

const s = (startTs: number, endTs: number | null = null) => ({ id: 1, startTs, endTs, source: 'manual' as const, note: '' })
describe('staleSessionEnd', () => {
  it('ignores closed and today sessions', () => {
    expect(staleSessionEnd(s(1, 2), 5, 100, 200)).toBeNull()
    expect(staleSessionEnd(s(150), 160, 100, 200)).toBeNull()
  })
  it('ends at heartbeat, clamped', () => {
    expect(staleSessionEnd(s(10), 50, 100, 200)).toBe(50)
    expect(staleSessionEnd(s(10), 5, 100, 200)).toBe(10)
    expect(staleSessionEnd(s(10), 999, 100, 200)).toBe(200)
    expect(staleSessionEnd(s(10), null, 100, 200)).toBe(10)
  })
})
