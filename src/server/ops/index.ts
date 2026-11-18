// Operational events and alerts (Phase 4, slice 6; docs/DECISIONS.md P4-6).
export { recordOpsEvent } from './events'
export { evaluateAlerts, raiseHousekeepingAlert, resolveHousekeepingAlert, type AlertTrigger } from './evaluate'
export { runAfterResponse, setDeferredSinkForTests } from './defer'
export { isNextControlFlow } from './control-flow'
