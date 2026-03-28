import { DaySummary, GameState, StaffMember } from '../types/game';

type DriverTone = 'positive' | 'negative' | 'neutral';

export interface MetricDriver {
  label: string;
  detail: string;
  tone: DriverTone;
}

export interface FinanceSnapshot {
  runwayWeeks: number;
  breakevenGap: number;
  marginPct: number;
  docsPenaltyEstimate: number;
}

export interface StaffInsight {
  label: string;
  value: string;
  tone: DriverTone;
}

const pct = (value: number) => `${Math.round(value * 100)}%`;

const average = (items: number[]) => (items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : 0);

const staffByRole = (staff: StaffMember[], role: StaffMember['role']) => staff.filter((member) => member.role === role);

export const formatSignedCurrency = (value: number) => `${value >= 0 ? '+' : '-'}$${Math.round(Math.abs(value))}`;

export const getFinanceSnapshot = (state: GameState): FinanceSnapshot => {
  const latest = state.latestSummary;
  const docsPenaltyEstimate = state.backlogDocs > 11 ? Math.round((state.backlogDocs - 11) * 14) : 0;
  const runwayWeeks = state.cash > 0 ? state.cash / Math.max(1, state.payrollDue) : 0;
  const marginPct = latest ? (latest.profit / Math.max(1, latest.revenue || 1)) * 100 : 0;
  const breakevenGap = latest ? latest.revenue - (latest.variableCosts + state.payrollDue / 7) : 0;
  return { runwayWeeks, breakevenGap, marginPct, docsPenaltyEstimate };
};

export const getClinicDrivers = (state: GameState): MetricDriver[] => {
  const latest = state.latestSummary;
  if (!latest) {
    return [{ label: 'No operating data yet', detail: 'Run one day to unlock performance diagnostics.', tone: 'neutral' }];
  }

  const drivers: MetricDriver[] = [];
  const conversion = latest.inboundLeads > 0 ? latest.bookedVisits / latest.inboundLeads : 0;
  const attendance = latest.bookedVisits > 0 ? latest.attendedVisits / latest.bookedVisits : 0;

  if (latest.profit >= 250) drivers.push({ label: 'Strong daily profitability', detail: `Profit ${formatSignedCurrency(latest.profit)} yesterday.`, tone: 'positive' });
  else if (latest.profit < 0) drivers.push({ label: 'Daily operation is losing money', detail: `Profit ${formatSignedCurrency(latest.profit)} yesterday.`, tone: 'negative' });

  if (conversion < 0.55) drivers.push({ label: 'Lead conversion is weak', detail: `${pct(conversion)} of leads booked. Improve front-desk capacity or online booking.`, tone: 'negative' });
  else drivers.push({ label: 'Lead conversion healthy', detail: `${pct(conversion)} of leads become bookings.`, tone: 'positive' });

  if (attendance < 0.8) drivers.push({ label: 'Attendance leakage', detail: `${pct(attendance)} of bookings attended; no-shows/cancellations are costly.`, tone: 'negative' });
  if (state.latestSchedule.spilloverMinutes > 20) drivers.push({ label: 'Queue spillover', detail: `${state.latestSchedule.spilloverMinutes} min overtime from delays/overruns.`, tone: 'negative' });
  if (state.latestSchedule.unusedGaps > 10) drivers.push({ label: 'Unused schedule gaps', detail: `${state.latestSchedule.unusedGaps} slots idle yesterday.`, tone: 'neutral' });
  if (latest.utilization > 92) drivers.push({ label: 'Clinic near capacity', detail: `Utilization ${latest.utilization.toFixed(0)}%: room/staff expansion can unlock growth.`, tone: 'neutral' });
  if (state.fatigueIndex > 0.75) drivers.push({ label: 'Fatigue threatens quality', detail: `Fatigue index ${(state.fatigueIndex * 100).toFixed(0)}%. Rotate shifts or train.`, tone: 'negative' });

  return drivers.slice(0, 5);
};

export const getStaffInsights = (state: GameState): StaffInsight[] => {
  const scheduled = state.staff.filter((member) => member.scheduled && member.shift !== 'off');
  const clinicalScheduled = scheduled.filter((member) => ['physio', 'assistant', 'specialist', 'manualTherapist', 'strengthCoach'].includes(member.role));
  const avgFatigue = average(scheduled.map((member) => member.fatigue));
  const avgMorale = average(scheduled.map((member) => member.morale));
  const frontDeskCoverage = staffByRole(scheduled, 'frontDesk').length;

  return [
    {
      label: 'Clinical coverage',
      value: `${clinicalScheduled.length}/${Math.max(1, state.staff.length - staffByRole(state.staff, 'frontDesk').length - staffByRole(state.staff, 'careCoordinator').length)} scheduled`,
      tone: clinicalScheduled.length === 0 ? 'negative' : clinicalScheduled.length <= 1 ? 'neutral' : 'positive'
    },
    {
      label: 'Front desk coverage',
      value: frontDeskCoverage > 0 ? 'Covered' : 'Uncovered',
      tone: frontDeskCoverage > 0 ? 'positive' : 'negative'
    },
    {
      label: 'Avg shift fatigue',
      value: avgFatigue ? `${avgFatigue.toFixed(0)} / 100` : 'No active shifts',
      tone: avgFatigue > 70 ? 'negative' : avgFatigue > 50 ? 'neutral' : 'positive'
    },
    {
      label: 'Avg shift morale',
      value: avgMorale ? `${avgMorale.toFixed(0)} / 100` : 'No active shifts',
      tone: avgMorale < 40 ? 'negative' : avgMorale < 60 ? 'neutral' : 'positive'
    }
  ];
};

export const getDemandPressure = (summary: DaySummary | undefined) => {
  if (!summary) {
    return [
      { label: 'Funnel', value: 'No data yet', tone: 'neutral' as const },
      { label: 'Lost opportunity', value: 'Run first day', tone: 'neutral' as const }
    ];
  }

  const totalLost = summary.lostDemand.unbooked + summary.lostDemand.capacity + summary.lostDemand.serviceMismatch + summary.lostDemand.noShows + summary.lostDemand.cancellations;
  const largestBucket = ([
    ['unbooked', summary.lostDemand.unbooked],
    ['capacity', summary.lostDemand.capacity],
    ['service mismatch', summary.lostDemand.serviceMismatch],
    ['no-shows', summary.lostDemand.noShows + summary.lostDemand.cancellations]
  ] as [string, number][]).sort((a, b) => b[1] - a[1])[0];

  return [
    {
      label: 'Lead → Booked → Attended',
      value: `${summary.inboundLeads} → ${summary.bookedVisits} → ${summary.attendedVisits}`,
      tone: summary.attendedVisits >= Math.ceil(summary.bookedVisits * 0.8) ? 'positive' : 'neutral'
    },
    {
      label: 'Lost opportunity',
      value: `${totalLost} total (largest: ${largestBucket[0]} ${largestBucket[1]})`,
      tone: totalLost > summary.attendedVisits ? 'negative' : 'neutral'
    }
  ];
};
