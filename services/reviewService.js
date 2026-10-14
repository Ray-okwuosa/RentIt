const mongoose = require("mongoose");
const Review = require("../models/Review");
const Equipment = require("../models/Equipment");
const User = require("../models/User");

const round2 = (n) => Math.round(n * 100) / 100;

// Aggregation pipelines do not cast ids for you, so convert them first
const oid = (value) => new mongoose.Types.ObjectId(String(value));

const STARS = [1, 2, 3, 4, 5];

// Summary of the visible (not hidden) reviews matching `match`, e.g. { owner: oid(id) }:
//   average      overall rating = average of the three category averages
//   categories   average communication, reliability and equipment rating
//   distribution how many reviews round to 1, 2, 3, 4 and 5 stars overall
const summarize = async (match) => {
  const [row] = await Review.aggregate([
    { $match: { ...match, isHidden: false } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        communication: { $avg: "$communicationRating" },
        reliability: { $avg: "$reliabilityRating" },
        equipment: { $avg: "$equipmentRating" },
        ...Object.fromEntries(
          STARS.map((n) => [`star${n}`, { $sum: { $cond: [{ $eq: [{ $round: ["$rating", 0] }, n] }, 1, 0] } }])
        ),
      },
    },
  ]);

  if (!row) {
    return {
      average: 0,
      count: 0,
      categories: { communication: 0, reliability: 0, equipment: 0 },
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  return {
    average: round2((row.communication + row.reliability + row.equipment) / 3),
    count: row.count,
    categories: {
      communication: round2(row.communication),
      reliability: round2(row.reliability),
      equipment: round2(row.equipment),
    },
    distribution: Object.fromEntries(STARS.map((n) => [n, row[`star${n}`]])),
  };
};

// Recomputes the stored ratings from the reviews themselves. Call after a review is created,
// edited, deleted or hidden/unhidden. Recomputing (instead of adjusting a running total)
// means the numbers can never drift.
//   Owner     -> overall rating (average of communication, reliability and equipment)
//   Equipment -> its equipment rating only, since communication and reliability are about the owner
const recalculateRatings = async ({ equipment, owner }) => {
  const [forEquipment, forOwner] = await Promise.all([
    summarize({ equipment: oid(equipment) }),
    summarize({ owner: oid(owner) }),
  ]);

  await Promise.all([
    Equipment.updateOne(
      { _id: equipment },
      { "rating.average": forEquipment.categories.equipment, "rating.count": forEquipment.count }
    ),
    User.updateOne({ _id: owner }, { "rating.average": forOwner.average, "rating.count": forOwner.count }),
  ]);
};

module.exports = { oid, summarize, recalculateRatings };