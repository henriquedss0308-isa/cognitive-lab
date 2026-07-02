import type { DeviceInfo } from '../types'

export function detectDevice(): DeviceInfo {
  const ua = navigator.userAgent
  const width = window.screen.width
  const height = window.screen.height

  let deviceType: DeviceInfo['deviceType'] = 'desktop'
  if (/Mobi|Android/i.test(ua) && width < 768) deviceType = 'mobile'
  else if (/Tablet|iPad/i.test(ua) || (width >= 768 && width < 1024)) deviceType = 'tablet'

  let inputMethod: DeviceInfo['inputMethod'] = 'keyboard'
  if ('ontouchstart' in window && deviceType !== 'desktop') inputMethod = 'touch'

  let browser = 'unknown'
  if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Edg/')) browser = 'Edge'
  else if (ua.includes('Chrome')) browser = 'Chrome'
  else if (ua.includes('Safari')) browser = 'Safari'

  return {
    deviceType,
    inputMethod,
    screenWidth: width,
    screenHeight: height,
    browser,
    zoomLevel: Math.round((window.outerWidth / window.innerWidth) * 100) / 100,
    userAgent: ua,
  }
}

export async function estimateRefreshRate(): Promise<number> {
  return new Promise((resolve) => {
    const samples: number[] = []
    let last = performance.now()
    let count = 0

    function frame(t: number) {
      if (count > 0) samples.push(t - last)
      last = t
      count++
      if (count < 30) requestAnimationFrame(frame)
      else {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length
        resolve(Math.round(1000 / avg))
      }
    }
    requestAnimationFrame(frame)
  })
}