import type { Dictionary } from '@/content'
import type { CrmResult, CrmStage } from './types'

// The slice of the dictionary the interactive screens need.
//
// The call logger and the clinic cards are client components, so whatever they
// receive is serialised into the page. Sending the whole dictionary would ship
// several kilobytes of clinic panel wording to a phone on a mobile connection
// for no reason, so they get exactly the labels they render and nothing else.

export interface CrmStrings {
  result: Record<CrmResult, string>
  stage: Record<CrmStage, string>
  log: Dictionary['crm']['log']
  /** "Registar chamada", the full action. */
  logCall: string
  /** "Registar", the compact action used on a card. */
  logShort: string
  lateBy: string
  noPhone: string
}

export function crmStrings(dict: Dictionary): CrmStrings {
  return {
    result: dict.crm.result,
    stage: dict.crm.stage,
    log: dict.crm.log,
    logCall: dict.crm.detail.logCall,
    logShort: dict.crm.today.log,
    lateBy: dict.crm.today.lateBy,
    noPhone: dict.common.none,
  }
}
