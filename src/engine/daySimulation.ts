import { DaySummary, GameState, PatientVisit } from '../types/game';
import { average, clamp } from './utils';
import { applyRandomEvent } from './events';
import { BALANCE, getDifficultyPreset, sumUpgradeEffect } from './simulationConfig';
import { applyReputationTiers, evaluateObjectives, getScenario, isScenarioFailed, isScenarioWon } from './campaign';
import { calculateDemandInputs } from './demandGeneration';
import { buildWeeklyLedger, resolveDailyEconomy, totalWeeklyFixedCosts } from './economy';
import { resolveVisits, treatmentCapacity } from './visitResolution';
import { buildDailyPatientFlow, updatePatientJourneys } from './patientJourney';

interface DemandBuild {
  leads: number;
  booked: PatientVisit[];
  newPatients: GameState['patients'];
  returningBooked: number;
  rebookedFromExisting: number;
  referrals: number;
  lostUnbooked: number;
  lostServiceMismatch: number;
}

const buildDailyDemand = (state: GameState): DemandBuild => {
  const { leads, bookingRate } = calculateDemandInputs(state);
  const flow = buildDailyPatientFlow(state, state.day, leads, bookingRate);
  return {
    leads: flow.inboundLeads,
    booked: flow.bookedVisits,
    newPatients: flow.newPatients,
    returningBooked: flow.returningBooked,
    rebookedFromExisting: flow.rebookedFromExisting,
    referrals: flow.referralLeads,
    lostUnbooked: flow.lostUnbooked,
    lostServiceMismatch: flow.lostServiceMismatch
  };
};

export const generatePatients = (state: GameState): PatientVisit[] => buildDailyDemand(state).booked;

export const runDay = (state: GameState): GameState => {
  if (state.gameOver || state.gameWon) return state;

  let next: GameState = {
    ...state,
    day: state.day + 1,
    staff: state.staff.map((member) => ({ ...member })),
    rooms: state.rooms.map((room) => ({ ...room })),
    patientQueue: state.patientQueue.map((visit) => ({ ...visit })),
    patients: state.patients.map((patient) => ({ ...patient, futureBookings: [...patient.futureBookings] })),
    operationalModifiers: { ...state.operationalModifiers }
  };

  next = applyRandomEvent(next);

  const demand = buildDailyDemand(next);
  const capacity = treatmentCapacity(next);
  const visits = resolveVisits(next, demand.booked, capacity);
  next.patients = updatePatientJourneys({ ...next, patients: [...next.patients, ...demand.newPatients] }, next.day, visits.journeyEvents);

  const avgOutcome = average(visits.outcomes);
  const avgWait = visits.attended > 0 ? visits.totalWait / visits.attended : 0;
  const utilization = capacity > 0 ? clamp(visits.attended / capacity, 0, 1.4) : 0;

  const adminReduction = sumUpgradeEffect(next, (effects) => effects.adminReduction);
  const docs = Math.max(
    0,
    next.backlogDocs + visits.adminLoad * (1 - adminReduction * BALANCE.adminReductionWeight) - next.staff.reduce((sum, staffMember) => sum + staffMember.documentation, 0) * BALANCE.documentationThroughput
  );
  const docsPenalty = docs > BALANCE.docsPenaltyThreshold ? (docs - BALANCE.docsPenaltyThreshold) * BALANCE.docsPenaltyUnit : 0;
  const variableCosts = visits.variableCosts + docsPenalty;
  const weeklyFixedCosts = totalWeeklyFixedCosts(next);
  const notes: string[] = [];

  const economy = resolveDailyEconomy(next, visits.revenue, variableCosts, weeklyFixedCosts);
  const { dayOfWeek, weeklyCostsApplied, daysUntilWeeklyCosts, expenses, profit } = economy;

  const updatedLedger = buildWeeklyLedger(next, dayOfWeek, visits.revenue, variableCosts, visits.attended, visits.noShows);

  const preset = getDifficultyPreset(next.difficultyPreset);
  const reputationDelta = clamp(
    (avgOutcome - 0.46) * 8 + utilization * 1.4 - avgWait * 0.025 - visits.noShows * 0.045 - visits.cancellations * 0.04 - docs * 0.025,
    -3,
    4
  ) - preset.reputationDecay;
  const referralSaturationPenalty = Math.max(0, (next.referrals - 28) * 0.08);
  const referralMomentum = next.patients.filter((patient) => patient.lifecycleState === 'discharged' && patient.lastTransitionDay === next.day).length * 0.08;
  const referralsDelta = Math.round(clamp(reputationDelta * 0.48 + visits.attended * 0.038 - visits.capacityLost * 0.03 + 0.22 + referralMomentum - referralSaturationPenalty, -2, 4));
  const fatigueIndex = clamp(average(next.staff.map((staffMember) => staffMember.fatigue)) / 100, 0, 1);

  next.staff = next.staff.map((staffMember) => ({
    ...staffMember,
    xp: staffMember.xp + (staffMember.scheduled && staffMember.trainingDaysRemaining === 0 ? 7 : 0),
    level: Math.min(5, Math.floor((staffMember.xp + (staffMember.scheduled ? 7 : 0)) / 120) + 1),
    trainingDaysRemaining: Math.max(0, staffMember.trainingDaysRemaining - 1),
    scheduled: staffMember.trainingDaysRemaining > 0 ? false : staffMember.scheduled,
    shift: staffMember.trainingDaysRemaining > 0 ? 'off' : staffMember.shift,
    fatigue: clamp(
      staffMember.fatigue - BALANCE.dailyFatigueRecovery + (1 - staffMember.fatigueResistance) * BALANCE.lowResistanceRecoveryPenalty + (staffMember.shift === 'full' ? 1.4 : 0),
      0,
      100
    ),
    morale: clamp(staffMember.morale + (staffMember.shift === 'off' ? 2.2 : 0) - (staffMember.fatigue > 78 ? 1.5 : 0), 0, 100),
    burnoutRisk: clamp(
      staffMember.burnoutRisk + (staffMember.fatigue > 80 ? 0.03 : -0.015) + (staffMember.shift === 'off' ? -0.02 : 0),
      0,
      1
    )
  }));

  next.cash += profit;
  next.payrollDue = Math.round(weeklyFixedCosts);
  next.backlogDocs = docs;
  next.fatigueIndex = fatigueIndex;
  next.reputation = clamp(next.reputation + reputationDelta, 0, 100);
  next.referrals = Math.max(0, next.referrals + referralsDelta);
  next.patientQueue = demand.booked;
  next.weeklyLedger = updatedLedger;
  next.lifetimeStats = {
    attendedVisits: next.lifetimeStats.attendedVisits + visits.attended,
    avgOutcomeRolling:
      next.lifetimeStats.attendedVisits + visits.attended > 0
        ? (next.lifetimeStats.avgOutcomeRolling * next.lifetimeStats.attendedVisits + avgOutcome * visits.attended) /
          (next.lifetimeStats.attendedVisits + visits.attended)
        : next.lifetimeStats.avgOutcomeRolling
  };

  if (next.day % 7 === 0) next.week += 1;

  if (dayOfWeek === 7 && next.loan) {
    const scheduledPayment = next.loan.weeklyPayment;
    const interestDue = next.loan.principal * next.loan.interestRate;
    const payment = Math.min(next.cash + Math.max(0, next.loan.principal), scheduledPayment);
    next.cash -= payment;
    const principalPaid = Math.max(0, payment - interestDue);
    const principalRemaining = Math.max(0, next.loan.principal - principalPaid);
    next.loan = principalRemaining <= 0 || next.loan.weeksRemaining <= 1 ? null : { ...next.loan, principal: principalRemaining, weeksRemaining: next.loan.weeksRemaining - 1 };
    notes.push(`Loan payment processed: $${Math.round(payment)} (${Math.round(principalPaid)} principal).`);
    if (payment < scheduledPayment) {
      next.reputation = clamp(next.reputation - 1.2, 0, 100);
      notes.push('Underpaid financing installment harmed lender confidence.');
    }
  }
  const hasScheduledStaff = next.staff.some((staffMember) => staffMember.scheduled);
  if (visits.capacityLost > 0) notes.push('Demand exceeded daily capacity. Add clinicians or rooms to capture growth.');
  if (visits.staffingBottlenecks > 0) notes.push(`Staffing bottleneck hit ${visits.staffingBottlenecks} visits. Reassign staff or add training coverage.`);
  if (visits.roomBottlenecks > 0) notes.push(`Room bottleneck hit ${visits.roomBottlenecks} visits. Build required room types for service mix.`);
  if (visits.equipmentBottlenecks > 0) notes.push(`Equipment quality constrained ${visits.equipmentBottlenecks} visits. Upgrade key room equipment.`);
  if (demand.lostServiceMismatch > 0) notes.push('Some leads requested services your clinic cannot provide yet.');
  if (visits.cancellations + visits.noShows > visits.attended * 0.45) notes.push('Attendance reliability is poor. Booking/no-show tools can recover demand.');
  if (docs > 12) notes.push('Documentation backlog is adding variable cost drag.');
  if (dayOfWeek >= 5) notes.push(`Weekly liabilities due in ${daysUntilWeeklyCosts} day(s): $${Math.round(weeklyFixedCosts)}.`);
  if (!hasScheduledStaff) notes.push('No staff were scheduled today, so no patients were treated.');
  if (average(next.staff.map((staffMember) => staffMember.burnoutRisk)) > 0.5) notes.push('Burnout risk is rising. Use half/off shifts and stagger training to recover morale.');
  if (next.operationalModifiers.note) notes.push(next.operationalModifiers.note);

  const summary: DaySummary = {
    day: next.day,
    revenue: Math.round(visits.revenue),
    expenses: Math.round(expenses),
    profit: Math.round(profit),
    fixedCosts: Math.round(weeklyCostsApplied),
    variableCosts: Math.round(variableCosts),
    daysUntilWeeklyCosts,
    weeklyCostsDueNext: Math.round(weeklyFixedCosts),
    inboundLeads: demand.leads,
    bookedVisits: demand.booked.length,
    attendedVisits: visits.attended,
    utilization: Number((utilization * 100).toFixed(1)),
    lostDemand: {
      unbooked: demand.lostUnbooked,
      serviceMismatch: demand.lostServiceMismatch,
      capacity: visits.capacityLost,
      cancellations: visits.cancellations,
      noShows: visits.noShows
    },
    treated: visits.attended,
    noShows: visits.noShows,
    avgOutcome: Number(avgOutcome.toFixed(2)),
    avgWait: Number(avgWait.toFixed(1)),
    bottlenecks: {
      staffing: visits.staffingBottlenecks,
      room: visits.roomBottlenecks,
      equipment: visits.equipmentBottlenecks,
      burnout: visits.burnoutPressure
    },
    notes: [...notes, `Demand sources: new leads ${demand.leads}, returning booked ${demand.returningBooked}, referrals ${demand.referrals}.`]
  };

  next.latestSummary = summary;
  next.demandSnapshot = {
    inboundLeads: demand.leads,
    bookedVisits: demand.booked.length,
    utilization: summary.utilization,
    lostDemand: summary.lostDemand
  };
  next.eventLog = [
    `${next.day}: Leads ${summary.inboundLeads} → booked ${summary.bookedVisits} → attended ${summary.attendedVisits}. Profit $${summary.profit}.`,
    ...next.eventLog
  ].slice(0, 12);

  const scenario = getScenario(next.scenarioId);
  const bankruptcy = next.cash < scenario.failure.maxDebt && next.day > 14;
  const reputationCollapse = next.reputation < 2 && next.day > 20;
  const burnoutCollapse = next.fatigueIndex > 0.96 && next.day > 20;

  next = applyReputationTiers(next);
  next = evaluateObjectives(next);

  const mandatoryObjectivesMet = isScenarioWon(next);
  const deadlineReached = next.week >= next.campaignGoal.targetWeek;
  const objectiveDeadlineFail = deadlineReached && !mandatoryObjectivesMet && next.mode === 'campaign';

  next.gameOver = bankruptcy || reputationCollapse || burnoutCollapse || isScenarioFailed(next) || objectiveDeadlineFail;
  next.gameWon = next.mode === 'campaign' && mandatoryObjectivesMet && deadlineReached;

  next.operationalModifiers = {
    leadMultiplier: 1,
    bookingShift: 0,
    cancellationShift: 0,
    noShowShift: next.dev?.highNoShowMode ? 0.2 : 0,
    variableCostShift: 0
  };

  return next;
};
