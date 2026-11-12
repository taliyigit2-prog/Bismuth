import type { FieldErrors, SetupOptions, WizardDraft } from './draft'
import type { Step } from './steps'

/** What every step body gets: the answers, a way to change them, the seeded choices and the step's errors. */
export interface StepProps {
  draft: WizardDraft
  update: (change: (draft: WizardDraft) => WizardDraft) => void
  options: SetupOptions
  errors: FieldErrors
  goTo: (step: Step) => void
}
