const express = require("express");
const { protect, restrictTo } = require("../middleware/auth");
const {
  createEquipment,
  getEquipments,
  getMyEquipments,
  getEquipment,
  updateEquipment,
  deleteEquipment,
} = require("../controllers/equipmentController");

const router = express.Router();

// Public
router.get("/", getEquipments);

// Owner / admin (must come before "/:id")
router.get("/mine", protect, restrictTo("owner", "admin"), getMyEquipments);
router.post("/", protect, restrictTo("owner", "admin"), createEquipment);

// Public detail, then owner/admin changes
router.get("/:id", getEquipment);
router.patch("/:id", protect, restrictTo("owner", "admin"), updateEquipment);
router.delete("/:id", protect, restrictTo("owner", "admin"), deleteEquipment);

module.exports = router;