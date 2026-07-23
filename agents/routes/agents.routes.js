const { Router } = require("express");

const {
  getAllAgents,
  findAgentByCode,
  updateAgentData,
  loginAgent,
  getAgentData,
  getIcompleteDocs,
  getcompleteDocs,
  regAgent,
} = require("../controller/agents.controller");

const router = Router();

router.get("/completeDoc/:code", getcompleteDocs);
router.get("/incompleteDoc/:code", getIcompleteDocs);

router.get("/agentsData", getAllAgents); //done
router.get("/myData/:code", getAgentData); //done
router.post("/findAgent", findAgentByCode); //done
router.put("/updateagent", updateAgentData); //done
router.post("/loginAgent", loginAgent); //done
router.post("/register", regAgent); //done


//ADD agent RSA and Cash Volume


module.exports = router;
