import { ReactNode, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function RankingReasons({ label, kind, reasons, className = '' }: {
  label: ReactNode; kind: 'urgency' | 'confidence'; reasons: string[]; className?: string
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null), id = useId()
  const show = () => {
    const bounds = trigger.current?.getBoundingClientRect()
    if (!bounds) return
    document.dispatchEvent(new CustomEvent('ranking-reasons-open', { detail: id }))
    setPosition({ top: bounds.bottom + 8, left: Math.max(8, Math.min(bounds.left, window.innerWidth - 272)) })
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const bounds = trigger.current?.getBoundingClientRect(), height = popup.current?.offsetHeight || 150
    if (bounds && bounds.bottom + height + 12 > window.innerHeight) setPosition(p => ({ ...p, top: Math.max(8, bounds.top - height - 8) }))
    const outside = (event: PointerEvent) => { if (!trigger.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    const scroll = () => setOpen(false)
    const anotherOpened = (event: Event) => { if ((event as CustomEvent).detail !== id) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    document.addEventListener('ranking-reasons-open', anotherOpened)
    window.addEventListener('scroll', scroll, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); document.removeEventListener('ranking-reasons-open', anotherOpened); window.removeEventListener('scroll', scroll, true) }
  }, [open, id])
  return <>
    <button ref={trigger} type="button" className={`lr-reason-trigger ${className}`} aria-expanded={open}
      aria-describedby={open ? id : undefined} onMouseEnter={show} onMouseLeave={() => setOpen(false)}
      onFocus={show} onBlur={() => setOpen(false)} onClick={show}>{label}</button>
    {open && createPortal(<div ref={popup} id={id} role="tooltip" className="lr-reason-dropdown" style={position}>
      <strong>Why this {kind}</strong>
      <ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
    </div>, document.body)}
  </>
}
