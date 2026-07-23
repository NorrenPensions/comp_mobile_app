const { Router } = require("express");

const {
  regUser,
  updateUserStatus,
  getAllUsers,
  getUser,
  getAllUsersByAdmin,
} = require("../controller/users.controller");

const router = Router();
//Agents
router.post("/addUser", regUser);
router.get("/updateUser/:nin", updateUserStatus);
router.get("/getusers/:code", getAllUsers);
router.get("/getuser/:nin", getUser);

// Admin query area
router.get("/getuseradmin/:nin", getUser);
router.get("/getusersadmin", getAllUsersByAdmin);

module.exports = router;
