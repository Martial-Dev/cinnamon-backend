const User = require('../models/User');

exports.createUser = async (req, res) => {
    const { firstName, lastName, email, username, password, address, postalCode, contactNo } = req.body;

    try {
        const newUser = new User({
            first_name: firstName,
            last_name: lastName,
            email,
            username,
            password, // Ensure to hash the password before saving
            address,
            postal_code: postalCode,
            contact_no: contactNo,
        });

        const savedUser = await newUser.save();
        res.status(201).json({ message: "User added successfully", user_id: savedUser._id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getUserById = async (req, res) => {
    const userId = req.params.id;

    try {
        const user = await User.findById(userId).select('-password'); // Exclude password from response
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateUser = async (req, res) => {
    const userId = req.params.id;
    const updates = req.body;

    try {
        const updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true, runValidators: true });
        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }
        res.json({ message: "User updated successfully", user: updatedUser });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};