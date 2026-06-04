try {
  const electron = require("electron");
  console.log("type=" + typeof electron);
  console.log("keys=" + Object.keys(electron).slice(0,10).join(","));
  console.log("hasApp=" + Boolean(electron && electron.app));
} catch (error) {
  console.error(error.message);
}
process.exit(0);
