const { DatabaseSync } = require("node:sqlite");

console.log("STEP 1");

const db = new DatabaseSync(":memory:");

console.log("DB SUCCESS");

db.close();