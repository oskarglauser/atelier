import { memo } from 'react'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export const Switch = memo(function Switch({ checked, onChange, disabled }: Props) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{ backgroundColor: checked ? 'var(--color-accent)' : 'var(--color-bg-active)' }}
      className={`relative w-8 h-[18px] rounded-full transition-colors duration-150 shrink-0 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <span
        className={`absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all duration-150 shadow-sm ${
          checked ? 'left-[12px] bg-white' : 'left-[2px] bg-white/70'
        }`}
      />
    </button>
  )
})
