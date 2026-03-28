import { PATIENT_ARCHETYPES, ROOM_DEFS, SERVICES, STAFF_TEMPLATES } from '../data/content';
import { GameState, PatientArchetype, PatientVisit, RoomTypeId, ServiceId, StaffMember } from '../types/game';
import { BALANCE, getDifficultyPreset, sumUpgradeEffect } from './simulationConfig';
import { average, clamp, rand } from './utils';
import { markCompletedVisit, markNoShowVisit, markWaitingVisit } from './patientTransitions';
import { analyzeLayoutFlow } from './layoutFlow';

const getArchetype = (id: string): PatientArchetype => PATIENT_ARCHETYPES.find((p) => p.id === id) ?? PATIENT_ARCHETYPES[0];
const getService = (id: ServiceId) => SERVICES.find((s) => s.id === id) ?? SERVICES[0];
const hasRoom = (state: GameState, roomType: RoomTypeId): boolean => state.rooms.some((room) => room.type === roomType);
const shiftCapacityFactor = (shift: StaffMember['shift']): number => (shift === 'full' ? 1 : shift === 'half' ? 0.62 : 0);

export const treatmentCapacity = (state: GameState): number => {
  const activeStaff = state.staff.filter((staffMember) => staffMember.scheduled);
  const staffCapacity = activeStaff.reduce(
    (sum, staffMember) =>
      sum +
      BALANCE.capacityPerStaff *
        shiftCapacityFactor(staffMember.shift) *
        staffMember.speed *
        (1 - staffMember.fatigue / BALANCE.fatigueCapacityDivisor) *
        (1 - staffMember.burnoutRisk * 0.18),
    0
  );
  const roomBonus = state.rooms.reduce((sum, room) => {
    const def = ROOM_DEFS.find((roomDef) => roomDef.id === room.type);
    return sum + (def?.throughputBonus ?? 0) * BALANCE.roomThroughputUnit * (1 + (room.equipmentLevel - 1) * 0.08);
  }, 0);
  const overcrowdPenalty = state.rooms.length < BALANCE.overcrowdThreshold ? BALANCE.overcrowdPenalty : 1;
  return Math.max(0, Math.floor((staffCapacity + roomBonus) * overcrowdPenalty));
};

export interface VisitResolution {
  revenue: number;
  variableCosts: number;
  adminLoad: number;
  totalWait: number;
  cancellations: number;
  noShows: number;
  attended: number;
  capacityLost: number;
  outcomes: number[];
  staffingBottlenecks: number;
  roomBottlenecks: number;
  equipmentBottlenecks: number;
  burnoutPressure: number;
  resolvedVisits: PatientVisit[];
  layoutFlow: ReturnType<typeof analyzeLayoutFlow>;
  journeyEvents: {
    patientId: string;
    result: 'completed' | 'noShow' | 'cancelled' | 'unserved';
    wait: number;
    outcome: number;
    satisfaction: number;
    service: ServiceId;
  }[];
}

const staffServiceFit = (staff: StaffMember, archetype: PatientArchetype, serviceId: ServiceId, requiredRoom: RoomTypeId): number => {
  const roleSpecialty = STAFF_TEMPLATES.find((template) => template.id === staff.role)?.specialtyBonus[archetype.id] ?? 0;
  const focusBonus = staff.specialtyFocus === archetype.id ? 0.08 : 0;
  const certBonus = staff.certifications.includes(serviceId) ? 0.06 : 0;
  const roomFit = staff.assignedRoom === 'flex' || staff.assignedRoom === requiredRoom ? 0.04 : -0.05;
  const fatiguePenalty = staff.fatigue > 75 ? -0.06 : 0;
  return roleSpecialty + focusBonus + certBonus + roomFit + fatiguePenalty;
};

export const resolveVisits = (state: GameState, queue: PatientVisit[], capacity: number): VisitResolution => {
  const baselineProcessable = queue.slice(0, capacity);
  const layoutFlow = analyzeLayoutFlow(state, baselineProcessable);
  const effectiveCapacity = Math.max(0, Math.floor(capacity * layoutFlow.throughputMultiplier));
  const processable = queue.slice(0, effectiveCapacity);
  const capacityLost = Math.max(0, queue.length - effectiveCapacity);
  const noShowReduction = sumUpgradeEffect(state, (effects) => effects.noShowReduction);
  const qualityBonus = sumUpgradeEffect(state, (effects) => effects.qualityBonus);
  const premiumBonus = sumUpgradeEffect(state, (effects) => effects.premiumPricing);
  const moraleGain = sumUpgradeEffect(state, (effects) => effects.moraleGain);

  const preset = getDifficultyPreset(state.difficultyPreset);
  const staffPool = state.staff.filter((staffMember) => staffMember.scheduled);
  const hasScheduledStaff = staffPool.length > 0;
  const modifier = state.operationalModifiers;

  let revenue = 0;
  let variableCosts = 0;
  let adminLoad = 0;
  let totalWait = 0;
  let cancellations = 0;
  let noShows = 0;
  let attended = 0;
  const outcomes: number[] = [];
  let staffingBottlenecks = 0;
  let roomBottlenecks = 0;
  let equipmentBottlenecks = 0;
  let burnoutPressure = 0;
  const resolvedVisits: PatientVisit[] = [];
  const journeyEvents: VisitResolution['journeyEvents'] = [];

  for (let i = 0; i < processable.length; i += 1) {
    const visit = markWaitingVisit(processable[i]);
    const archetype = getArchetype(visit.archetype);
    const service = getService(visit.service);

    if (!hasScheduledStaff) {
      staffingBottlenecks += 1;
      cancellations += 1;
      journeyEvents.push({ patientId: visit.patientId, result: 'cancelled', wait: 0, outcome: 0, satisfaction: 0, service: visit.service });
      continue;
    }
    const serviceRooms = state.rooms.filter((room) => room.type === service.requiredRoom);
    const routeStats = layoutFlow.routeMap[service.requiredRoom];
    if (serviceRooms.length === 0 || !hasRoom(state, service.requiredRoom) || !routeStats?.reachable) {
      roomBottlenecks += 1;
      cancellations += 1;
      journeyEvents.push({ patientId: visit.patientId, result: 'cancelled', wait: 0, outcome: 0, satisfaction: 0, service: visit.service });
      continue;
    }
    const eligibleStaff = staffPool.filter((staff) => staff.assignedRoom === 'flex' || staff.assignedRoom === service.requiredRoom);
    if (eligibleStaff.length === 0) {
      staffingBottlenecks += 1;
      cancellations += 1;
      journeyEvents.push({ patientId: visit.patientId, result: 'cancelled', wait: 0, outcome: 0, satisfaction: 0, service: visit.service });
      continue;
    }
    const staff = [...eligibleStaff].sort((a, b) => staffServiceFit(b, archetype, service.id, service.requiredRoom) - staffServiceFit(a, archetype, service.id, service.requiredRoom))[0];
    const cancellationChance = clamp(0.04 + archetype.complexity * 0.08 + modifier.cancellationShift + preset.cancellationShift, 0.01, 0.35);
    if (rand(state.seed + state.day * 41 + i) < cancellationChance) {
      cancellations += 1;
      journeyEvents.push({ patientId: visit.patientId, result: 'cancelled', wait: 0, outcome: 0, satisfaction: 0, service: visit.service });
      continue;
    }

    const noShowChance = clamp(
      archetype.noShowChance - (BALANCE.baseNoShowBuffer + noShowReduction) + modifier.noShowShift + preset.noShowShift,
      BALANCE.minNoShowChance,
      BALANCE.maxNoShowChance
    );
    if (rand(state.seed + state.day * 31 + i) < noShowChance) {
      noShows += 1;
      resolvedVisits.push(markNoShowVisit(visit));
      journeyEvents.push({ patientId: visit.patientId, result: 'noShow', wait: 0, outcome: 0, satisfaction: 0, service: visit.service });
      continue;
    }

    const routeTravelPenalty = routeStats ? routeStats.totalSteps * 0.15 : 0;
    const wait = Math.max(0, (i + 1 - capacity * BALANCE.comfortCapacityRatio) * BALANCE.waitUnitMinutes + layoutFlow.waitPenaltyMinutes + routeTravelPenalty);
    const matchingFocusedRoom = serviceRooms.filter((room) => room.focusService === service.id).length;
    const avgEquipment = average(serviceRooms.map((room) => room.equipmentLevel));
    const facilityFit = (avgEquipment - 1) * 0.08 * service.equipmentSensitivity + (matchingFocusedRoom / serviceRooms.length) * 0.06 * service.facilitySensitivity;
    if (service.equipmentSensitivity > 0.35 && avgEquipment < 1.6) equipmentBottlenecks += 1;
    const specialty = staffServiceFit(staff, archetype, service.id, service.requiredRoom);
    const burnoutPenalty = staff.burnoutRisk * 0.08;
    const quality = clamp((staff.quality + service.qualityImpact + qualityBonus + specialty + facilityFit - burnoutPenalty - staff.fatigue / BALANCE.qualityFatigueDivisor) * layoutFlow.staffEfficiencyMultiplier, 0.2, 1.3);
    const outcome = clamp((quality * archetype.improvementSpeed + archetype.adherence * 0.25) * (1 - archetype.complexity * 0.35), 0, 1);
    const satisfaction = clamp(0.7 + quality * 0.3 - (wait / 100) * archetype.satisfactionSensitivity - layoutFlow.satisfactionPenalty, 0, 1.2);

    const payerMultiplier = visit.insured ? BALANCE.insuredRevenueMultiplier : BALANCE.selfPayRevenueMultiplier;
    revenue += service.baseRevenue * (1 + premiumBonus + facilityFit * 0.3) * payerMultiplier * preset.revenueMultiplier;
    variableCosts += (service.baseRevenue * 0.14 + service.duration * 0.7) * (1 + modifier.variableCostShift);
    adminLoad += service.adminLoad + archetype.adminBurden;
    totalWait += wait;
    outcomes.push(outcome);
    attended += 1;
    resolvedVisits.push(markCompletedVisit(visit));
    journeyEvents.push({ patientId: visit.patientId, result: 'completed', wait, outcome, satisfaction, service: visit.service });

    const fatigueGain = service.fatigueImpact * BALANCE.fatigueServiceScale * (1 - staff.fatigueResistance * BALANCE.fatigueResistanceWeight) * (1 + (1 - layoutFlow.staffEfficiencyMultiplier));
    staff.fatigue = clamp(staff.fatigue + fatigueGain, 0, 100);
    staff.morale = clamp(staff.morale + (satisfaction - 0.6) * 5 + moraleGain * BALANCE.moraleGainScaling, 0, 100);
    burnoutPressure += staff.fatigue > 70 ? 1 : 0;
  }

  for (const visit of queue.slice(effectiveCapacity)) {
    journeyEvents.push({ patientId: visit.patientId, result: 'unserved', wait: 0, outcome: 0, satisfaction: 0, service: visit.service });
  }

  return { revenue, variableCosts, adminLoad, totalWait, cancellations, noShows, attended, capacityLost, outcomes, staffingBottlenecks, roomBottlenecks, equipmentBottlenecks, burnoutPressure, resolvedVisits, layoutFlow, journeyEvents };
};
