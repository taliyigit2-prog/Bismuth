// A password (or PIN) field with a show/hide button at its end. A PIN keeps digits only and asks the phone for
// the number pad.
import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function PasswordInput({
  pin = false,
  className,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'> & { pin?: boolean }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input
        {...props}
        type={shown ? 'text' : 'password'}
        dir="ltr"
        inputMode={pin ? 'numeric' : props.inputMode}
        maxLength={pin ? 8 : (props.maxLength ?? 256)}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        className={cn('pe-10 max-md:pe-12', className)}
        onChange={(e) => {
          if (pin) e.target.value = e.target.value.replace(/\D/g, '')
          onChange?.(e)
        }}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={
          pin
            ? t(shown ? 'auth.hidePin' : 'auth.showPin')
            : t(shown ? 'auth.hidePassword' : 'auth.showPassword')
        }
        aria-pressed={shown}
        aria-controls={props.id}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute inset-y-0 end-0 grid w-9 place-items-center rounded-e-md outline-none focus-visible:ring-[3px] max-md:w-11"
      >
        {shown ? <EyeOffIcon className="size-4" aria-hidden /> : <EyeIcon className="size-4" aria-hidden />}
      </button>
    </div>
  )
}
