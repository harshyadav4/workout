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

export function dateKey(date = new Date()) {
  return date.toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata"
  });
}

export function todayKey() {
  return dateKey();
}

export function weekdayIndex(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Kolkata"
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
        weekday: "short",
        timeZone: "Asia/Kolkata"
      }).format(date),
      key: dateKey(date),
      dayNumber: new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        timeZone: "Asia/Kolkata"
      }).format(date),
      monthLabel: new Intl.DateTimeFormat("en-US", {
        month: "short",
        timeZone: "Asia/Kolkata"
      }).format(date)
    };
  });
}
