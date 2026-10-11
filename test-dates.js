
import {
  parseDate,
  validateDateRange,
  calculateRentalDays,
  datesOverlap,
} from "./src/utils/dateUtils.js";

const start = parseDate("2026-10-15");
const end = parseDate("2026-10-17");

console.log("Valid date range:", validateDateRange(start, end));
console.log("Rental days:", calculateRentalDays(start, end));

console.log(
  "Shared date overlaps:",
  datesOverlap(
    parseDate("2026-10-15"),
    parseDate("2026-10-17"),
    parseDate("2026-10-17"),
    parseDate("2026-10-19")
  )
);

console.log(
  "Rejects impossible date:",
  Number.isNaN(parseDate("2026-02-30").getTime())
);

console.log(
  "Rejects timestamp:",
  Number.isNaN(parseDate("2026-10-15T12:00:00Z").getTime())
);

console.log(
  "February 30 parsed as:",
  parseDate("2026-02-30")
);

console.log(
  "February 30 is invalid:",
  Number.isNaN(parseDate("2026-02-30").getTime())
);

console.log(
  "Timestamp parsed as:",
  parseDate("2026-10-15T12:00:00Z")
);

console.log(
  "Timestamp is invalid:",
  Number.isNaN(parseDate("2026-10-15T12:00:00Z").getTime())
);