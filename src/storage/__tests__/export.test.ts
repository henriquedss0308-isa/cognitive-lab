import { describe, it, expect } from 'vitest'
import { importBackup } from '../export'
import type { AppBackup } from '../../types'

const validBackup: AppBackup = {
  version: '1.0.0',
  exportedAt: new Date().toISOString(),
  settings: {
    theme: 'dark',
    fontScale: 1,
    developerMode: false,
    hasSeenIntro: true,
    demoDataActive: false,
  },
  sessions: [
    {
      sessionId: 'test-session-1',
      testId: 'simple_rt',
      protocolVersion: 'reaction.simple.v1.0',
      mode: 'assessment',
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      quality: 'valid',
      flags: {},
      flagMessages: [],
      trials: [
        {
          trialId: 'trial-1',
          sessionId: 'test-session-1',
          testId: 'simple_rt',
          protocolVersion: 'reaction.simple.v1.0',
          mode: 'assessment',
          blockIndex: 0,
          trialIndex: 0,
          condition: 'simple',
          stimulus: 'green_circle',
          expectedResponse: 'space',
          actualResponse: 'space',
          correct: true,
          reactionTimeMs: 280,
          stimulusOnsetTimestamp: 1000,
          responseTimestamp: 1280,
          windowFocused: true,
          visibilityState: 'visible',
          deviceType: 'desktop',
          inputMethod: 'keyboard',
        },
      ],
      deviceInfo: {
        deviceType: 'desktop',
        inputMethod: 'keyboard',
        screenWidth: 1920,
        screenHeight: 1080,
        browser: 'Chrome',
        userAgent: 'test',
      },
      isDemo: false,
      practiceCompleted: true,
      randomizationSeed: 42,
    },
  ],
}

describe('importBackup', () => {
  it('rejects invalid format', async () => {
    const r = await importBackup(null)
    expect(r.success).toBe(false)
  })

  it('rejects missing sessions', async () => {
    const r = await importBackup({ version: '1.0.0' })
    expect(r.success).toBe(false)
  })

  it('validates session structure', async () => {
    const r = await importBackup({
      ...validBackup,
      sessions: [{ sessionId: 'x', testId: 'simple_rt' }],
    })
    expect(r.success).toBe(false)
  })
})