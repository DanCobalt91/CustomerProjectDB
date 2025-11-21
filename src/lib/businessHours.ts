import { DEFAULT_BUSINESS_SETTINGS, type BusinessDay, type BusinessSettings } from '../types'

const JS_DAY_TO_BUSINESS_DAY: BusinessDay[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

function getBusinessDayKey(date: Date): BusinessDay {
  return JS_DAY_TO_BUSINESS_DAY[date.getDay()] ?? 'monday'
}

function getBusinessHours(settings: BusinessSettings, dateString: string) {
  if (!dateString) {
    return settings.hours.monday ?? DEFAULT_BUSINESS_SETTINGS.hours.monday
  }

  const parsed = new Date(`${dateString}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return settings.hours.monday ?? DEFAULT_BUSINESS_SETTINGS.hours.monday
  }

  const dayKey = getBusinessDayKey(parsed)
  return settings.hours[dayKey] ?? DEFAULT_BUSINESS_SETTINGS.hours[dayKey]
}

export function getBusinessStartTimeForDate(settings: BusinessSettings, dateString: string): string {
  const hours = getBusinessHours(settings, dateString)
  return hours.start
}

export function getBusinessEndTimeForDate(settings: BusinessSettings, dateString: string): string {
  const hours = getBusinessHours(settings, dateString)
  return hours.end
}

