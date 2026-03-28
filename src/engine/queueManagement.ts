import { SERVICES, STAFF_TEMPLATES } from '../data/content';
import { BookingPolicy, GameState, PatientVisit, ScheduleMetrics, ServiceId } from '../types/game';
import { clamp, rand } from './utils';

export const SLOT_MINUTES = 15;
export const DAY_START_MINUTE = 8 * 60;
export const DAY_SLOT_COUNT = 36;

const serviceById = (id: ServiceId) => SERVICES.find((service) => service.id === id) ?? SERVICES[0];

const schedulingPressureByNeed = {
  low: 0.05,
  medium: 0.1,
  high: 0.18
} as const;

const POLICY_BOOKING_DENSITY: Record<BookingPolicy, number> = {
  conservative: 0.82,
  balanced: 1,
  aggressive: 1.22
};

export const baseScheduleMetrics = (policy: BookingPolicy): ScheduleMetrics => ({
  policy,
  slotsUsed: 0,
  totalSlots: DAY_SLOT_COUNT,
  queueLengthPeak: 0,
  missedAppointments: 0,
  lateArrivals: 0,
  earlyArrivals: 0,
  overruns: 0,
  spilloverMinutes: 0,
  unusedGaps: DAY_SLOT_COUNT
});

export const getFrontDeskEfficiency = (state: GameState): number => {
  const scheduledFrontDesk = state.staff.filter((member) => member.scheduled && member.role === 'frontDesk');
  if (!scheduledFrontDesk.length) return 0.55;

  const weighted = scheduledFrontDesk.reduce((sum, member) => {
    const templateBonus = STAFF_TEMPLATES.find((template) => template.id === 'frontDesk')?.specialtyBonus[member.specialtyFocus] ?? 0;
    return sum + member.communication * 0.45 + member.documentation * 0.35 + member.speed * 0.2 + templateBonus;
  }, 0);
  return clamp(weighted / scheduledFrontDesk.length, 0.35, 1.2);
};

const policySlotStep = (policy: BookingPolicy) => {
  if (policy === 'conservative') return 2;
  if (policy === 'aggressive') return 1;
  return 1.5;
};

export const allocateAppointmentSlots = (state: GameState, queue: PatientVisit[]): PatientVisit[] => {
  const density = POLICY_BOOKING_DENSITY[state.bookingPolicy];
  const baseStep = policySlotStep(state.bookingPolicy);
  const frontDeskEfficiency = getFrontDeskEfficiency(state);

  return queue.map((visit, index) => {
    const service = serviceById(visit.service);
    const slotsNeeded = Math.max(1, Math.round(service.duration / SLOT_MINUTES));
    const jitter = rand(state.seed + state.day * 389 + index * 13);
    const pressure = schedulingPressureByNeed[service.schedulingNeed];
    const effectiveStep = Math.max(0.65, baseStep - density * 0.35 + pressure + (1 - frontDeskEfficiency) * 0.4);
    const rawSlot = Math.floor(index * effectiveStep + jitter * 0.8);
    const slot = Math.max(0, Math.min(DAY_SLOT_COUNT - 1, rawSlot));
    const minute = DAY_START_MINUTE + slot * SLOT_MINUTES;

    const arrivalVariance = (1 - frontDeskEfficiency) * 16 + (state.bookingPolicy === 'aggressive' ? 8 : 3);
    const signedOffset = Math.round((rand(state.seed + state.day * 443 + index * 17) - 0.46) * arrivalVariance);

    return {
      ...visit,
      scheduledSlot: slot,
      scheduledMinute: minute,
      expectedDuration: slotsNeeded * SLOT_MINUTES,
      arrivalOffsetMinutes: signedOffset
    };
  });
};

export const summarizeSlotUsage = (scheduledVisits: PatientVisit[], policy: BookingPolicy): ScheduleMetrics => {
  const usedSlots = new Set<number>();
  let lateArrivals = 0;
  let earlyArrivals = 0;

  scheduledVisits.forEach((visit) => {
    usedSlots.add(visit.scheduledSlot);
    if (visit.arrivalOffsetMinutes > 7) lateArrivals += 1;
    if (visit.arrivalOffsetMinutes < -5) earlyArrivals += 1;
  });

  let unusedGaps = 0;
  for (let slot = 0; slot < DAY_SLOT_COUNT; slot += 1) {
    if (!usedSlots.has(slot)) unusedGaps += 1;
  }

  return {
    ...baseScheduleMetrics(policy),
    slotsUsed: usedSlots.size,
    lateArrivals,
    earlyArrivals,
    unusedGaps
  };
};
