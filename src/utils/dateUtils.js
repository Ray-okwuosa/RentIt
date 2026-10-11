const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

// Accept date-only strings in YYYY-MM-DD format.
// Store and compare dates consistently at UTC midnight.
export const parseDate = (dateString) => {
  if (
    typeof dateString !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateString)
  ) {
    return new Date(NaN);
  }

  const date = new Date(`${dateString}T00:00:00.000Z`);

  // JavaScript can normalize impossible dates, such as February 30.
  // Reject them instead of silently changing the requested date.
  if (
    !isValidDate(date) ||
    date.toISOString().slice(0, 10) !== dateString
  ) {
    return new Date(NaN);
  }

  return date;
};

export const isValidDate = (date) => {
  return date instanceof Date && !Number.isNaN(date.getTime());
};

export const getTodayUTC = () => {
  const now = new Date();

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    )
  );
};

export const validateDateRange = (startDate, endDate) => {
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return {
      valid: false,
      message: "Dates must be valid and use YYYY-MM-DD format",
    };
  }

  const today = getTodayUTC();

  if (startDate < today) {
    return {
      valid: false,
      message: "Start date cannot be in the past",
    };
  }

  if (endDate < startDate) {
    return {
      valid: false,
      message: "End date cannot be before start date",
    };
  }

  return { valid: true };
};

// Both the start and end dates are included in the rental.
export const calculateRentalDays = (startDate, endDate) => {
  const difference = endDate.getTime() - startDate.getTime();

  return difference / ONE_DAY_IN_MS + 1;
};

// Sharing even one date means the periods overlap.
export const datesOverlap = (
  existingStart,
  existingEnd,
  requestedStart,
  requestedEnd
) => {
  return (
    existingStart <= requestedEnd &&
    existingEnd >= requestedStart
  );
};
