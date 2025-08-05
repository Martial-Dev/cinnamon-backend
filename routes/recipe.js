const express = require("express");
const router = express.Router();
const upload = require("../middleware/Multer");
const Recipe = require("../models/recipe");
const uploadImageToFirebase = require("../utils/firebase");
const checkAuth = require("../middleware/check-auth"); // Optional: use for admin routes

// CREATE a new recipe
router.post("/", checkAuth, upload.single("image"), async (req, res) => {
  try {
    let imageUrl = "";
    if (req.file) {
      imageUrl = await uploadImageToFirebase(
        req.file.buffer,
        req.file.originalname,
        "recipes"
      );
    }
    const { title, description, ingredients, steps } = req.body;
    const recipe = new Recipe({
      title,
      description,
      imageUrl,
      ingredients: ingredients
        ? ingredients.split(",").map((i) => i.trim())
        : [],
      steps: steps ? steps.split(";").map((s) => s.trim()) : [],
      createdBy: req.user ? req.user.email : undefined,
    });
    await recipe.save();
    res.status(201).json({ message: "Recipe created successfully", recipe });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// READ all recipes
router.get("/", async (req, res) => {
  try {
    const recipes = await Recipe.find().sort({ createdAt: -1 });
    res.status(200).json(recipes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// READ a specific recipe by ID
router.get("/:id", async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }
    res.status(200).json(recipe);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE a recipe by ID
router.put("/:id", checkAuth, upload.single("image"), async (req, res) => {
  try {
    let updateData = {
      title: req.body.title,
      description: req.body.description,
      ingredients: req.body.ingredients
        ? req.body.ingredients.split(",").map((i) => i.trim())
        : [],
      steps: req.body.steps
        ? req.body.steps.split(";").map((s) => s.trim())
        : [],
    };
    if (req.file) {
      updateData.imageUrl = await uploadImageToFirebase(
        req.file.buffer,
        req.file.originalname,
        "recipes"
      );
    }
    const recipe = await Recipe.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    });
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }
    res.status(200).json({ message: "Recipe updated successfully", recipe });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE a recipe by ID
router.delete("/:id", checkAuth, async (req, res) => {
  try {
    const recipe = await Recipe.findByIdAndDelete(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }
    res.status(200).json({ message: "Recipe deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
