import { beforeEach, describe, expect, it } from 'vitest'
import { addPhoto, makeMainPhoto, MAX_PHOTOS, readPhotos, readProfile, removePhoto, updatePhoto, writeProfile, presetFor } from './profileStore'

describe('profile photos (≤ 6, first = main, mirrored into profile.photo)', () => {
  beforeEach(() => {
    window.localStorage.clear()
    writeProfile({ ...presetFor('host', 'line', 'Kwan'), completedAt: 'x' })
  })
  it('add · make main · edit · remove persist and keep profile.photo = the main one', () => {
    addPhoto('data:a')
    addPhoto('data:b')
    expect(readProfile()?.photo).toBe('data:a')
    const b = readPhotos()[1]
    makeMainPhoto(b.id)
    expect(readPhotos().map((p) => p.src)).toEqual(['data:b', 'data:a'])
    expect(readProfile()?.photo).toBe('data:b')
    updatePhoto(b.id, { light: 1.2, zoom: 1.5 })
    expect(readPhotos()[0]).toMatchObject({ light: 1.2, zoom: 1.5, src: 'data:b' })
    removePhoto(b.id)
    expect(readPhotos().map((p) => p.src)).toEqual(['data:a'])
    expect(readProfile()?.photo).toBe('data:a')
  })
  it('never more than six', () => {
    for (let i = 0; i < MAX_PHOTOS; i++) expect(addPhoto(`data:${i}`)).not.toBeNull()
    expect(addPhoto('data:7')).toBeNull()
    expect(readPhotos()).toHaveLength(6)
  })
})
