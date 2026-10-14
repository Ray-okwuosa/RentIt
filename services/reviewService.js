const mongoose = require("mongoose");
const Review = require("../models/Review");
const Equipment = require("../models/Equipment");
const User = require("../models/User");

const round2 = (n) => Math.round(n * 100) / 100;

// Aggregation pipelines do not cast ids for you, so convert them first
const oid = (value) => new mongoose.Types.ObjectId(String(value));

// Average, count and 1-5 star breakdown of the visible (not hidden) reviews matching `match`.
// `match` values must already be ObjectIds, e.g. { equipment: oid(id) }.
const summarize = async (match) => {
  const rows = await Review.aggregate([
    { $match: { ...match, isHidden: false } },
    { $group: { _id: "$rating", count: { $sum: 1 } } },
  ]);

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let total = 0;
  for (const row of rows) {
    distribution[row._id] = row.count;
    count += row.count;
    total += row._id * row.count;
  }

  return { average: count ? round2(total / count) : 0, count, distribution };
};

// Recomputes the stored rating on the equipment and on its owner from the reviews themselves.
// Call after a review is created, edited, deleted or hidden/unhidden. Recomputing (instead of
// adjusting a running total) means the numbers can never drift.
const recalculateRatings = async ({ equipment, owner }) => {
  const [forEquipment, forOwner] = await Promise.all([
    summarize({ equipment: oid(equipment) }),
    summarize({ owner: oid(owner) }),
  ]);

  await Promise.all([
    Equipment.updateOne(
      { _id: equipment },
      { "rating.average": forEquipment.average, "rating.count": forEquipment.count }
    ),
    User.updateOne({ _id: owner }, { "rating.average": forOwner.average, "rating.count": forOwner.count }),
  ]);
};

module.exports = { oid, summarize, recalculateRatings };