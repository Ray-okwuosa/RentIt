const mongoose = require("mongoose");
const Category = require("../models/Category");
const Equipment = require("../models/Equipment");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const pick = require("../utils/pick");

// GET /api/categories            -> flat list
// GET /api/categories?tree=true  -> nested: top-level categories with a `children` array
exports.getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort({ name: 1 }).lean();

  if (req.query.tree === "true") {
    const byId = new Map(categories.map((c) => [c._id.toString(), { ...c, children: [] }]));
    const roots = [];
    byId.forEach((node) => {
      const parent = node.parent && byId.get(node.parent.toString());
      if (parent) parent.children.push(node);
      else roots.push(node);
    });
    return res.json({ status: "success", results: roots.length, data: { categories: roots } });
  }

  res.json({ status: "success", results: categories.length, data: { categories } });
});

// POST /api/categories  (admin)
exports.createCategory = asyncHandler(async (req, res) => {
  const data = pick(req.body, ["name", "parent", "icon"]);

  if (data.parent) {
    if (!mongoose.isValidObjectId(data.parent) || !(await Category.exists({ _id: data.parent }))) {
      throw new AppError("Parent category not found.", 400);
    }
  } else {
    data.parent = null;
  }

  const category = await Category.create(data);
  res.status(201).json({ status: "success", data: { category } });
});

// PATCH /api/categories/:id  (admin)
exports.updateCategory = asyncHandler(async (req, res) => {
  const updates = pick(req.body, ["name", "parent", "icon", "isActive"]);

  if (updates.parent) {
    if (updates.parent === req.params.id) {
      throw new AppError("A category cannot be its own parent.", 400);
    }
    if (!mongoose.isValidObjectId(updates.parent) || !(await Category.exists({ _id: updates.parent }))) {
      throw new AppError("Parent category not found.", 400);
    }
  }

  const category = await Category.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!category) throw new AppError("Category not found.", 404);

  res.json({ status: "success", data: { category } });
});

// DELETE /api/categories/:id  (admin) - blocked while sub-categories or equipment use it
exports.deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw new AppError("Category not found.", 404);

  const [hasChildren, hasEquipment] = await Promise.all([
    Category.exists({ parent: category._id }),
    Equipment.exists({ category: category._id }),
  ]);
  if (hasChildren || hasEquipment) {
    throw new AppError(
      "This category still has sub-categories or equipment. Deactivate it instead (PATCH isActive: false).",
      409
    );
  }

  await category.deleteOne();
  res.status(204).send();
});