// "Ücretler" (P21d, Ö-22): the hotel's rules for the late check-out fee, the no-show fee and the damage deposit.
// They only offer a default; the desk can change every amount when the line is written. Saved with one button.
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SettingsPatch, SettingsValues } from '@shared/contract'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MoneyInput } from '@/components/money-input'
import { TimeInput, isClock } from '@/components/time-input'
import { useCan } from '@/lib/view-as'

type Late = SettingsValues['fees.lateCheckout']
type NoShow = SettingsValues['fees.noShow']

export function FeesCard({
  values,
  onSave
}: {
  values: SettingsValues
  onSave: (patch: SettingsPatch, announce?: boolean) => void
}) {
  const { t } = useTranslation()
  const can = useCan()
  const canEdit = can('settings', 'edit')
  const currency = values['hotel.baseCurrency']
  const [late, setLate] = useState<Late>(values['fees.lateCheckout'])
  const [noShow, setNoShow] = useState<NoShow>(values['fees.noShow'])
  const [deposit, setDeposit] = useState<number | null>(values['fees.damageDepositMinor'])
  const [percent, setPercent] = useState(String(values['fees.lateCheckout'].percentBp / 100))
  const percentId = useId()
  const percentOk = /^\d{1,3}$/.test(percent.trim()) && Number(percent) <= 1000
  const valid = isClock(late.afterTime) && percentOk && deposit !== null
  const dirty =
    JSON.stringify(late) !== JSON.stringify(values['fees.lateCheckout']) ||
    JSON.stringify(noShow) !== JSON.stringify(values['fees.noShow']) ||
    deposit !== values['fees.damageDepositMinor']
  const submit = (): void => {
    if (!valid || !dirty) return
    onSave(
      { 'fees.lateCheckout': late, 'fees.noShow': noShow, 'fees.damageDepositMinor': deposit ?? 0 },
      true
    )
  }
  return (
    <Card data-testid="fees-card">
      <CardHeader>
        <CardTitle>{t('settings.fees.title')}</CardTitle>
        <CardDescription>{t('settings.fees.help')}</CardDescription>
      </CardHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        noValidate
      >
        <fieldset disabled={!canEdit} className="contents">
          <CardContent className="grid gap-6 md:grid-cols-2">
            <div className="grid content-start gap-3">
              <h3 className="text-sm font-semibold">{t('settings.fees.late')}</h3>
              <div className="grid gap-1.5">
                <Label>{t('settings.fees.mode')}</Label>
                <Select
                  value={late.mode}
                  onValueChange={(mode) => setLate({ ...late, mode: mode as Late['mode'] })}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label={t('settings.fees.late')}
                    data-testid="fees-late-mode"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('settings.fees.lateNone')}</SelectItem>
                    <SelectItem value="fixed">{t('settings.fees.lateFixed')}</SelectItem>
                    <SelectItem value="percent">{t('settings.fees.latePercent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {late.mode !== 'none' ? (
                <>
                  <div className="grid gap-1.5">
                    <Label>{t('settings.fees.afterTime')}</Label>
                    <TimeInput
                      value={late.afterTime}
                      onChange={(afterTime) => setLate({ ...late, afterTime })}
                      aria-label={t('settings.fees.afterTime')}
                      data-testid="fees-late-after"
                    />
                  </div>
                  {late.mode === 'fixed' ? (
                    <MoneyInput
                      label={t('settings.fees.amount')}
                      value={{ amountMinor: late.amountMinor, currency }}
                      onChange={(v) => setLate({ ...late, amountMinor: v.amountMinor ?? 0 })}
                      currencies={[currency]}
                    />
                  ) : (
                    <div className="grid gap-1.5">
                      <Label htmlFor={percentId}>{t('settings.fees.percent')}</Label>
                      <Input
                        id={percentId}
                        inputMode="numeric"
                        dir="ltr"
                        value={percent}
                        aria-invalid={!percentOk || undefined}
                        onChange={(e) => {
                          setPercent(e.target.value)
                          if (/^\d{1,3}$/.test(e.target.value.trim()))
                            setLate({ ...late, percentBp: Number(e.target.value.trim()) * 100 })
                        }}
                        data-testid="fees-late-percent"
                      />
                      {percentOk ? null : (
                        <p role="alert" className="text-destructive text-sm">
                          {t('settings.fees.percentInvalid')}
                        </p>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>
            <div className="grid content-start gap-3">
              <h3 className="text-sm font-semibold">{t('settings.fees.noShow')}</h3>
              <div className="grid gap-1.5">
                <Label>{t('settings.fees.mode')}</Label>
                <Select
                  value={noShow.mode}
                  onValueChange={(mode) => setNoShow({ ...noShow, mode: mode as NoShow['mode'] })}
                >
                  <SelectTrigger
                    className="w-full"
                    aria-label={t('settings.fees.noShow')}
                    data-testid="fees-noshow-mode"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('settings.fees.noShowNone')}</SelectItem>
                    <SelectItem value="first_night">{t('settings.fees.noShowFirstNight')}</SelectItem>
                    <SelectItem value="fixed">{t('settings.fees.noShowFixed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {noShow.mode === 'fixed' ? (
                <MoneyInput
                  label={t('settings.fees.amount')}
                  value={{ amountMinor: noShow.amountMinor, currency }}
                  onChange={(v) => setNoShow({ ...noShow, amountMinor: v.amountMinor ?? 0 })}
                  currencies={[currency]}
                />
              ) : null}
            </div>
            <div className="grid content-start gap-3 md:col-span-2 md:max-w-sm">
              <h3 className="text-sm font-semibold">{t('settings.fees.deposit')}</h3>
              <MoneyInput
                label={t('settings.fees.depositAmount')}
                value={{ amountMinor: deposit, currency }}
                onChange={(v) => setDeposit(v.amountMinor)}
                currencies={[currency]}
              />
              <p className="text-muted-foreground text-xs">{t('settings.fees.depositHelp')}</p>
            </div>
          </CardContent>
          <CardFooter className="mt-6 flex justify-end max-md:[&>button]:flex-1">
            <Button type="submit" disabled={!dirty || !valid} data-testid="fees-save">
              {t('settings.fees.save')}
            </Button>
          </CardFooter>
        </fieldset>
      </form>
    </Card>
  )
}
