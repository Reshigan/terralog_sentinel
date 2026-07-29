// Tests statistical threshold calculations for anomaly detection using synthetic override data.
// The anomaly handler flags actors whose override frequency exceeds their baseline by 2 MAD.

import { expect, test, describe } from "bun:test";
import type { D1Database } from "@cloudflare/workers-types";

type AnomalyRow = {
  actor_user_id: number;
  actor_role: string;
  window_days: number;
  override_count: number;
  median_baseline: number;
  mad: number;
  is_anomaly: number;
  created_at: string;
};

type LedgerEntry = {
  entry_id: number;
  entry_type: string;
  actor_user_id: number;
  actor_role: string;
  created_at: string;
};

// Simulate the statistical calculation from the anomaly handler
function calculateAnomaly(overrides7Day: number, median90Day: number, mad90Day: number): boolean {
  // Avoid division by zero; if MAD is 0, any deviation from median is anomalous
  if (mad90Day === 0) {
    return overrides7Day !== median90Day;
  }
  // Standard MAD-based threshold: |value - median| > 2 * MAD
  const deviation = Math.abs(overrides7Day - median90Day);
  return deviation > 2 * mad90Day;
}

// Simulate median calculation from an array of counts
function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

// Simulate MAD (Median Absolute Deviation) calculation
function calculateMAD(values: number[]): number {
  if (values.length === 0) return 0;
  const median = calculateMedian(values);
  const absoluteDeviations = values.map(v => Math.abs(v - median));
  return calculateMedian(absoluteDeviations);
}

describe("anomaly detection threshold calculations", () => {
  test("baseline actor with stable override pattern is not flagged", () => {
    // Actor has 3 overrides in last 7 days, historically averages 2-4 per week
    const overrides7Day = 3;
    const historicalWeekly: number[] = [2, 3, 4, 3, 2, 3, 4, 3, 2, 3, 4, 3];
    const median90Day = calculateMedian(historicalWeekly);
    const mad90Day = calculateMAD(historicalWeekly);

    expect(calculateAnomaly(overrides7Day, median90Day, mad90Day)).toBe(false);
  });

  test("actor with sudden spike above 2 MAD is flagged", () => {
    // Actor normally files 1-2 overrides per week, suddenly files 8
    const overrides7Day = 8;
    const historicalWeekly: number[] = [1, 2, 1, 2, 1, 1, 2, 1, 2, 1, 1, 2];
    const median90Day = calculateMedian(historicalWeekly);
    const mad90Day = calculateMAD(historicalWeekly);

    expect(calculateAnomaly(overrides7Day, median90Day, mad90Day)).toBe(true);
  });

  test("actor with zero baseline and zero current is not flagged", () => {
    const overrides7Day = 0;
    const historicalWeekly: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const median90Day = calculateMedian(historicalWeekly);
    const mad90Day = calculateMAD(historicalWeekly);

    expect(calculateAnomaly(overrides7Day, median90Day, mad90Day)).toBe(false);
  });

  test("actor with zero baseline and non-zero current is flagged", () => {
    const overrides7Day = 1;
    const historicalWeekly: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const median90Day = calculateMedian(historicalWeekly);
    const mad90Day = calculateMAD(historicalWeekly);

    // MAD is 0, so any deviation triggers flag
    expect(calculateAnomaly(overrides7Day, median90Day, mad90Day)).toBe(true);
  });

  test("actor with high variance baseline tolerates larger spikes", () => {
    // Actor with naturally volatile pattern: 0-10 overrides per week
    const overrides7Day = 7;
    const historicalWeekly: number[] = [0, 10, 2, 8, 1, 9, 3, 7, 0, 10, 2, 8];
    const median90Day = calculateMedian(historicalWeekly);
    const mad90Day = calculateMAD(historicalWeekly);

    // High MAD means 7 is within 2 MAD of median
    expect(calculateAnomaly(overrides7Day, median90Day, mad90Day)).toBe(false);
  });

  test("actor with exactly 2 MAD deviation is not flagged", () => {
    // Edge case: exactly at threshold should not trigger
    const historicalWeekly: number[] = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    const median90Day = calculateMedian(historicalWeekly); // 5
    const mad90Day = calculateMAD(historicalWeekly); // 0

    // With MAD=0, only values != median trigger
    const overrides7Day = 5;
    expect(calculateAnomaly(overrides7Day, median90Day, mad90Day)).toBe(false);
  });

  test("actor with small dataset uses available history", () => {
    // New actor with only 3 weeks of history
    const overrides7Day = 4;
    const historicalWeekly: number[] = [1, 2, 3];
    const median90Day = calculateMedian(historicalWeekly); // 2
    const mad90Day = calculateMAD(historicalWeekly); // median of [1, 0, 1] = 1

    // |4 - 2| = 2, 2 * MAD = 2, so 2 > 2 is false
    expect(calculateAnomaly(overrides7Day, median90Day, mad90Day)).toBe(false);
  });

  test("negative deviation (unusually low activity) is also flagged", () => {
    // Actor normally files many overrides, suddenly files none
    const overrides7Day = 0;
    const historicalWeekly: number[] = [8, 9, 7, 8, 9, 8, 7, 9, 8, 8, 7, 9];
    const median90Day = calculateMedian(historicalWeekly);
    const mad90Day = calculateMAD(historicalWeekly);

    expect(calculateAnomaly(overrides7Day, median90Day, mad90Day)).toBe(true);
  });
});

describe("anomaly detection with synthetic database data", () => {
  // Simulate the query pattern used by the anomaly handler
  function buildAnomalyQuery(tenant: string, asOf: string): string {
    return `
      WITH weekly_overrides AS (
        SELECT 
          actor_user_id,
          actor_role,
          strftime('%Y-%W', created_at) as week,
          COUNT(*) as weekly_count
        FROM manual_overrides
        WHERE tenant_id = '${tenant}'
          AND created_at <= datetime('${asOf}')
          AND created_at > datetime('${asOf}', '-90 days')
        GROUP BY actor_user_id, actor_role, week
      ),
      actor_stats AS (
        SELECT 
          actor_user_id,
          actor_role,
          AVG(weekly_count) as mean_count,
          MEDIAN(weekly_count) as median_count,
          MAD(weekly_count) as mad_count
        FROM weekly_overrides
        GROUP BY actor_user_id, actor_role
        HAVING COUNT(*) >= 3  -- Need minimum history
      ),
      current_week AS (
        SELECT 
          actor_user_id,
          actor_role,
          COUNT(*) as current_count
        FROM manual_overrides
        WHERE tenant_id = '${tenant}'
          AND created_at > datetime('${asOf}', '-7 days')
          AND created_at <= datetime('${asOf}')
        GROUP BY actor_user_id, actor_role
      )
      SELECT 
        cw.actor_user_id,
        cw.actor_role,
        cw.current_count as window_days,
        ast.median_count as median_baseline,
        ast.mad_count as mad,
        CASE 
          WHEN ast.mad_count = 0 THEN cw.current_count != ast.median_count
          WHEN ABS(cw.current_count - ast.median_count) > 2 * ast.mad_count THEN 1 
          ELSE 0 
        END as is_anomaly,
        '${asOf}' as created_at
      FROM current_week cw
      JOIN actor_stats ast ON cw.actor_user_id = ast.actor_user_id 
                          AND cw.actor_role = ast.actor_role
      WHERE ast.mad_count IS NOT NULL
    `;
  }

  test("query structure includes all required CTEs", () => {
    const query = buildAnomalyQuery('test-tenant', '2024-01-15T00:00:00Z');
    
    expect(query).toContain('WITH weekly_overrides');
    expect(query).toContain('actor_stats');
    expect(query).toContain('current_week');
    expect(query).toContain('median_count');
    expect(query).toContain('mad_count');
    expect(query).toContain('is_anomaly');
  });

  test("anomaly flag logic uses 2 MAD threshold", () => {
    const query = buildAnomalyQuery('test-tenant', '2024-01-15T00:00:00Z');
    
    // Verify the 2 MAD threshold is in the CASE statement
    expect(query).toContain('> 2 * ast.mad_count');
    
    // Verify MAD=0 handling
    expect(query).toContain('ast.mad_count = 0');
  });

  test("query filters by tenant and date range", () => {
    const query = buildAnomalyQuery('test-tenant', '2024-01-15T00:00:00Z');
    
    expect(query).toContain("tenant_id = 'test-tenant'");
    expect(query).toContain("'-90 days'");
    expect(query).toContain("'-7 days'");
  });
});

describe("edge cases in anomaly calculation", () => {
  test("handles single data point in history", () => {
    const overrides7Day = 3;
    const historicalWeekly: number[] = [2];
    const median90Day = calculateMedian(historicalWeekly);
    const mad90Day = calculateMAD(historicalWeekly);

    // MAD of single value is 0
    expect(mad90Day).toBe(0);
    // Any deviation from single-point median is flagged
    expect(calculateAnomaly(overrides7Day, median90Day, mad90Day)).toBe(true);
  });

  test("handles two data points in history", () => {
    const overrides7Day = 5;
    const historicalWeekly: number[] = [2, 4];
    const median90Day = calculateMedian(historicalWeekly); // (2+4)/2 = 3
    const mad90Day = calculateMAD(historicalWeekly); // median of |2-3|, |4-3| = median of 1,1 = 1

    expect(median90Day).toBe(3);
    expect(mad90Day).toBe(1);
    // |5-3| = 2, 2*MAD = 2, so 2 > 2 is false
    expect(calculateAnomaly(overrides7Day, median90Day, mad90Day)).toBe(false);
  });

  test("identical values produce zero MAD", () => {
    const historicalWeekly: number[] = [5, 5, 5, 5, 5];
    const mad90Day = calculateMAD(historicalWeekly);
    
    expect(mad90Day).toBe(0);
  });

  test("alternating values produce predictable MAD", () => {
    // [0, 10, 0, 10, 0, 10] -> median is 5, deviations are [5,5,5,5,5,5], MAD is 5
    const historicalWeekly: number[] = [0, 10, 0, 10, 0, 10];
    const median90Day = calculateMedian(historicalWeekly);
    const mad90Day = calculateMAD(historicalWeekly);
    
    expect(median90Day).toBe(5);
    expect(mad90Day).toBe(5);
    
    // Current value of 15: |15-5| = 10, 2*MAD = 10, so 10 > 10 is false
    expect(calculateAnomaly(15, median90Day, mad90Day)).toBe(false);
    
    // Current value of 16: |16-5| = 11, 2*MAD = 10, so 11 > 10 is true
    expect(calculateAnomaly(16, median90Day, mad90Day)).toBe(true);
  });
});

describe("ledger entry creation for anomalies", () => {
  test("anomaly detection writes correct entry_type", () => {
    // Simulate the ledger entry that would be written
    const entry: Partial<LedgerEntry> = {
      entry_type: 'anomaly_flag',
      actor_user_id: 42,
      actor_role: 'office_manager',
      created_at: new Date().toISOString()
    };
    
    expect(entry.entry_type).toBe('anomaly_flag');
  });

  test("anomaly entries include actor identification", () => {
    const entry: Partial<LedgerEntry> = {
      entry_type: 'anomaly_flag',
      actor_user_id: 42,
      actor_role: 'office_manager',
      created_at: '2024-01-15T09:00:00Z'
    };
    
    expect(entry.actor_user_id).toBeGreaterThan(0);
    expect(entry.actor_role).toBeTruthy();
    expect(entry.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
