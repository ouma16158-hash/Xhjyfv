const { Hono } = require("hono");
const router = new Hono();
const statusController = require("../controller/statusController");

router.get("/user/status", statusController.getUserStatus);

module.exports = router;
