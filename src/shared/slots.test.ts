import { describe, it, expect } from 'vitest'
import { minuteOptions, nextSlot, snapClock } from './slots'

describe('time slots', () => {
  it('lists minutes on the grid', () => {
    expect(minuteOptions(15)).toEqual([0, 15, 30, 45])
    expect(minuteOptions(30)).toEqual([0, 30])
    expect(minuteOptions(1)).toHaveLength(60)
    expect(minuteOptions(7)).toHaveLength(60)
  })
  it('snaps clock times to the nearest slot', () => {
    expect(snapClock('08:07', 15)).toBe('08:00')
    expect(snapClock('08:08', 15)).toBe('08:15')
    expect(snapClock('16:53', 15)).toBe('17:00')
    expect(snapClock('23:58', 15)).toBe('23:45')
    expect(snapClock('08:07', 1)).toBe('08:07')
  })
  it('finds the next slot', () => {
    const at = (h: number, m: number, s = 0) => new Date(2026, 10, 26, h, m, s).getTime()
    expect(nextSlot(at(16, 47, 12), 15)).toBe(at(17, 0))
    expect(nextSlot(at(17, 0), 15)).toBe(at(17, 0))
    expect(nextSlot(at(17, 0, 30), 15)).toBe(at(17, 15))
    expect(nextSlot(at(9, 2), 5)).toBe(at(9, 5))
  })
})
