import { describe, expect, it } from 'vitest'
import { AI_DEFAULTS, aiConfig, aiConfigured, aiStatus } from './config'

describe('aiConfig', () => {
  it('falls back to bounded defaults when nothing is set', () => {
    const config = aiConfig({})
    expect(config.timeoutMs).toBe(AI_DEFAULTS.timeoutMs)
    expect(config.maxRetries).toBe(AI_DEFAULTS.maxRetries)
    expect(config.rateLimitPerHour).toBe(AI_DEFAULTS.rateLimitPerHour)
    expect(config.demoMode).toBe(false)
    expect(aiConfigured({})).toBe(false)
  })

  it('prefers the documented AI_* names but honours the original GEMINI_* ones', () => {
    expect(aiConfig({ AI_API_KEY: 'k1', GEMINI_API_KEY: 'k2' }).apiKey).toBe('k1')
    expect(aiConfig({ GEMINI_API_KEY: 'k2' }).apiKey).toBe('k2')
    expect(aiConfig({ AI_MODEL: 'a', GEMINI_MODEL: 'b' }).model).toBe('a')
  })

  it('never lets a silly value become an unbounded budget', () => {
    expect(aiConfig({ AI_RATE_LIMIT_PER_HOUR: '999999' }).rateLimitPerHour).toBe(1_000)
    expect(aiConfig({ AI_TIMEOUT_MS: '99999999' }).timeoutMs).toBe(60_000)
    expect(aiConfig({ AI_TIMEOUT_MS: '-1' }).timeoutMs).toBe(1_000)
    expect(aiConfig({ AI_MAX_RETRIES: '-4' }).maxRetries).toBe(0)
  })

  it('honours an explicit zero rather than restoring the default', () => {
    // "no retries" and "no cache" are legitimate settings for a deployment.
    expect(aiConfig({ AI_MAX_RETRIES: '0' }).maxRetries).toBe(0)
    expect(aiConfig({ AI_DEDUPE_WINDOW_MS: '0' }).dedupeWindowMs).toBe(0)
    expect(aiConfig({ AI_RATE_LIMIT_PER_HOUR: '0' }).rateLimitPerHour).toBe(1)
    // ...but an absent value still means the documented default.
    expect(aiConfig({ AI_RATE_LIMIT_PER_HOUR: '  ' }).rateLimitPerHour).toBe(AI_DEFAULTS.rateLimitPerHour)
  })

  it('requires an explicit opt-in for the demo engine', () => {
    expect(aiConfig({ AI_DEMO_MODE: 'true' }).demoMode).toBe(true)
    expect(aiConfig({ AI_DEMO_MODE: 'false' }).demoMode).toBe(false)
    expect(aiConfig({ AI_DEMO_MODE: 'maybe' }).demoMode).toBe(false)
  })

  it('describes itself without ever leaking key material', () => {
    const status = aiStatus({ AI_API_KEY: 'super-secret-value' })
    expect(status.configured).toBe(true)
    expect(JSON.stringify(status)).not.toContain('super-secret-value')
  })
})
