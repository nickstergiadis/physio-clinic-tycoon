import { DailyTrendPoint, DaySummary, DiagnosticCategory, GameState, InsightSeverity, PatientVisit, ThoughtInsight, WeeklyReport } from '../types/game';
import { average, clamp } from './utils';
import { applyDailyIncidents, settleIncidentsAfterDay } from './events';
import { BALANCE, getDifficultyPreset, sumUpgradeEffect } from './simulationConfig';
import { applyReputationTiers, evaluateObjectives, getScenario, isScenarioFailed, isScenarioWon } from './campaign';
import { calculateDemandInputs } from './demandGeneration';
import { buildWeeklyLedger, resolveDailyEconomy, totalWeeklyFixedCosts } from './economy';
import { resolveVisits, treatmentCapacity } from './visitResolution';
import { buildDailyPatientFlow, updatePatientJourneys } from './patientJourney';
import { baseScheduleMetrics } from './queueManagement';
import { getItemEffectTotals } from './buildItems';

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

const severityFromScore = (score: number): InsightSeverity => (score >= 8 ? 'high' : score >= 4 ? 'medium' : 'low');

const buildDiagnosticCategories = (inputs: {
  avgWait: number;
  avgOutcome: number;
  docs: number;
  utilization: number;
  demand: DemandBuild;
  visits: ReturnType<typeof resolveVisits>;
  profit: number;
  conversion: number;
  attendance: number;
  fatigueIndex: number;
}) => {
  const complaints: DiagnosticCategory[] = [];
  const positives: DiagnosticCategory[] = [];
  const pushComplaint = (category: string, label: string, score: number, reason: string) => {
    if (score <= 0) return;
    complaints.push({ category, label, score: Number(score.toFixed(1)), severity: severityFromScore(score), reason });
  };
  const pushPositive = (category: string, label: string, score: number, reason: string) => {
    if (score <= 0) return;
    positives.push({ category, label, score: Number(score.toFixed(1)), severity: severityFromScore(score), reason });
  };

  pushComplaint('wait', 'Long waits', inputs.avgWait / 5, `${inputs.avgWait.toFixed(0)} min average wait.`);
  pushComplaint('capacity', 'Capacity overflow', inputs.visits.capacityLost * 0.9, `${inputs.visits.capacityLost} patients were unserved by capacity.`);
  pushComplaint('attendance', 'No-show/cancel drag', (inputs.visits.noShows + inputs.visits.cancellations) * 0.8, `${inputs.visits.noShows + inputs.visits.cancellations} missed visits.`);
  pushComplaint('staffing', 'Staff bottlenecks', inputs.visits.staffingBottlenecks * 1.2, `${inputs.visits.staffingBottlenecks} visits blocked by staffing.`);
  pushComplaint('rooms', 'Room mismatch', (inputs.visits.roomBottlenecks + inputs.demand.lostServiceMismatch) * 0.85, `${inputs.visits.roomBottlenecks + inputs.demand.lostServiceMismatch} visits/leads blocked by room or service gaps.`);
  pushComplaint('documentation', 'Documentation backlog', Math.max(0, inputs.docs - 8) * 0.8, `${inputs.docs.toFixed(1)} docs backlog units.`);
  pushComplaint('burnout', 'Burnout pressure', inputs.fatigueIndex * 10, `${Math.round(inputs.fatigueIndex * 100)}% fatigue index.`);

  pushPositive('profit', 'Strong daily profit', inputs.profit > 0 ? inputs.profit / 120 : 0, `Profit ${inputs.profit >= 0 ? '+' : '-'}$${Math.round(Math.abs(inputs.profit))}.`);
  pushPositive('outcomes', 'Clinical outcomes', inputs.avgOutcome * 10, `${(inputs.avgOutcome * 100).toFixed(0)}% outcome score.`);
  pushPositive('conversion', 'Lead conversion', inputs.conversion * 10, `${(inputs.conversion * 100).toFixed(0)}% of leads booked.`);
  pushPositive('attendance', 'Attendance reliability', inputs.attendance * 10, `${(inputs.attendance * 100).toFixed(0)}% booking attendance.`);
  pushPositive('utilization', 'Capacity utilization', Math.max(0, Math.min(10, (inputs.utilization - 45) / 5)), `${inputs.utilization.toFixed(1)}% utilization.`);

  return {
    complaints: complaints.sort((a, b) => b.score - a.score).slice(0, 3),
    positives: positives.sort((a, b) => b.score - a.score).slice(0, 3)
  };
};

const buildThoughts = (inputs: {
  day: number;
  avgWait: number;
  avgOutcome: number;
  docs: number;
  demand: DemandBuild;
  visits: ReturnType<typeof resolveVisits>;
  utilization: number;
  staffMorale: number;
  staffFatigue: number;
  topComplaints: DiagnosticCategory[];
  topPositives: DiagnosticCategory[];
}) => {
  const patientThoughts: ThoughtInsight[] = [];
  const staffThoughts: ThoughtInsight[] = [];

  const addPatientThought = (category: string, severity: InsightSeverity, text: string, cause: string, metric: number, relatedService?: ThoughtInsight['relatedService']) => {
    patientThoughts.push({ id: `pt-${inputs.day}-${patientThoughts.length}`, actor: 'patient', category, severity, text, cause, metric, relatedService });
  };
  const addStaffThought = (category: string, severity: InsightSeverity, text: string, cause: string, metric: number, relatedService?: ThoughtInsight['relatedService']) => {
    staffThoughts.push({ id: `st-${inputs.day}-${staffThoughts.length}`, actor: 'staff', category, severity, text, cause, metric, relatedService });
  };

  if (inputs.avgWait > 35) addPatientThought('wait', 'high', 'Waited too long before treatment.', `Average wait hit ${inputs.avgWait.toFixed(0)} min.`, inputs.avgWait);
  else if (inputs.avgWait > 18) addPatientThought('wait', 'medium', 'Reception felt a bit slow today.', `Average wait ${inputs.avgWait.toFixed(0)} min.`, inputs.avgWait);
  else addPatientThought('wait', 'low', 'Got seen quickly with minimal waiting.', `Average wait ${inputs.avgWait.toFixed(0)} min.`, inputs.avgWait);

  const missed = inputs.visits.noShows + inputs.visits.cancellations + inputs.visits.capacityLost;
  if (missed > 0) addPatientThought('access', missed > 6 ? 'high' : 'medium', 'Could not get the slot I needed.', `${missed} patients missed care from no-shows/cancels/capacity.`, missed);
  if (inputs.avgOutcome > 0.62) addPatientThought('outcome', 'low', 'Treatment felt effective today.', `${(inputs.avgOutcome * 100).toFixed(0)}% average outcome score.`, inputs.avgOutcome * 100);
  else if (inputs.avgOutcome < 0.42) addPatientThought('outcome', 'high', 'Progress felt limited this visit.', `${(inputs.avgOutcome * 100).toFixed(0)}% average outcome score.`, inputs.avgOutcome * 100);

  if (inputs.staffFatigue > 72) addStaffThought('fatigue', 'high', 'Team is stretched; pace is not sustainable.', `Average fatigue ${inputs.staffFatigue.toFixed(0)}/100.`, inputs.staffFatigue);
  else if (inputs.staffFatigue > 55) addStaffThought('fatigue', 'medium', 'Fatigue is climbing by end of day.', `Average fatigue ${inputs.staffFatigue.toFixed(0)}/100.`, inputs.staffFatigue);
  else addStaffThought('fatigue', 'low', 'Workload felt manageable this shift.', `Average fatigue ${inputs.staffFatigue.toFixed(0)}/100.`, inputs.staffFatigue);

  if (inputs.docs > 12) addStaffThought('documentation', 'high', 'Documentation backlog slowed us down.', `${inputs.docs.toFixed(1)} docs backlog units.`, inputs.docs);
  if (inputs.utilization > 95) addStaffThought('capacity', 'medium', 'Schedule was near max capacity all day.', `${inputs.utilization.toFixed(1)}% utilization.`, inputs.utilization);
  if (inputs.staffMorale > 68) addStaffThought('morale', 'low', 'Patients responded well; morale improved.', `Average morale ${inputs.staffMorale.toFixed(0)}/100.`, inputs.staffMorale);
  else if (inputs.staffMorale < 45) addStaffThought('morale', 'high', 'Morale dipped after a rough day.', `Average morale ${inputs.staffMorale.toFixed(0)}/100.`, inputs.staffMorale);

  for (const issue of inputs.topComplaints.slice(0, 2)) {
    addStaffThought(issue.category, issue.severity, `${issue.label} needs action next.`, issue.reason, issue.score);
  }
  for (const win of inputs.topPositives.slice(0, 1)) {
    addPatientThought(win.category, 'low', `${win.label} improved the visit feel.`, win.reason, win.score);
  }

  return {
    patientThoughts: patientThoughts.slice(0, 6),
    staffThoughts: staffThoughts.slice(0, 6)
  };
};

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

const pickWeeklyRiskAndTip = (latest: DaySummary | undefined): { topRisk: string; coachingTip: string } => {
  if (!latest) return { topRisk: 'No critical risk detected.', coachingTip: 'Keep balancing throughput and quality while growing steadily.' };
  if (latest.lostDemand.capacity > Math.max(4, latest.attendedVisits * 0.35)) {
    return {
      topRisk: 'Capacity overflow is leaking demand.',
      coachingTip: 'Prioritize one capacity fix this week: add a clinician shift, room, or lower booking aggressiveness.'
    };
  }
  if (latest.lostDemand.noShows + latest.lostDemand.cancellations > Math.max(3, latest.bookedVisits * 0.3)) {
    return {
      topRisk: 'Attendance reliability is unstable.',
      coachingTip: 'Adopt balanced booking and invest in no-show reduction upgrades before scaling ads.'
    };
  }
  if (latest.avgOutcome < 0.5) {
    return {
      topRisk: 'Clinical outcomes are under target.',
      coachingTip: 'Improve service/room fit and staffing quality before pursuing aggressive growth.'
    };
  }
  if (latest.profit < 0) {
    return {
      topRisk: 'Weekly profitability is fragile.',
      coachingTip: 'Protect runway: pause expansion for 1-2 weeks and clear documentation/throughput bottlenecks.'
    };
  }
  return {
    topRisk: 'No critical risk detected.',
    coachingTip: 'Momentum is healthy. Scale one system at a time and keep a 2-week cash cushion.'
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

  next = applyDailyIncidents(next);

  const demand = buildDailyDemand(next);
  const capacity = treatmentCapacity(next);
  const visits = resolveVisits(next, demand.booked, capacity);
  next.patients = updatePatientJourneys({ ...next, patients: [...next.patients, ...demand.newPatients] }, next.day, visits.journeyEvents);

  const avgOutcome = average(visits.outcomes);
  const avgWait = visits.attended > 0 ? visits.totalWait / visits.attended : 0;
  const utilization = capacity > 0 ? clamp(visits.attended / capacity, 0, 1.4) : 0;
  const conversion = demand.leads > 0 ? demand.booked.length / demand.leads : 0;
  const attendance = demand.booked.length > 0 ? visits.attended / demand.booked.length : 0;

  const adminReduction = sumUpgradeEffect(next, (effects) => effects.adminReduction);
  const itemEffects = getItemEffectTotals(next);
  const docs = Math.max(
    0,
    next.backlogDocs +
      visits.adminLoad * (1 - adminReduction * BALANCE.adminReductionWeight) * (1 - Math.min(0.28, itemEffects.adminEfficiency)) -
      next.staff.reduce((sum, staffMember) => sum + staffMember.documentation, 0) * BALANCE.documentationThroughput
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
  const avgStaffMorale = average(next.staff.map((staffMember) => staffMember.morale));
  const avgStaffFatigue = average(next.staff.map((staffMember) => staffMember.fatigue));
  const diagnosticCategories = buildDiagnosticCategories({
    avgWait,
    avgOutcome,
    docs,
    utilization: utilization * 100,
    demand,
    visits,
    profit,
    conversion,
    attendance,
    fatigueIndex
  });
  const thoughts = buildThoughts({
    day: next.day,
    avgWait,
    avgOutcome,
    docs,
    demand,
    visits,
    utilization: utilization * 100,
    staffMorale: avgStaffMorale,
    staffFatigue: avgStaffFatigue,
    topComplaints: diagnosticCategories.complaints,
    topPositives: diagnosticCategories.positives
  });

  next.staff = next.staff.map((staffMember) => ({
    ...staffMember,
    xp: staffMember.xp + (staffMember.scheduled && staffMember.trainingDaysRemaining === 0 ? 7 : 0),
    level: Math.min(5, Math.floor((staffMember.xp + (staffMember.scheduled ? 7 : 0)) / 120) + 1),
    trainingDaysRemaining: Math.max(0, staffMember.trainingDaysRemaining - 1),
    scheduled: staffMember.trainingDaysRemaining > 0 ? false : staffMember.scheduled,
    shift: staffMember.trainingDaysRemaining > 0 ? 'off' : staffMember.shift,
    fatigue: clamp(
      staffMember.fatigue - BALANCE.dailyFatigueRecovery - itemEffects.moraleRecovery * 8 + (1 - staffMember.fatigueResistance) * BALANCE.lowResistanceRecoveryPenalty + (staffMember.shift === 'full' ? 1.4 : 0) + visits.schedule.spilloverMinutes / 180,
      0,
      100
    ),
    morale: clamp(
      staffMember.morale + (staffMember.shift === 'off' ? 2.2 : 0) + itemEffects.moraleRecovery * 6 - (staffMember.fatigue > 78 ? 1.5 : 0) - visits.schedule.missedAppointments * 0.08,
      0,
      100
    ),
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
  if (visits.layoutFlow.warnings.length > 0) notes.push(`Layout warning: ${visits.layoutFlow.warnings[0]}`);
  if (visits.staffingBottlenecks > 0) notes.push(`Staffing bottleneck hit ${visits.staffingBottlenecks} visits. Reassign staff or add training coverage.`);
  if (visits.roomBottlenecks > 0) notes.push(`Room bottleneck hit ${visits.roomBottlenecks} visits. Build required room types for service mix.`);
  if (visits.equipmentBottlenecks > 0) notes.push(`Equipment quality constrained ${visits.equipmentBottlenecks} visits. Upgrade key room equipment.`);
  if (demand.lostServiceMismatch > 0) notes.push('Some leads requested services your clinic cannot provide yet.');
  if (visits.cancellations + visits.noShows > visits.attended * 0.45) notes.push('Attendance reliability is poor. Booking/no-show tools can recover demand.');
  if (docs > 12) notes.push('Documentation backlog is adding variable cost drag.');
  if (dayOfWeek >= 5) notes.push(`Weekly liabilities due in ${daysUntilWeeklyCosts} day(s): $${Math.round(weeklyFixedCosts)}.`);
  if (!hasScheduledStaff) notes.push('No staff were scheduled today, so no patients were treated.');
  if (average(next.staff.map((staffMember) => staffMember.burnoutRisk)) > 0.5) notes.push('Burnout risk is rising. Use half/off shifts and stagger training to recover morale.');
  if (visits.layoutFlow.congestionIndex > 1.35) notes.push(`Hallway congestion index ${visits.layoutFlow.congestionIndex.toFixed(2)} is slowing patient flow.`);
  if (visits.schedule.spilloverMinutes > 25) notes.push(`Day spilled over by ${visits.schedule.spilloverMinutes} minutes. Consider less aggressive booking or adding staff.`);
  if (visits.schedule.missedAppointments > Math.max(2, visits.attended * 0.25)) notes.push('High missed appointments today. Front-desk quality and booking policy matter more now.');
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
    patientThoughts: thoughts.patientThoughts,
    staffThoughts: thoughts.staffThoughts,
    topComplaints: diagnosticCategories.complaints,
    topPositives: diagnosticCategories.positives,
    serviceLinePerformance: visits.serviceLines.sort((a, b) => b.profit - a.profit),
    notes: [...notes, `Demand sources: new leads ${demand.leads}, returning booked ${demand.returningBooked}, referrals ${demand.referrals}.`],
    layoutFlow: {
      avgTravelTiles: visits.layoutFlow.avgTravelTiles,
      waitPenaltyMinutes: visits.layoutFlow.waitPenaltyMinutes,
      throughputMultiplier: visits.layoutFlow.throughputMultiplier,
      satisfactionPenalty: visits.layoutFlow.satisfactionPenalty,
      staffEfficiencyMultiplier: visits.layoutFlow.staffEfficiencyMultiplier,
      congestionIndex: visits.layoutFlow.congestionIndex,
      warnings: visits.layoutFlow.warnings,
      unreachableRoutes: visits.layoutFlow.unreachableRoutes,
      heatmap: visits.layoutFlow.heatmap
    },
    schedule: {
      policy: next.bookingPolicy,
      slotsUsed: visits.schedule.slotsUsed,
      totalSlots: 36,
      queueLengthPeak: visits.schedule.queueLengthPeak,
      missedAppointments: visits.schedule.missedAppointments,
      lateArrivals: visits.schedule.lateArrivals,
      earlyArrivals: visits.schedule.earlyArrivals,
      overruns: visits.schedule.overruns,
      spilloverMinutes: visits.schedule.spilloverMinutes,
      unusedGaps: visits.schedule.unusedGaps
    }
  };

  next.latestSummary = summary;
  const trendPoint: DailyTrendPoint = {
    day: next.day,
    cash: Math.round(next.cash),
    reputation: Number(next.reputation.toFixed(1)),
    utilization: summary.utilization,
    profit: summary.profit,
    avgOutcome: summary.avgOutcome,
    avgWait: summary.avgWait,
    attendedVisits: summary.attendedVisits,
    noShows: summary.noShows
  };
  next.dailyTrends = [...next.dailyTrends, trendPoint].slice(-84);
  next.latestSchedule = summary.schedule;
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

  if (dayOfWeek === 7) {
    const weekDays = next.dailyTrends.slice(-7);
    const avgUtilization = weekDays.length > 0 ? average(weekDays.map((point) => point.utilization)) : 0;
    const avgOutcome = weekDays.length > 0 ? average(weekDays.map((point) => point.avgOutcome)) : summary.avgOutcome;
    const avgWait = weekDays.length > 0 ? average(weekDays.map((point) => point.avgWait)) : summary.avgWait;
    const weeklyProfit = next.weeklyLedger.revenue - next.weeklyLedger.variableCosts - weeklyFixedCosts;
    const weeklyReportGuide = pickWeeklyRiskAndTip(summary);
    const weeklyReport: WeeklyReport = {
      week: next.week,
      startDay: Math.max(1, next.day - 6),
      endDay: next.day,
      revenue: Math.round(next.weeklyLedger.revenue),
      expenses: Math.round(next.weeklyLedger.variableCosts + weeklyFixedCosts),
      profit: Math.round(weeklyProfit),
      attendedVisits: next.weeklyLedger.attendedVisits,
      noShows: next.weeklyLedger.noShows,
      avgUtilization: Number(avgUtilization.toFixed(1)),
      avgOutcome: Number(avgOutcome.toFixed(2)),
      avgWait: Number(avgWait.toFixed(1)),
      topRisk: weeklyReportGuide.topRisk,
      coachingTip: weeklyReportGuide.coachingTip
    };
    next.weeklyReports = [...next.weeklyReports, weeklyReport].slice(-16);
    next.eventLog = [`Weekly report W${weeklyReport.week}: ${weeklyReport.topRisk}`, ...next.eventLog].slice(0, 12);
  }

  const scenario = getScenario(next.scenarioId);
  const bankruptcy = next.cash < scenario.failure.maxDebt && next.day > 14;
  const reputationCollapse = next.reputation < 2 && next.day > 20;
  const burnoutCollapse = next.fatigueIndex > 0.96 && next.day > 20;

  next = applyReputationTiers(next);
  next = evaluateObjectives(next);
  next = settleIncidentsAfterDay(next);

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

  if (!next.latestSchedule) next.latestSchedule = baseScheduleMetrics(next.bookingPolicy);

  return next;
};
