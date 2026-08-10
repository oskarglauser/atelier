const noiseCanvasCache = new Map<string, HTMLCanvasElement>()

/**
 * Generate a small tileable noise canvas (128x128).
 * The `amount` (0–1) controls the opacity of the grain.
 */
export function getNoiseCanvas(amount: number): HTMLCanvasElement {
  const key = amount.toFixed(2)
  const cached = noiseCanvasCache.get(key)
  if (cached) return cached

  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(size, size)
  const data = imageData.data
  const alpha = Math.round(amount * 60) // max alpha ~60 for subtle grain

  for (let i = 0; i < data.length; i += 4) {
    const v = Math.random() * 255
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
    data[i + 3] = Math.random() < 0.5 ? alpha : 0
  }

  ctx.putImageData(imageData, 0, 0)
  noiseCanvasCache.set(key, canvas)
  return canvas
}
