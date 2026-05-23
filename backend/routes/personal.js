const { Hono } = require("hono");
const router = new Hono();
const { savePersonalInfo } = require("../controller/userController");

router.post("/personal", savePersonalInfo);

module.exports = router;
