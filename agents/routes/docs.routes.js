const { Router } = require("express");

const {
  addDocs,
  updateDocs,
  updateDocsAdmin,
  getcompleteDocs,
  getIcompleteDocs,
} = require("../controller/docs.controller");

const router = Router();

router.post("/addDocs", addDocs); //not in use
router.get("/updatedocs/:id", updateDocs);
router.get("/updatedocsadmin/:id", updateDocsAdmin);

router.get("/completedocsfiles", getcompleteDocs);
router.get("/incompletedocsfiles", getIcompleteDocs);

module.exports = router;
