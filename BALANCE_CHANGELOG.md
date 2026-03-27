# Balance changelog (tycoon expansion pass)

## Economy and growth controls
- Lowered physiotherapist base wage from **390** to **360** to make clinician expansion less punishing in weeks 2–6.
- Reduced base build/maintenance costs for core expansion rooms:
  - treatment room cost **2050 → 1825**, maintenance **62 → 58**
  - gym cost **2550 → 2300**, maintenance **75 → 70**
- Lowered baseline treatment capacity per scheduled staff from **5.4** to **4.4**.
- Lowered aggregate room throughput scaling (`roomThroughputUnit`) from **6.0** to **5.0**.
- Tightened documentation pressure by changing backlog penalty from:
  - threshold **11 → 10**
  - penalty unit **14 → 15**
- Reworked referral growth in daily simulation:
  - Lowered positive conversion from reputation and attended volume.
  - Increased penalty for unmet capacity.
  - Added a soft saturation penalty once referrals exceed **28**.
  - Reduced max daily referral growth cap from **+5** to **+3**.

## Revenue / dominant strategy reduction
- Reduced `premium_branding` pricing effect from **+12%** to **+8%**.

## Room and equipment ROI
- Increased equipment contribution in facility fit from **0.06** to **0.08** per equipment tier delta (scaled by service equipment sensitivity), so targeted room upgrades reach breakeven sooner.

## Campaign objective tuning
- `sports_performance` caseload objective target:
  - attended visits **240 → 225** by week 12.
- `insurance_crunch` reputation stability objective target:
  - reputation **68 → 66** by week 12.
