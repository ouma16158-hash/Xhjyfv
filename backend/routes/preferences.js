const { Hono } = require("hono");
const router = new Hono();
const { savePreferences, getCurrentPreferences, updatePreferences } = require("../controller/userController");

router.post("/user/preferences", savePreferences);
router.get("/user/current-preferences", getCurrentPreferences);
router.put("/user/update-preferences", updatePreferences);

module.exports = router;
