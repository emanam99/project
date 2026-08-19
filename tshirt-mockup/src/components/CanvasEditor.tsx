import { Circle, FabricImage, FabricText, Rect, Canvas as FabricCanvas } from 'fabric'
import { useEffect, useRef } from 'react'
import { PATTERN, frontChestPoint } from '../lib/tshirtPattern'
import { useMockupStore } from '../store/useMockupStore'

export default function CanvasEditor() {
  const hostRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<FabricCanvas | null>(null)
  const skipHistory = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const pendingLogoUrl = useMockupStore((s) => s.pendingLogoUrl)
  const pendingKind = useMockupStore((s) => s.pendingKind)
  const consumePending = useMockupStore((s) => s.consumePending)
  const setCanvasEl = useMockupStore((s) => s.setCanvasEl)
  const bumpTexture = useMockupStore((s) => s.bumpTexture)
  const pushHistory = useMockupStore((s) => s.pushHistory)
  const restoreJson = useMockupStore((s) => s.restoreJson)
  const clearRestore = useMockupStore((s) => s.clearRestore)
  const zoom = useMockupStore((s) => s.zoom)
  const tool = useMockupStore((s) => s.tool)
  const sleeveLength = useMockupStore((s) => s.sleeveLength)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return

    const canvas = new FabricCanvas(el, {
      width: PATTERN.width,
      height: PATTERN.height,
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
      selection: true,
      enableRetinaScaling: false,
    })
    fabricRef.current = canvas

    const textureCanvas = document.createElement('canvas')
    textureCanvas.width = PATTERN.width
    textureCanvas.height = PATTERN.height
    setCanvasEl(textureCanvas)

    const sync = () => {
      const exported = canvas.toCanvasElement()
      const ctx = textureCanvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, PATTERN.width, PATTERN.height)
      ctx.drawImage(exported, 0, 0)
      bumpTexture()
    }

    const snapshot = () => {
      if (skipHistory.current) return
      pushHistory(JSON.stringify(canvas.toJSON()))
    }

    canvas.on('object:added', sync)
    canvas.on('object:removed', sync)
    canvas.on('object:modified', () => {
      sync()
      snapshot()
    })
    canvas.on('object:moving', sync)
    canvas.on('object:scaling', sync)
    canvas.on('object:rotating', sync)
    canvas.on('object:skewing', sync)

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return
      const obj = canvas.getActiveObject()
      if (!obj) return
      canvas.remove(obj)
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      sync()
      snapshot()
    }
    window.addEventListener('keydown', onKey)

    skipHistory.current = true
    pushHistory(JSON.stringify(canvas.toJSON()))
    skipHistory.current = false
    sync()

    return () => {
      window.removeEventListener('keydown', onKey)
      canvas.dispose()
      fabricRef.current = null
      setCanvasEl(null)
    }
  }, [bumpTexture, setCanvasEl, pushHistory])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !restoreJson) return
    skipHistory.current = true
    void canvas.loadFromJSON(restoreJson).then(() => {
      canvas.requestRenderAll()
      const exported = canvas.toCanvasElement()
      const textureCanvas = useMockupStore.getState().canvasEl
      const ctx = textureCanvas?.getContext('2d')
      if (ctx && textureCanvas) {
        ctx.clearRect(0, 0, PATTERN.width, PATTERN.height)
        ctx.drawImage(exported, 0, 0)
        useMockupStore.getState().bumpTexture()
      }
      skipHistory.current = false
      clearRestore()
    })
  }, [restoreJson, clearRestore])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || !pendingKind) return
    const chest = frontChestPoint()
    skipHistory.current = true

    const finish = () => {
      canvas.requestRenderAll()
      consumePending()
      skipHistory.current = false
      useMockupStore.getState().pushHistory(JSON.stringify(canvas.toJSON()))
    }

    if (pendingKind === 'image' && pendingLogoUrl) {
      void FabricImage.fromURL(pendingLogoUrl, { crossOrigin: 'anonymous' }).then((img) => {
        img.scaleToWidth(120)
        img.set({ left: chest.x, top: chest.y, originX: 'center', originY: 'center' })
        canvas.add(img)
        canvas.setActiveObject(img)
        finish()
      })
      return
    }

    if (pendingKind === 'text') {
      const text = new FabricText('Teks', {
        left: chest.x,
        top: chest.y,
        originX: 'center',
        originY: 'center',
        fontSize: 36,
        fontWeight: '700',
        fill: '#111827',
        fontFamily: 'Inter, system-ui, sans-serif',
      })
      canvas.add(text)
      canvas.setActiveObject(text)
      finish()
      return
    }

    if (pendingKind === 'rect') {
      const rect = new Rect({
        left: chest.x,
        top: chest.y,
        originX: 'center',
        originY: 'center',
        width: 90,
        height: 90,
        fill: '#6E56F8',
      })
      canvas.add(rect)
      canvas.setActiveObject(rect)
      finish()
      return
    }

    if (pendingKind === 'circle') {
      const circle = new Circle({
        left: chest.x,
        top: chest.y,
        originX: 'center',
        originY: 'center',
        radius: 42,
        fill: '#2563eb',
      })
      canvas.add(circle)
      canvas.setActiveObject(circle)
      finish()
    }
  }, [pendingKind, pendingLogoUrl, consumePending])

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || tool !== 'pan') return
    let dragging = false
    let sx = 0
    let sy = 0
    let sl = 0
    let st = 0
    const down = (e: PointerEvent) => {
      dragging = true
      sx = e.clientX
      sy = e.clientY
      sl = wrap.scrollLeft
      st = wrap.scrollTop
      wrap.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      wrap.scrollLeft = sl - (e.clientX - sx)
      wrap.scrollTop = st - (e.clientY - sy)
    }
    const up = () => {
      dragging = false
    }
    wrap.addEventListener('pointerdown', down)
    wrap.addEventListener('pointermove', move)
    wrap.addEventListener('pointerup', up)
    return () => {
      wrap.removeEventListener('pointerdown', down)
      wrap.removeEventListener('pointermove', move)
      wrap.removeEventListener('pointerup', up)
    }
  }, [tool])

  return (
    <div className="relative h-full min-h-0 bg-[#f3f3f5]">
      <p className="pointer-events-none absolute left-4 top-3 z-30 text-[11px] text-[#8b8b93]">
        Pola mengikuti UV asli kaos. Geser logo di potongan depan, hasilnya di dada 3D.
      </p>
      <div
        ref={wrapRef}
        className={`h-full overflow-auto ${tool === 'pan' ? 'cursor-grab' : ''}`}
      >
        <div
          className="relative mx-auto my-8"
          style={{
            width: PATTERN.width * zoom,
            height: PATTERN.height * zoom,
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: PATTERN.width,
              height: PATTERN.height,
              transform: `scale(${zoom})`,
            }}
          >
            <img
              src={sleeveLength === 'long' ? '/uv-layout-hunyuan-long.svg?v=3' : '/uv-layout.svg?v=6'}
              alt=""
              className="pointer-events-none absolute inset-0 z-10 h-full w-full select-none"
              draggable={false}
            />
            <div
              className={`absolute inset-0 z-20 [&>.canvas-container]:h-full [&>.canvas-container]:w-full ${
                tool === 'pan' ? 'pointer-events-none' : ''
              }`}
            >
              <canvas ref={hostRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
