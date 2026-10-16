const requireAdmin = (req, res, next) => {
  if (req.userData?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  return next();
};

module.exports = requireAdmin;
