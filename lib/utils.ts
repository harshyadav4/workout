import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatVolume(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Every date in this app is a local calendar day, so no `timeZone` option is
 * passed anywhere below: `Intl` already resolves to the runtime's own zone.
 * These six sites were pinned to "Asia/Kolkata", which put a user in New York
 * a day ahead of their own calendar for five hours out of every twenty-four.
 */
export function dateKey(date = new Date()) {
  return date.toLocaleDateString("en-CA");
}

export function todayKey() {
  return dateKey();
}

export function weekdayIndex(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short"
  }).formatToParts(date);
  const day = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
}

export function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfWeek(date = new Date()) {
  return addDays(date, -weekdayIndex(date));
}

export function buildWeekDates(weekOffset = 0) {
  const base = addDays(startOfWeek(), weekOffset * 7);

  return Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(base, index);
    return {
      date,
      dayIndex: weekdayIndex(date),
      dayLabel: new Intl.DateTimeFormat("en-US", {
        weekday: "short"
      }).format(date),
      key: dateKey(date),
      dayNumber: new Intl.DateTimeFormat("en-US", {
        day: "numeric"
      }).format(date),
      monthLabel: new Intl.DateTimeFormat("en-US", {
        month: "short"
      }).format(date)
    };
  });
}
