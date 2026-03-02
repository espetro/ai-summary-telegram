import { boss } from './index';

export async function registerSchedules() {
  // Register global digest fanout: Sundays at 10 AM UTC
  await boss.schedule('digest-fanout', '0 10 * * 0', {});
}

// Function to register per-user queue notification schedule
// Called when user updates preferences
export async function registerUserNotifySchedule(userId: string, cronExpression: string) {
  const scheduleName = `notify-${userId}`;

  // Remove existing schedule if any
  await boss.unschedule(scheduleName);

  // Register new schedule
  await boss.schedule(`notify-${scheduleName}`, cronExpression, { userId });
}

// Function to remove user notification schedule
export async function removeUserNotifySchedule(userId: string) {
  const scheduleName = `notify-${userId}`;
  await boss.unschedule(scheduleName);
}
