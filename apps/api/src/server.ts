import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

app.listen(config.port, config.host, () => {
  console.info(
    `Survey Portal API listening at http://${config.host}:${config.port} (${config.runEnv})`
  );
});
