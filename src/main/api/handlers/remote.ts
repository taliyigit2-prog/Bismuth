// Handlers of procedures/remote.ts (Faz 13): contract procedure → service call. On a computer that keeps its own
// data (alone or the hotel's main computer); in client mode src/main/server/client-app.ts answers instead.
import type { remoteProcedures } from '@shared/contract/procedures/remote'
import type { Services } from '../../services'
import { createRemoteService } from '../../server/remote-service'
import type { HandlersFor } from '../app'

export const remoteHandlers = (services: Services): HandlersFor<keyof typeof remoteProcedures> => {
  const remote = createRemoteService(services)
  return {
    'remote.hello': (_ctx, input) => remote.hello(input.nonce),
    'remote.hostStatus': (ctx) => remote.hostStatus(ctx),
    'remote.setMode': (ctx, input, env) => remote.setMode(ctx, input.mode, env.transport),
    'remote.setOpenAtLogin': (ctx, input, env) => remote.setOpenAtLogin(ctx, input.enabled, env.transport),
    'remote.setListenLan': (ctx, input, env) => remote.setListenLan(ctx, input.enabled, env.transport),
    'remote.becomeClient': (ctx, _input, env) => remote.becomeClient(ctx, env.transport),
    'remote.clientStatus': () => remote.clientStatus(),
    'remote.discover': (_ctx, _input, env) => remote.discover(env.transport),
    'remote.connect': () => remote.notClient(),
    'remote.acceptHostIdentity': () => remote.notClient(),
    'remote.forgetHost': () => remote.notClient(),
    'remote.leaveClient': () => remote.notClient(),
    'remote.openInBrowser': () => remote.notClient(),
    'remote.relayStatus': (ctx) => remote.relayStatus(ctx),
    'remote.relayRun': (ctx) => remote.relayRun(ctx),
    'remote.epochState': () => remote.epochState(),
    'remote.conflicts': (ctx) => remote.conflicts(ctx),
    'remote.saveConflicts': (ctx, _input, env) => remote.saveConflicts(ctx, env.transport),
    'remote.replicaGrant': (ctx, _input, env) => remote.replicaGrant(ctx, env.transport),
    'remote.replicaStatus': () => remote.notClient(),
    'remote.replicaSync': () => remote.notClient(),
    'remote.replicaSetKey': () => remote.notClient(),
    'remote.replicaSetFolder': () => remote.notClient(),
    'remote.replicaPickFolder': () => remote.notClient(),
    'remote.takeOver': () => remote.notClient()
  }
}
