const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");
const checkAuth = require("../middleware/check-auth");

// Route to add an item to the cart
router.post("/", checkAuth, cartController.addToCart);

// Route to get all items in the cart
router.get("/", cartController.getCartItems);

// Route to delete an item from the cart
router.delete("/:id", cartController.deleteCartItem);

module.exports = router;