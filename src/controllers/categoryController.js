import Category from "../models/Category.js";

// GET ALL CATEGORIES
export const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });

    return res.status(200).json({
      message: "Categories fetched successfully",
      count: categories.length,
      categories,
    });
  } catch (error) {
    console.error("Get categories error:", error.message);

    return res.status(500).json({
      message: "Failed to fetch categories",
    });
  }
};
