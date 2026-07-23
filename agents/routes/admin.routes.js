const { Router } = require("express");

const {
  loginAdmin,
  updateAdminData,
  updatePass,
  adminData,
  regAdmin,
  adminUserData,
} = require("../controller/admin.controller");

const router = Router();

router.get("/adminData", adminData);
router.get("/adminData/:id", adminUserData);
router.put("/updateAdminadata", updateAdminData);

router.put("/updatepass", updatePass);

router.post("/loginAdmin", loginAdmin);
router.post("/regadmin", regAdmin);

module.exports = router;
