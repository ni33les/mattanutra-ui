import { releaseExpiredReservations } from "@/lib/task-service";
import { enqueueMissingProductRecommendationsForReadyPlans } from "@/lib/task-worker";

const TASK_MAINTENANCE_INTERVAL_MS = 15_000;
const EXPIRED_RESERVATION_SWEEP_BATCH_LIMIT = 3;

const globalSweep = globalThis as typeof globalThis & {
  mattanutraTaskMaintenanceTimer?: ReturnType<typeof setInterval>;
  mattanutraTaskMaintenanceInflight?: Promise<void> | null;
};

async function runTaskMaintenanceTick() {
  if (globalSweep.mattanutraTaskMaintenanceInflight) {
    return;
  }

  globalSweep.mattanutraTaskMaintenanceInflight = (async () => {
    try {
      const released = await releaseExpiredReservations({
        batchLimit: EXPIRED_RESERVATION_SWEEP_BATCH_LIMIT
      });

      if (released > 0) {
        console.info("[tasks:maintenance] expired reservation sweep", {
          released
        });
      }

      const enqueued = await enqueueMissingProductRecommendationsForReadyPlans({
        limit: 10
      });

      if (enqueued.queued > 0) {
        console.info("[tasks:maintenance] missing product recommendations", enqueued);
      }
    } catch (error) {
      console.warn("[tasks:maintenance] tick failed", error);
    }
  })().finally(() => {
    globalSweep.mattanutraTaskMaintenanceInflight = null;
  });

  await globalSweep.mattanutraTaskMaintenanceInflight;
}

export function startTaskMaintenanceLoop() {
  if (globalSweep.mattanutraTaskMaintenanceTimer) {
    return;
  }

  const timer = setInterval(() => {
    void runTaskMaintenanceTick();
  }, TASK_MAINTENANCE_INTERVAL_MS);
  timer.unref?.();
  globalSweep.mattanutraTaskMaintenanceTimer = timer;
  void runTaskMaintenanceTick();
}
