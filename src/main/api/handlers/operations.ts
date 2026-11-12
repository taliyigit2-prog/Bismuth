// Handlers of procedures/operations.ts (Faz 9): contract procedure → service call.
import type { operationsProcedures } from '@shared/contract/procedures/operations'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'

export const operationsHandlers = (services: Services): HandlersFor<keyof typeof operationsProcedures> => ({
  'tasks.list': (ctx, input) => services.tasks.listItems(ctx, input),
  'tasks.lookups': (ctx) => services.tasks.lookups(ctx),
  'tasks.create': (ctx, input) => services.tasks.createTask(ctx, input),
  'tasks.done': (ctx, { id, note }) => services.tasks.done(ctx, id, { note }),
  'tasks.undoDone': (ctx, { id, reason }) => services.tasks.undoDone(ctx, id, reason),
  'tasks.cancel': (ctx, { id, reason }) => services.tasks.cancel(ctx, id, reason),

  'tasks.templates': (ctx, input) => services.tasks.templateDetails(ctx, input),
  'tasks.addTemplate': (ctx, input) => services.tasks.addTemplate(ctx, input),
  'tasks.editTemplate': (ctx, { id, patch }) => services.tasks.editTemplate(ctx, id, patch),
  'tasks.setTemplateActive': (ctx, { id, ...input }) => services.tasks.setTemplateActive(ctx, id, input),
  'tasks.dismissSuggestion': (ctx, { id }) => services.tasks.dismissSuggestion(ctx, id),
  'tasks.completeTemplate': (ctx, { id, ...input }) => services.tasks.completeTemplate(ctx, id, input),
  'tasks.stayCounters': (ctx) => services.tasks.stayCounters(ctx),

  'shift.summary': (ctx) => services.shifts.handoverSummary(ctx),
  'shift.saveHandover': (ctx, input) => services.shifts.saveHandover(ctx, input),
  'shift.acknowledge': (ctx, { id }) => services.shifts.acknowledge(ctx, id),
  'shift.handovers': (ctx, { from, to }) => services.shifts.listHandovers(ctx, from, to),
  'shift.unreadHandovers': (ctx) => services.shifts.unreadHandovers(ctx),

  'notes.list': (ctx, input) => services.shifts.listNotes(ctx, input),
  'notes.add': (ctx, input) => services.shifts.addNote(ctx, input),
  'notes.update': (ctx, { id, patch }) => services.shifts.updateNote(ctx, id, patch),
  'notes.setState': (ctx, { id, ...state }) => services.shifts.setNoteState(ctx, id, state),
  'notes.dueReminders': (ctx) => services.shifts.dueReminders(ctx)
})
